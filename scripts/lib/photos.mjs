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

/* ── 확인된 오답 ─────────────────────────────────────────
 *
 * 한 번 "이 사진은 저 사람이 아니다" 로 밝혀진 파일은 **어떤 경로로도**
 * 다시 들어오면 안 된다. 규칙을 조이는 것만으로는 부족하다는 걸 두 번
 * 배웠다 — 이어받기가 도로 물어 오고(등급만 보니까), 사고 복구 스크립트가
 * 옛 커밋에서 도로 끌어왔다.
 *
 * 키는 이미지 파일 이름이다. 주소 호스트가 바뀌어도(thesportsdb.com →
 * r2.thesportsdb.com) 파일 이름은 그대로였다.
 */
export const BAD_PHOTO_FILES = new Set([
  /* Sávio(토트넘, 2003년생) 자리에 박혀 있던 사진.
     실제 주인은 하비에르 사비올라(1981년생, 은퇴) — 이름 검색이 "Savio" 로
     사비올라를 물어 온 것이다. 화면에서도 마흔 줄 남자 얼굴이 떴다. */
  '3100367.png',
]);

/** 이 주소가 확인된 오답인가 */
export function isBadPhoto(url) {
  const file = String(url ?? '').split('?')[0].split('/').pop();
  return !!file && BAD_PHOTO_FILES.has(file);
}

/** 출처 등급 — 숫자가 클수록 좋은 사진이다 */
export const PHOTO_RANK = { cutout: 4, thumb: 3, espn: 2, wiki: 1 };

export const rankOf = (kind) => PHOTO_RANK[kind] ?? 0;

/**
 * 새 후보로 갈아탈 것인가.
 * 같은 등급이면 갈아타지 않는다 — 이미 있는 주소를 괜히 흔들 이유가 없다.
 */
export function betterPhoto(current, candidate) {
  /* 오답은 후보로도, 이어받기로도 통과시키지 않는다.
     사진이 바뀌는 길은 전부 이 함수를 지나므로 여기 한 곳이면 된다. */
  const cur = current?.url && !isBadPhoto(current.url) ? current : null;
  const cand = candidate?.url && !isBadPhoto(candidate.url) ? candidate : null;
  if (!cand) return cur;
  if (!cur) return cand;
  return rankOf(cand.kind) > rankOf(cur.kind) ? cand : cur;
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

/* ── 생년으로 동명이인 가리기 ────────────────────────────
 *
 * ⚠️ 소속팀만으로는 부족하다. 실제로 걸린 두 사례:
 *   · TheSportsDB 의 유일한 "Reece James" 는 셰필드 웬즈데이 1993년생
 *   · 위키백과 "Reece James" 검색의 **첫 결과**도 1993년생 쪽이다
 *     (첼시의 1999년생은 두 번째)
 * 이름도 같고 국적도 같고 포지션도 같다. 가를 수 있는 건 나이뿐이다.
 *
 * ESPN 팀 로스터가 age 를 준다(첼시 28명 중 26명). 그걸 기준으로
 * 후보의 생년이 말이 되는지 본다. 생일이 지났는지 모르므로 두 해를 허용한다.
 */

/** 'YYYY-MM-DD' · 'born 1999' · 1999 등에서 연도를 뽑는다 */
export function birthYearOf(v) {
  const m = String(v ?? '').match(/(18|19|20)\d{2}/);
  return m ? Number(m[0]) : undefined;
}

/**
 * 나이와 생년이 맞아떨어지는가.
 * 판단할 근거가 없으면(둘 중 하나가 없으면) **막지 않는다** — 확인 못 한 것과
 * 틀린 것은 다르다. 근거가 있을 때만 거른다.
 */
export function plausibleBirthYear(birthYear, age, today = new Date()) {
  if (!birthYear || !age) return true;
  const y = today.getUTCFullYear();
  // 생일 전이면 y-age-1, 지났으면 y-age
  return birthYear === y - age || birthYear === y - age - 1;
}

/**
 * 이름 검색 결과에서 그 선수를 고른다 — **소속팀이 맞아야 한다.**
 *
 * ⚠️ 예전에는 소속팀이 안 맞으면 `players[0]` 로 떨어졌다. 그래서 리스
 * 제임스(첼시) 자리에 **셰필드 웬즈데이의 동명이인**(1993년생) 얼굴이
 * 박혔다. 이름만 같은 다른 사람이라 이름 검사로는 절대 걸러지지 않는다.
 *
 * 이 프로젝트의 원칙 그대로다 — 엉뚱한 얼굴이 뜨는 것이 사진이 없는 것보다
 * 나쁘다. 소속팀을 확인할 수 없으면 사진을 포기한다(등번호 배지로 떨어진다).
 * 이적 직후라 TheSportsDB 의 소속팀이 낡은 경우는 팀 로스터 조회
 * (sportsdbRoster)가 먼저 잡아 준다.
 */
export function pickSportsdbPlayer(list, club, normName, age, today) {
  const players = (Array.isArray(list) ? list : [])
    .filter((x) => String(x?.strSport ?? '') === 'Soccer')
    /* 나이가 어긋나면 동명이인이다 (리스 제임스 1993 vs 1999) */
    .filter((x) => plausibleBirthYear(birthYearOf(x?.dateBorn), age, today));
  if (!players.length) return null;
  const want = normName(club);
  if (!want) return null;                 // 소속팀을 모르면 고르지 않는다
  return (
    players.find((x) => normName(x?.strTeam).includes(want)) ??
    players.find((x) => want.includes(normName(x?.strTeam))) ??
    null
  );
}

/**
 * 팀 로스터 응답에서 이름으로 선수를 찾는다.
 *
 * 팀이 확정된 목록 안에서 찾으므로 동명이인 위험이 없고, 표기 차이에
 * 관대해도 안전하다 — ESPN 은 "João Pedro" 를 그대로 주지만 이름 검색은
 * 발음기호 때문에 못 찾는 경우가 있다(실측: 검색은 포르투갈 3부 선수만
 * 돌려주고, 첼시 로스터에는 컷아웃까지 있는 João Pedro 가 들어 있었다).
 */
export function matchInRoster(list, name, normName, age, today) {
  const want = normName(name);
  if (!want) return null;
  const players = (Array.isArray(list) ? list : [])
    .filter((x) => plausibleBirthYear(birthYearOf(x?.dateBorn), age, today));
  const byNorm = (x) => normName(x?.strPlayer);

  const exact = players.filter((x) => byNorm(x) === want);
  if (exact.length === 1) return exact[0];

  /* 한쪽이 다른 쪽을 포함하는 경우 (ESPN "Hato" ↔ TSDB "Jorrel Hato").
     후보가 둘 이상이면 포기한다 — 같은 팀에도 형제·동명이인이 있다. */
  const loose = players.filter((x) => {
    const n = byNorm(x);
    return n && (n.includes(want) || want.includes(n));
  });
  if (loose.length === 1) return loose[0];

  /* 마지막으로 성(姓)만 비교 — 단 **찾는 이름이 두 토큰 이상일 때만** 한다.
     한 단어로 물어보면 그게 이름인지 성인지 알 수 없다: "Pedro" 하나로
     João Pedro 를 성 비교로 집으면, ESPN 이 Pedro Neto 를 뜻했을 때
     엉뚱한 얼굴이 박힌다. */
  if (want.split(' ').filter(Boolean).length < 2) return null;
  const last = (n) => n.split(' ').filter(Boolean).slice(-1)[0] ?? '';
  const bySurname = players.filter((x) => last(byNorm(x)) === last(want));
  return bySurname.length === 1 ? bySurname[0] : null;
}

/** 로스터·검색 결과 한 건에서 쓸 만한 사진 주소를 뽑는다 */
export function photoFromSportsdb(hit) {
  const cut = String(hit?.strCutout ?? '');
  if (cut) return { url: cut, kind: 'cutout' };
  const thumb = String(hit?.strThumb ?? '');
  if (thumb) return { url: thumb, kind: 'thumb' };
  return undefined;
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

/* ── 무료 키 예산 배분 ────────────────────────────────────
 * TheSportsDB 무료 키는 한 회차에 두 팀 남짓밖에 감당하지 못한다.
 * 그래서 "누구에게 요청을 쓸 것인가" 가 곧 "누구 얼굴이 뜨는가" 다.
 * 아래 두 함수가 그 배분을 정한다 — 순수 함수라 따로 검증한다.
 */

/**
 * 팀을 **사진이 부족한 순**으로 정렬한다.
 *
 * 순서가 고정이면 늘 맨 앞 팀이 예산을 다 쓰고 뒤쪽 팀은 차례가 오지
 * 않는다("레알마드리드만 헤드샷"). 아직 TheSportsDB 사진이 아닌 선수를
 * 세어 많이 빈 팀부터 돈다. 지난 회차 파일이 없는 팀(첫 실행)이 가장 급하다.
 *
 * @param teams  [{ slug, ... }]
 * @param prevOf (slug) => Map<id, {kind}>   지난 회차 사진
 */
export function photoNeedOrder(teams, prevOf) {
  const need = new Map();
  for (const t of teams) {
    const prev = prevOf(t.slug);
    if (!prev || prev.size === 0) { need.set(t.slug, Infinity); continue; }
    let upgradable = 0;
    for (const v of prev.values()) {
      if (v?.kind !== 'cutout' && v?.kind !== 'thumb') upgradable++;
    }
    need.set(t.slug, upgradable);
  }
  /* 같은 값이면 원래 순서를 지킨다 — 회차마다 결과가 뒤바뀌면 안 된다 */
  const idx = new Map(teams.map((t, i) => [t.slug, i]));
  return {
    order: [...teams].sort(
      (a, b) => (need.get(b.slug) - need.get(a.slug)) || (idx.get(a.slug) - idx.get(b.slug)),
    ),
    need,
  };
}

/**
 * 이미 사진이 있는 선수를 이번 회차에 다시 확인할 차례인가.
 *
 * 매 회차 전부 다시 물으면 한도를 그것만으로 다 쓰고, 아예 안 물으면
 * 예전 느슨한 규칙이 박아 둔 오답(리스 제임스 자리의 남의 얼굴)을 영영
 * 걷어낼 수 없다. 선수를 `buckets` 무리로 나눠 한 회차에 한 무리씩 본다.
 */
export function dueForReverify(id, bucket, buckets = 6) {
  const digits = String(id ?? '').replace(/\D/g, '').slice(-6);
  if (!digits) return false;
  return Number(digits) % buckets === ((bucket % buckets) + buckets) % buckets;
}

/**
 * 한 선수의 최종 사진을 고른다.
 *
 * 이 함수가 이 파일에서 가장 위험한 자리다. 잘못 쓰면 **멀쩡한 사진을
 * 지운다** — 2026-09-23 새벽에 실제로 그랬다. 그래서 규칙을 표로 박아 두고
 * 테스트로 잠근다.
 *
 * @param prev  지난 회차 사진 {url,kind} | null
 * @param tsdb  이번 회차 TheSportsDB 답
 *              {url,kind} = 찾았다 · null = 확인했고 없다 · undefined = 못 물어봤다
 * @param espn  ESPN 헤드샷 {url,kind:'espn'} | undefined
 * @returns {{photo: {url,kind}|null, dropped: boolean}}
 *          photo=null 이면 부르는 쪽이 위키로 내려간다.
 *          dropped=true 는 이어받은 TheSportsDB 사진을 오답으로 보고 버렸다는 뜻.
 */
export function choosePhoto({ prev: rawPrev = null, tsdb, espn } = {}) {
  /* 확인된 오답을 들고 있었다면 애초에 없던 것으로 친다 */
  const prev = rawPrev?.url && !isBadPhoto(rawPrev.url) ? rawPrev : null;
  const heldTsdb = !!prev && (prev.kind === 'cutout' || prev.kind === 'thumb');

  /*
   * ⚠️ `null` 과 `undefined` 를 구분하는 이유가 여기 전부 들어 있다.
   *
   * null      = 물어봤고 지금 규칙으로는 후보가 없다 → 예전 느슨한 규칙이
   *             박아 둔 오답일 수 있으니 이어받은 TheSportsDB 사진을 버린다.
   * undefined = 한도·네트워크로 **묻지 못했다** → 아무것도 판단할 수 없다.
   *             여기서 버리면 한도에 걸린 회차마다 멀쩡한 컷아웃이 위키로
   *             떨어진다. 반드시 그대로 둔다.
   */
  const dropped = tsdb === null && heldTsdb;

  let best = betterPhoto(dropped ? null : prev, tsdb || null);
  best = betterPhoto(best, espn ?? null);
  return { photo: best ?? null, dropped };
}
