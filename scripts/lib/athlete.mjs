/**
 * 선수 한 명의 "최근 경기"와 "시즌 합계" — core eventlog 경로.
 *
 * ⚠️ 왜 새로 만들었나 (2026-09-17)
 * 예전에는 `site.web.api.../apis/common/v3/sports/soccer/{lg}/athletes/{id}/gamelog`
 * 을 썼다. 그 엔드포인트는 **죽었다** — 지금은 어떤 리그·선수로 불러도
 * `HTTP 500 {"code":2400}` 을 돌려준다(2026-09-17 손흥민 usa.1 로 확인,
 * `?season=2026` 을 붙여도 같고 `overview` 도 같이 죽었다).
 * 그래서 코리안리거 "최근 3경기" 가 21명 전원 0건이었고, Future Resources
 * 의 출전·골·도움이 전부 빈칸(`–`)이었다. 둘이 같은 원인이었다.
 *
 * 대체 경로는 core 의 eventlog 다 — 모든 리그에서 살아 있다(실측:
 * usa.1/esp.1/ger.1/ita.1/eng.1 전부 200).
 *
 *   /v2/sports/soccer/leagues/{lg}/seasons/{y}/athletes/{id}/eventlog
 *     → events.items[] = { event.$ref, competition.$ref, lineupEntry.$ref,
 *                          statistics.$ref, teamId, played }
 *
 * 그리고 경기별 기록은 그 안의 statistics.$ref 한 번으로 다 나온다:
 *   general.appearances / general.minutes / general.starts / general.subIns
 *   offensive.totalGoals / offensive.goalAssists / general.yellowCards …
 *
 * ⚠️ `played: true` 를 출전으로 믿으면 안 된다. **명단에 든 것까지 true** 다
 * (실측: 김민재 401884801 은 played:true 인데 appearances:0·minutes:0).
 * 실제 출전 판정은 경기별 statistics 의 appearances/minutes 로만 한다 —
 * 예전에 코리안리거 최근 경기가 "교체" 로 잘못 찍혔던 그 문제를, 이제는
 * 추론이 아니라 데이터로 가른다.
 *
 * ⚠️ eventlog items 는 날짜 순서가 아니다(실측: Sep 13 경기가 Aug 28 경기보다
 * 앞에 온다). 반드시 일정에서 받은 날짜로 다시 정렬해야 한다.
 *
 * 이 파일의 파서는 전부 순수 함수다 — 네트워크를 타지 않으므로
 * `scripts/lib/athlete.test.mjs` 가 실제 응답 조각으로 검증한다.
 */

/* ── 순수 파서 ───────────────────────────────────────── */

/** eventlog 응답 → [{eventId, teamId, played}] */
export function eventLogItems(json) {
  const items = json?.events?.items;
  if (!Array.isArray(items)) return [];
  return items
    .map((x) => ({
      eventId: String(x?.event?.$ref ?? '').match(/events\/(\d+)/)?.[1] ?? '',
      teamId: String(x?.teamId ?? ''),
      played: x?.played === true,
      hasStats: !!x?.statistics,
    }))
    .filter((x) => x.eventId);
}

/** core statistics 응답의 splits.categories 를 {이름: 숫자} 한 겹으로 펼친다 */
export function flattenStats(json) {
  const out = {};
  for (const c of json?.splits?.categories ?? []) {
    for (const s of c?.stats ?? []) {
      const n = Number(s?.value);
      if (s?.name) out[String(s.name)] = Number.isFinite(n) ? n : 0;
    }
  }
  return out;
}

/**
 * 경기별 기록 → 출전 요약. **안 뛴 경기는 null** 이다.
 * (명단에만 든 경기를 여기서 걸러 낸다 — eventlog 의 played 로는 못 가른다)
 */
export function appearanceFrom(flat) {
  if (!flat) return null;
  const minutes = Math.round(flat.minutes ?? 0);
  const apps = flat.appearances ?? 0;
  const starter = (flat.starts ?? 0) >= 1;
  const subbedIn = (flat.subIns ?? 0) >= 1;
  if (apps < 1 && minutes <= 0 && !starter && !subbedIn) return null;
  return {
    starter,
    minutes,
    goals: flat.totalGoals ?? 0,
    assists: flat.goalAssists ?? 0,
    yellow: (flat.yellowCards ?? 0) > 0,
    red: (flat.redCards ?? 0) > 0,
  };
}

/** 시즌 통계 응답 → 합계 (Future 카드·코리안리거 대회별 줄에 쓴다) */
export function seasonTotals(json) {
  const f = flattenStats(json);
  const apps = f.appearances ?? 0;
  return {
    apps,
    starts: f.starts ?? Math.max(0, apps - (f.subIns ?? 0)),
    minutes: f.minutes ?? f.timePlayed ?? 0,
    goals: f.totalGoals ?? 0,
    assists: f.goalAssists ?? 0,
    yellow: f.yellowCards ?? 0,
    red: f.redCards ?? 0,
  };
}

/**
 * 팀 일정 응답 → eventId 별 경기 메타 (그 팀 시점의 상대·스코어·승패).
 * eventlog 는 경기 id 만 주므로 날짜·상대·스코어는 여기서 온다.
 */
export function scheduleMeta(json, teamId) {
  const me = String(teamId);
  const map = new Map();
  for (const e of json?.events ?? []) {
    const c = e?.competitions?.[0];
    if (!c) continue;
    const cs = Array.isArray(c.competitors) ? c.competitors : [];
    const mine = cs.find((x) => String(x?.team?.id ?? '') === me);
    const opp = cs.find((x) => String(x?.team?.id ?? '') !== me);
    const num = (v) => {
      const n = Number(v?.score?.displayValue ?? v?.score);
      return Number.isFinite(n) ? n : undefined;
    };
    const a = num(mine);
    const b = num(opp);
    const both = a !== undefined && b !== undefined;
    map.set(String(e.id), {
      date: String(e?.date ?? ''),
      competition: String(e?.league?.slug ?? e?.season?.slug ?? ''),
      opponent: String(opp?.team?.displayName ?? opp?.team?.name ?? ''),
      opponentId: String(opp?.team?.id ?? '0'),
      score: both ? `${a} : ${b}` : '',
      result: both ? (a > b ? 'W' : a < b ? 'L' : 'D') : 'D',
      completed: c?.status?.type?.completed === true,
    });
  }
  return map;
}

/** 경기 로스터 항목 → 교체 투입 분 (선발이거나 모르면 undefined) */
export function subInMinute(entry) {
  if (entry?.subbedIn?.didSub !== true) return undefined;
  const dv = String(entry?.subbedIn?.clock?.displayValue ?? '');
  const m = dv.match(/(\d+)/);
  if (m) return parseInt(m[1], 10);
  const v = Number(entry?.subbedIn?.clock?.value);
  return Number.isFinite(v) ? Math.round(v / 60) : undefined;
}

/* ── 조합 (네트워크는 주입받는다) ──────────────────────── */

const CORE = 'https://sports.core.api.espn.com';
const SITE_WEB = 'https://site.web.api.espn.com';

export const eventLogUrl = (lg, season, id) =>
  `${CORE}/v2/sports/soccer/leagues/${lg}/seasons/${season}/athletes/${id}/eventlog?limit=100`;

export const eventStatsUrl = (lg, eventId, teamId, id) =>
  `${CORE}/v2/sports/soccer/leagues/${lg}/events/${eventId}/competitions/${eventId}`
  + `/competitors/${teamId}/roster/${id}/statistics/0`;

export const lineupEntryUrl = (lg, eventId, teamId, id) =>
  `${CORE}/v2/sports/soccer/leagues/${lg}/events/${eventId}/competitions/${eventId}`
  + `/competitors/${teamId}/roster/${id}`;

export const seasonStatsUrl = (lg, season, id) =>
  `${CORE}/v2/sports/soccer/leagues/${lg}/seasons/${season}/types/1/athletes/${id}/statistics`;

export const teamScheduleUrl = (teamId) =>
  `${SITE_WEB}/apis/site/v2/sports/soccer/all/teams/${teamId}/schedule`;

/**
 * 그 선수가 **실제로 뛴** 최근 경기들.
 *
 * @param get      (url) => Promise<json|null>  — 재시도·로깅은 호출자 책임
 * @param meta     scheduleMeta() 결과 (없으면 날짜·상대가 빈다)
 * @param take     몇 경기까지
 * @param probe    후보를 몇 경기까지 확인할지 (명단만 든 경기를 건너뛰어야 하므로 여유를 둔다)
 */
export async function athleteRecent({
  get, league, season, athleteId, meta, take = 3, probe = 8,
}) {
  if (!league || !athleteId) return [];
  const log = eventLogItems(await get(eventLogUrl(league, season, athleteId)));
  if (!log.length) return [];

  /* eventlog 순서는 날짜순이 아니다 — 일정의 날짜로 세운다.
     일정에 없는 경기(다른 대회 등)는 뒤로 밀되 버리지는 않는다. */
  const dateOf = (eventId) => meta?.get(eventId)?.date ?? '';
  const candidates = log
    .filter((x) => x.played)
    .sort((a, b) => dateOf(b.eventId).localeCompare(dateOf(a.eventId)))
    .slice(0, probe);

  const out = [];
  for (const it of candidates) {
    if (out.length >= take) break;
    const flat = flattenStats(
      await get(eventStatsUrl(league, it.eventId, it.teamId, athleteId)),
    );
    const app = appearanceFrom(flat);
    if (!app) continue;                       // 명단에만 들었던 경기

    let subIn;
    if (!app.starter) {
      subIn = subInMinute(
        await get(lineupEntryUrl(league, it.eventId, it.teamId, athleteId)),
      );
    }

    const m = meta?.get(it.eventId) ?? {};
    out.push({
      eventId: it.eventId,
      competition: m.competition || league,
      date: m.date ?? '',
      opponent: m.opponent ?? '',
      opponentId: m.opponentId ?? '0',
      score: m.score ?? '',
      result: m.result ?? 'D',
      started: app.starter,
      minutes: app.minutes,
      subIn,
      goals: app.goals,
      assists: app.assists,
      yellow: app.yellow,
    });
  }
  return out;
}
