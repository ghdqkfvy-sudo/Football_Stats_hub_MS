/**
 * 선수 헤드샷 — 어느 소스를 쓸지, 그리고 그 소스를 어떻게 아껴 쓸지.
 *
 * ⚠️ 왜 새로 만들었나 (2026-09-17)
 * 배포된 사이트를 열어 보면 **레알 마드리드만** 제대로 된 헤드샷이 나왔다.
 * 스냅샷 파일을 세어 보니 원인이 분명했다 (사진 출처별 선수 수):
 *
 *   real-madrid  TheSportsDB 25 / 위키 0
 *   chelsea      TheSportsDB  6 / 위키 12
 *   man-united   TheSportsDB  0 / 위키 20
 *   tottenham    TheSportsDB  0 / 위키 23
 *   newcastle    TheSportsDB  0 / 위키 19
 *   korea        TheSportsDB  0 / 위키 38
 *
 * TEAMS 처리 순서가 real-madrid → chelsea → man-united → tottenham →
 * newcastle → korea 다. 즉 **먼저 처리한 팀에서 다 써 버리고 그 뒤로는
 * 전부 실패**한 것이다 — TheSportsDB 무료 키(`3`)의 요청 한도다.
 * (같은 이름들을 개별로 조회하면 전부 컷아웃이 잘 나온다. 데이터가
 *  없는 게 아니라 한꺼번에 160번을 때려서 막힌 것이다.)
 *
 * 폴백인 위키백과 대표 이미지는 **헤드샷이 아니다** — 250px 경기 사진이라
 * 44px 원형 칩에 넣으면 얼굴이 아니라 잔디와 유니폼이 보인다. 그래서
 * "사진이 있는데 사람을 알아볼 수 없는" 상태가 됐다.
 *
 * 그래서 두 가지를 고친다.
 *  1) TheSportsDB 는 **한 번에 하나씩, 간격을 두고** 부른다(rateLimiter).
 *     429 가 나면 물러서고, 계속 막히면 이번 회차는 포기한다(회로 차단).
 *  2) 사진에 **출처 등급**을 붙여 저장하고, 지난 회차 값을 이어받을 때
 *     **등급이 같거나 높을 때만** 덮는다. 그래서 위키 사진이 한 번
 *     박히면 영원히 남던 문제가 없어지고, 회차를 거듭할수록 컷아웃으로
 *     올라간다(한 번에 다 못 받아도 결국 채워진다).
 */

/** 출처 등급 — 숫자가 클수록 좋은 사진이다 */
export const PHOTO_RANK = { cutout: 4, thumb: 3, espn: 2, wiki: 1 };

export const rankOf = (kind) => PHOTO_RANK[kind] ?? 0;

/**
 * 새 후보로 갈아탈 것인가.
 * 같은 등급이면 갈아타지 않는다 — 이미 있는 주소를 괜히 흔들 이유가 없다.
 */
export function betterPhoto(current, candidate) {
  if (!candidate?.url) return current ?? null;
  if (!current?.url) return candidate;
  return rankOf(candidate.kind) > rankOf(current.kind) ? candidate : current;
}

/** 주소의 출처 등급을 되짚는다 (지난 회차 파일에 kind 가 없을 때) */
export function kindFromUrl(url) {
  const u = String(url ?? '');
  if (!u) return undefined;
  if (u.includes('thesportsdb.com')) return u.includes('/cutout/') ? 'cutout' : 'thumb';
  if (u.includes('espncdn.com')) return 'espn';
  if (u.includes('wikimedia.org') || u.includes('wikipedia.org')) return 'wiki';
  return 'thumb';
}

/**
 * 호출을 한 줄로 세우고 최소 간격을 지킨다.
 * `limit` 회 연속 실패하면 회로를 열어 그 뒤 호출은 곧바로 건너뛴다
 * (막힌 API 를 200번 더 때려 봐야 워크플로만 길어진다).
 */
export function rateLimiter({ minIntervalMs = 1200, breakAfter = 8 } = {}) {
  let chain = Promise.resolve();
  let last = 0;
  let strikes = 0;
  let open = false;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  return {
    get broken() { return open; },
    reset() { strikes = 0; open = false; },
    /** @param fn () => Promise<{ok:boolean, value:any}> */
    run(fn) {
      if (open) return Promise.resolve(undefined);
      const task = chain.then(async () => {
        if (open) return undefined;
        const wait = minIntervalMs - (Date.now() - last);
        if (wait > 0) await sleep(wait);
        last = Date.now();
        const res = await fn();
        if (res?.ok) {
          strikes = 0;
        } else {
          strikes++;
          if (strikes >= breakAfter) open = true;
        }
        return res?.value;
      });
      // 다음 작업은 이 작업이 끝난 뒤에 — 실패해도 줄이 끊기지 않게 한다
      chain = task.then(() => undefined, () => undefined);
      return task;
    },
  };
}

/**
 * 같은 이름의 축구 선수가 여럿이면 현 소속팀이 맞는 쪽을 고른다.
 * (동명이인에게 엉뚱한 얼굴을 박는 것이 사진이 없는 것보다 나쁘다)
 */
export function pickSportsdbPlayer(list, club, normName) {
  const players = (Array.isArray(list) ? list : []).filter(
    (x) => String(x?.strSport ?? '') === 'Soccer',
  );
  if (!players.length) return null;
  const want = normName(club);
  if (!want) return players[0];
  return (
    players.find((x) => normName(x?.strTeam).includes(want)) ??
    players.find((x) => want.includes(normName(x?.strTeam))) ??
    players[0]
  );
}

/**
 * HEAD 결과를 어떻게 볼 것인가.
 *
 * ⚠️ 예전에는 `res.ok` 가 아니면 주소를 버렸다. 그런데 CDN 은 HEAD 를
 * 405/403 으로 막기도 하고, 러너에서 네트워크가 한 번 튀기도 한다.
 * 그때 **완벽한 주소를 버리고** 위키 사진으로 내려갔다.
 * 파일이 없다는 확실한 신호(404/410)일 때만 버린다.
 */
export function urlVerdict(status) {
  if (status === 404 || status === 410) return 'gone';
  return 'keep';
}
