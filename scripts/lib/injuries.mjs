/**
 * 부상 정보 — FotMob 팀 API 의 스쿼드 `injury` (2026-10-17 소스 비교에서 9팀 모두 응답).
 *
 * ESPN · SofaScore · Transfermarkt · 판타지들은 비었거나 막혔다(scripts/probe-injuries.mjs).
 * FotMob 은 선수 이름 · 부상 종류 번호 · 복귀 예상("Mid November 2026") 을 준다.
 * 우리 데이터는 ESPN 선수 id 라서 **이름으로** 맞춘다.
 *
 * 네트워크 없이 도는 순수 함수만 여기 둔다.
 */

/** 이름 비교용 — 악센트·대소문자·기호를 지운다 (Álex Baena → alex baena) */
export function normName(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ø/gi, 'o').replace(/ß/g, 'ss').replace(/ł/gi, 'l')
    .toLowerCase().replace(/[^a-z\s-]/g, ' ').replace(/[-\s]+/g, ' ').trim();
}

const lastOf = (n) => n.split(' ').slice(-1)[0];
const firstOf = (n) => n.split(' ')[0];

/**
 * FotMob 부상 선수 → ESPN 선수 id.
 *  1) 이름 전체가 같다
 *  2) 성이 같고 이름 첫 글자가 같다 (Vini Jr. 같은 예외는 놓쳐도 된다 — 지어내지 않는다)
 *  3) 성이 같은 선수가 그 팀에 한 명뿐이다
 * @param injured  [{ name, injury: { expectedReturn } }]
 * @param athletes { espnId: { name } }
 * @returns Map<espnId, member>
 */
export function matchInjured(injured, athletes) {
  const rows = Object.entries(athletes ?? {}).map(([id, a]) => ({ id, n: normName(a?.name) })).filter((r) => r.n);
  const out = new Map();
  for (const m of injured ?? []) {
    const n = normName(m?.name);
    if (!n) continue;
    let hit = rows.find((r) => r.n === n);
    if (!hit) {
      const sameLast = rows.filter((r) => lastOf(r.n) === lastOf(n));
      hit = sameLast.find((r) => firstOf(r.n)[0] === firstOf(n)[0]) ?? (sameLast.length === 1 ? sameLast[0] : undefined);
    }
    if (hit && !out.has(hit.id)) out.set(hit.id, m);
  }
  return out;
}

const MONTH = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
const PART = { early: '초', mid: '중순', late: '말' };

/**
 * 복귀 예상 문구 → 한국어.
 * @returns { ko, doubtful } — doubtful 이면 "출전 불투명"(다쳤지만 뛸 수도 있다)
 */
export function returnKo(text) {
  const t = String(text ?? '').trim();
  if (!t) return { ko: '복귀 시점 미정', doubtful: false };
  const m = t.match(/^(early|mid|late)\s+([a-z]+)(?:\s+(\d{4}))?$/i);
  if (m && MONTH[m[2].toLowerCase()]) return { ko: `${MONTH[m[2].toLowerCase()]}월 ${PART[m[1].toLowerCase()]} 복귀 예상`, doubtful: false };
  if (/^doubtful/i.test(t)) return { ko: '출전 불투명', doubtful: true };
  /* 2026-10-17 레알 멘디 — 다 나아 훈련에 돌아왔지만 아직 경기엔 안 나온 단계 */
  if (/back in training/i.test(t)) return { ko: '훈련 복귀', doubtful: false };
  if (/few days/i.test(t)) return { ko: '며칠 뒤 복귀 예상', doubtful: false };
  if (/few weeks/i.test(t)) return { ko: '몇 주 뒤 복귀 예상', doubtful: false };
  if (/few months/i.test(t)) return { ko: '몇 달 뒤 복귀 예상', doubtful: false };
  if (/season/i.test(t)) return { ko: '시즌 아웃', doubtful: false };
  if (/unknown|no return/i.test(t)) return { ko: '복귀 시점 미정', doubtful: false };
  return { ko: t, doubtful: false };
}

const GROUP_POS = { keepers: 'G', goalkeepers: 'G', defenders: 'D', midfielders: 'M', attackers: 'F', forwards: 'F' };

/** FotMob 팀 응답 → 부상 표시가 있는 스쿼드 선수들 (pos = 그룹 제목에서 G/D/M/F) */
export function injuredMembers(json) {
  const groups = json?.squad?.squad ?? json?.squad ?? [];
  const out = [];
  for (const g of Array.isArray(groups) ? groups : []) {
    const pos = GROUP_POS[String(g?.title ?? '').toLowerCase()];
    if (!pos) continue;                         // 감독(coach) 등은 뺀다
    for (const m of g?.members ?? []) if (m?.injury) out.push({ ...m, pos });
  }
  return out;
}

const PART_DAY = { early: 5, mid: 15, late: 25 };
/** 장기 부상 기준 — 복귀 예상이 이만큼 넘게 남았으면 (2026-10-17 요청: 4주) */
export const LONG_DAYS = 28;

/**
 * 장기 부상인가 — 복귀 예상까지 4주 넘게 남았거나 "몇 달" · "시즌 아웃".
 * "Early/Mid/Late 월" 은 그달 5 · 15 · 25일로 본다. 연도가 없으면 다가오는 그달.
 * 출전 불투명 · 며칠 · 몇 주 · 모름은 장기가 아니다(모르는 것을 장기로 단정하지 않는다).
 */
export function isLongTerm(text, now = new Date()) {
  const t = String(text ?? '').trim();
  if (/few months|season/i.test(t)) return true;
  const m = t.match(/^(early|mid|late)\s+([a-z]+)(?:\s+(\d{4}))?$/i);
  if (!m) return false;
  const mon = MONTH[m[2].toLowerCase()];
  if (!mon) return false;
  let year = m[3] ? Number(m[3]) : now.getUTCFullYear();
  let at = Date.UTC(year, mon - 1, PART_DAY[m[1].toLowerCase()]);
  if (!m[3] && at < now.getTime() - 15 * 86_400_000) at = Date.UTC(++year, mon - 1, PART_DAY[m[1].toLowerCase()]);
  return at - now.getTime() > LONG_DAYS * 86_400_000;
}

/** 수집기가 저장하는 부상 한 건 */
export function injuryRecord(m, now = new Date()) {
  const ret = m?.injury?.expectedReturn ?? null;
  const r = returnKo(ret);
  return { ret, ko: r.ko, doubtful: r.doubtful, long: !r.doubtful && isLongTerm(ret, now), kind: m?.injury?.id ?? null };
}

/**
 * 부상자 명단 — 팀의 FotMob 부상 선수 전부(경기에 한 번도 안 나와 우리 목록에 없는 장기 부상자 포함).
 * 우리 선수와 맞춘 경우 espn id 를 붙여 앱이 상세 카드를 열 수 있게 한다.
 * 정렬: 출전 불투명 → 복귀가 빠른 순(장기는 뒤).
 */
export function injuryList(injured, hits, now = new Date()) {
  const espnOf = new Map([...(hits ?? new Map())].map(([id, m]) => [m, id]));
  const rank = (x) => (x.doubtful ? 0 : x.long ? 2 : 1);
  return (injured ?? [])
    .map((m) => ({
      name: String(m?.name ?? ''),
      espnId: espnOf.get(m) ?? null,
      fm: m?.id != null ? String(m.id) : null,
      jersey: Number.isFinite(Number(m?.shirtNumber)) && m?.shirtNumber !== null ? Number(m.shirtNumber) : null,
      pos: m?.pos ?? null,
      ...injuryRecord(m, now),
    }))
    .filter((x) => x.name)
    .sort((a, b) => rank(a) - rank(b));
}

/** 스쿼드 응답이 정상인가 — 선수가 너무 적으면(응답 모양이 바뀜) 판단하지 않는다 */
export function squadSize(json) {
  const groups = json?.squad?.squad ?? json?.squad ?? [];
  return (Array.isArray(groups) ? groups : []).reduce((s, g) => s + (g?.members?.length ?? 0), 0);
}

/* ── 징계 — FotMob 다음 경기 matchDetails 의 결장자(unavailable) ──
   2026-10-17 점검: 결장자 type 이 injury / suspension 으로 나뉘어 온다(토트넘 · 리버풀 1명씩).
   결장자 목록에는 두 팀이 다 들어 있어서, 우리 팀 쪽만 골라야 한다. */

/** FotMob 팀 응답에서 다음 경기 id (어느 깊이에 있든) */
export function nextMatchId(json) {
  const seen = new Set();
  const walk = (o, d) => {
    if (!o || typeof o !== 'object' || d > 6 || seen.has(o)) return undefined;
    seen.add(o);
    if (o.nextMatch?.id != null) return String(o.nextMatch.id);
    for (const v of Object.values(o)) { const f = walk(v, d + 1); if (f) return f; }
    return undefined;
  };
  return walk(json, 0) ?? null;
}

/**
 * 경기 상세 → 우리 팀(fm) 쪽 징계 결장자.
 * lineup.homeTeam / awayTeam 중 id 가 fm 인 쪽의 unavailable 에서 type 이 suspension 인 것.
 * 팀을 못 가리면(모양이 다름) 빈 배열 — 상대 팀 선수를 우리 선수로 지어내지 않는다.
 */
export function suspendedFrom(details, fm) {
  const lineup = details?.content?.lineup ?? details?.lineup;
  const sides = [lineup?.homeTeam, lineup?.awayTeam].filter(Boolean);
  const mine = sides.find((t) => String(t?.id) === String(fm));
  if (!mine) return [];
  return (mine.unavailable ?? [])
    .filter((x) => String(x?.unavailability?.type ?? '').toLowerCase() === 'suspension')
    .map((x) => ({
      name: String(x?.name ?? ''),
      id: x?.id != null ? String(x.id) : null,
      /* 알려진 칸만 옮기고, 처음 보는 칸은 raw 로 남긴다(날짜가 있으면 화면이 쓴다) */
      ret: x?.unavailability?.expectedReturn ?? null,
      raw: x?.unavailability ?? null,
    }))
    .filter((x) => x.name);
}

/** 경기 상세의 경기 시각 · 대회 이름 */
export function matchInfo(details) {
  const g = details?.general ?? {};
  return {
    utc: g.matchTimeUTCDate ?? g.matchTimeUTC ?? null,
    league: g.leagueName ?? g.parentLeagueName ?? null,
  };
}

/**
 * FotMob 팀 응답 → 앞으로의 경기 id (가까운 순, 최대 n).
 * 징계가 몇 경기인지는 아무도 숫자로 주지 않는다 — 대신 다음 경기들의 결장자 목록에
 * 그 선수가 몇 번째 경기까지 "suspension" 으로 올라 있는지로 "언제까지" 를 안다.
 * 응답 어디에 있든 { id, status: { utcTime, finished } } 모양의 경기를 모은다.
 */
export function upcomingMatchIds(json, now = Date.now(), n = 4) {
  const out = new Map();
  const seen = new Set();
  const walk = (o, d) => {
    if (!o || typeof o !== 'object' || d > 7 || seen.has(o)) return;
    seen.add(o);
    const t = o?.status?.utcTime ?? o?.status?.startDateStr ?? null;
    if (o.id != null && t && !o.status?.finished && !o.status?.cancelled && Date.parse(t) > now - 3 * 3600_000) {
      out.set(String(o.id), Date.parse(t));
    }
    for (const v of Object.values(o)) walk(v, d + 1);
  };
  walk(json, 0);
  return [...out].filter(([, t]) => Number.isFinite(t)).sort((a, b) => a[1] - b[1]).slice(0, n).map(([id]) => id);
}

/**
 * 여러 경기의 징계 결장자 → 선수별로 묶는다.
 * @param perMatch [{ utc, league, suspended: [{ name, ret, raw }] }] (경기 순)
 * @returns [{ name, ret, raw, games: [{ utc, league }] }]
 * 첫 경기(다음 경기)에 없는 선수도 담는다 — 다음 경기는 뛰고 그다음 대회 경기부터 정지일 수 있다(챔스).
 */
export function groupSuspensions(perMatch) {
  const by = new Map();
  for (const m of perMatch ?? []) {
    for (const x of m?.suspended ?? []) {
      const k = normName(x.name);
      if (!k) continue;
      const cur = by.get(k) ?? { name: x.name, ret: x.ret ?? null, raw: x.raw ?? null, games: [] };
      cur.games.push({ utc: m.utc ?? null, league: m.league ?? null });
      if (!cur.ret && x.ret) cur.ret = x.ret;
      by.set(k, cur);
    }
  }
  return [...by.values()];
}
