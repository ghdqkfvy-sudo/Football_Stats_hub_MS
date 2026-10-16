/**
 * TheSportsDB 키 점검 — 숨은 "지금 갱신" 시트에서 키 여러 개를 바로 시험한다.
 *
 * 왜: 선수 컷아웃 사진은 TheSportsDB 에서 오는데, 수집 회차가 첫 팀부터 실패했다.
 * 무료 키가 `3` 인지 `123` 인지 자료가 엇갈리고, 유료 키는 사기 전에 되는지 보고 싶다.
 *
 * 무엇을 보나 (키마다 두 번 부른다)
 *  1) searchteams — 키가 받아들여지는가
 *  2) lookup_all_players — 로스터를 몇 명 주는가 · 그중 컷아웃이 몇 장인가
 *     (무료 키는 로스터를 10명 남짓으로 잘라 준다 — 숫자로 유료/무료가 드러난다)
 *
 * ⚠️ 이 결과는 **이 기기(브라우저)** 에서 본 것이다. 수집은 GitHub 서버에서 돌고,
 * 서버 IP 가 따로 막힐 수 있어 결과가 다를 수 있다 — 서버 쪽 결과는 수집기가
 * meta-slow.json 의 tsdb 에 남긴다(시트에 같이 보여 준다).
 */

export const TSDB_ROOT = 'https://www.thesportsdb.com/api/v1/json';
/** 시험해 볼 공개 테스트 키 — 수집기(scripts/snapshot.mjs TSDB_KEYS)와 같은 순서 */
export const PUBLIC_KEYS = ['123', '3'];
/** 로스터를 확인할 팀 — 이름 검색이 확실히 되는 팀 */
const PROBE_TEAM = 'Arsenal';

export type KeyVerdict = 'ok' | 'limited' | 'denied' | 'blocked' | 'error';

export interface KeyCheck {
  key: string;
  verdict: KeyVerdict;
  /** 한 줄 설명 — "선수 25명 · 컷아웃 21장" / "HTTP 429 (요청 한도)" */
  detail: string;
  ms: number;
}

/** 키 값은 화면·로그에 그대로 두지 않는다(유료 키) — 공개 테스트 키만 보인다 */
export const maskKey = (key: string): string =>
  (PUBLIC_KEYS.includes(key) ? key : `${key.slice(0, 2)}…${key.slice(-2)}`);

/** HTTP 상태 → 판정 · 설명 */
export function verdictOfStatus(status: number): { verdict: KeyVerdict; detail: string } {
  if (status === 429) return { verdict: 'limited', detail: 'HTTP 429 (요청 한도 — 잠시 뒤 다시)' };
  if (status === 401 || status === 403) return { verdict: 'denied', detail: `HTTP ${status} (키 거부)` };
  if (status === 404) return { verdict: 'denied', detail: 'HTTP 404 (키 없음 또는 주소 바뀜)' };
  return { verdict: 'error', detail: `HTTP ${status}` };
}

/** 로스터 응답 → 판정 · 설명 (선수 수와 컷아웃 수) */
export function verdictOfRoster(json: unknown): { verdict: KeyVerdict; detail: string } {
  const list = (json as { player?: unknown })?.player;
  if (!Array.isArray(list) || !list.length) return { verdict: 'error', detail: '로스터가 비어 있음' };
  const cut = list.filter((p) => typeof (p as { strCutout?: unknown })?.strCutout === 'string'
    && String((p as { strCutout: string }).strCutout).startsWith('http')).length;
  /* 무료 키는 열 명 남짓에서 잘린다 — 그 정도면 "되지만 일부만" */
  const partial = list.length < 15;
  return {
    verdict: partial ? 'limited' : 'ok',
    detail: `선수 ${list.length}명 · 컷아웃 ${cut}장${partial ? ' (로스터 일부만 — 무료 키 제한)' : ''}`,
  };
}

async function getJson(url: string, signal: AbortSignal): Promise<{ status: number; json?: unknown }> {
  const res = await fetch(url, { signal, cache: 'no-store' });
  if (!res.ok) return { status: res.status };
  return { status: res.status, json: await res.json().catch(() => undefined) };
}

/** 키 하나를 시험한다 (네트워크) */
export async function checkKey(key: string, timeoutMs = 8000): Promise<KeyCheck> {
  const t0 = performance.now();
  const done = (v: { verdict: KeyVerdict; detail: string }): KeyCheck =>
    ({ key, ...v, ms: Math.round(performance.now() - t0) });
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    const team = await getJson(`${TSDB_ROOT}/${encodeURIComponent(key)}/searchteams.php?t=${PROBE_TEAM}`, signal);
    if (team.status !== 200) return done(verdictOfStatus(team.status));
    const id = (team.json as { teams?: { idTeam?: string }[] })?.teams?.[0]?.idTeam;
    if (!id) return done({ verdict: 'denied', detail: '응답은 왔지만 팀 검색 결과가 없음(키가 막혔을 수 있음)' });
    const roster = await getJson(`${TSDB_ROOT}/${encodeURIComponent(key)}/lookup_all_players.php?id=${id}`, signal);
    if (roster.status !== 200) return done(verdictOfStatus(roster.status));
    return done(verdictOfRoster(roster.json));
  } catch (e) {
    const name = e instanceof Error ? e.name : '';
    /* 시간 초과와 "브라우저가 막음(CORS·네트워크)" 을 가른다 */
    return done(name === 'TimeoutError' || name === 'AbortError'
      ? { verdict: 'error', detail: '시간 초과' }
      : { verdict: 'blocked', detail: '연결 실패 (네트워크 또는 브라우저 차단)' });
  }
}

/** 수집 서버가 마지막 회차에 남긴 결과 (meta-slow.json 의 tsdb) */
export interface ServerTsdb {
  /** 쓴 키(가린 값) — 없으면 null */
  key: string | null;
  tried: { key: string; status: string }[];
  /** 응답 상태별 횟수 { "200": 120, "HTTP 429": 8 } */
  statuses?: Record<string, number>;
  at: string;
}
