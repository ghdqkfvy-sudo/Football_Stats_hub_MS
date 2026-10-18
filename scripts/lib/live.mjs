/**
 * 오늘의 경기 — FotMob 경기 상세(matchDetails) → 앱이 그리는 live-{slug}.json 한 장 (2026-10-18).
 *
 * 2026-10-18 점검(scripts/probe-ratings.mjs)으로 확인한 칸:
 *  · header.teams[].score · header.status(started · finished · liveTime.short · reason.short)
 *  · content.lineup.{homeTeam,awayTeam} — formation · coach · rating · starters(verticalLayout 좌표) · subs
 *    선수 performance: rating(경기 중에도 갱신) · events(goal · assist · yellowCard · redCard) · substitutionEvents
 *  · content.matchFacts.events.events — Goal · Card(Yellow/Red/YellowRed) · Substitution(swap[0]=들어온 선수,
 *    swap[1]=나간 선수, injuredPlayerOut) · Half · AddedTime …
 *
 * 경기 중 수집 워크플로(live-match.yml)가 1분마다 이 함수로 파일을 다시 쓴다. 네트워크 없는 순수 함수만 둔다.
 */

/** 오늘의 경기를 받는 팀 — snapshot.mjs TEAMS 의 fm 과 같은 값(대표팀은 FotMob 라인업을 쓰지 않는다) */
export const LIVE_TEAMS = {
  'real-madrid': { espn: '86', fm: 8633 },
  chelsea: { espn: '363', fm: 8455 },
  'man-united': { espn: '360', fm: 10260 },
  tottenham: { espn: '367', fm: 8586 },
  newcastle: { espn: '361', fm: 10261 },
  liverpool: { espn: '364', fm: 8650 },
  bayern: { espn: '132', fm: 9823 },
  atletico: { espn: '1068', fm: 9906 },
  lafc: { espn: '18966', fm: 867280 },
};

/** 라이브 수집을 켜 둘 구간 — 킥오프 75분 전(라인업 발표 무렵)부터 킥오프 뒤 150분까지 */
export const LIVE_BEFORE_MS = 75 * 60_000;
export const LIVE_AFTER_MS = 150 * 60_000;

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const rating = (v) => { const n = num(v); return n && n > 0 ? Math.round(n * 10) / 10 : null; };

/**
 * ESPN 일정(schedule-{slug}.json 의 events) → 지금 라이브 수집을 켜야 할 경기들.
 * 끝난 경기는 빼고, 킥오프가 [지금-150분, 지금+75분] 안인 것만.
 */
export function liveCandidates(events, now = Date.now()) {
  return (events ?? [])
    .map((e) => ({ id: String(e?.id ?? ''), kickoff: e?.date ?? e?.competitions?.[0]?.date, done: !!e?.competitions?.[0]?.status?.type?.completed }))
    .filter((e) => e.id && !e.done && Number.isFinite(Date.parse(e.kickoff)))
    .filter((e) => { const t = Date.parse(e.kickoff); return now >= t - LIVE_BEFORE_MS && now <= t + LIVE_AFTER_MS; });
}

/** 팀 API → 그 킥오프 시각의 FotMob 경기 id (3시간 안쪽에서 가장 가까운 것, 끝났든 아니든) */
export function fixtureNear(teamJson, kickoff, tolMs = 3 * 3600_000) {
  const t = Date.parse(kickoff ?? '');
  if (!Number.isFinite(t)) return null;
  let best = null;
  const seen = new Set();
  const walk = (o, d) => {
    if (!o || typeof o !== 'object' || d > 7 || seen.has(o)) return;
    seen.add(o);
    const u = Date.parse(o?.status?.utcTime ?? '');
    if (o.id != null && Number.isFinite(u) && !o.status?.cancelled) {
      const dd = Math.abs(u - t);
      if (dd <= tolMs && (!best || dd < best.d)) best = { id: String(o.id), d: dd };
    }
    for (const v of Object.values(o)) walk(v, d + 1);
  };
  walk(teamJson, 0);
  return best?.id ?? null;
}

/** 시계 문자열 — FotMob 은 "95‎’‎" 처럼 방향 표시 문자(U+200E)와 굽은 따옴표를 섞어 준다 */
const cleanClock = (s) => (s == null ? null : String(s).replace(/[\u200e\u200f\u202a-\u202e]/g, '').replace(/[’`]/g, "'").trim() || null);

/** 경기 단계 · 시계 */
export function phaseOf(md) {
  const st = md?.header?.status ?? {};
  if (st.finished) return { phase: 'done', clock: cleanClock(st.reason?.short) ?? 'FT' };
  if (st.started) return { phase: 'live', clock: cleanClock(st.liveTime?.short ?? st.reason?.short) };
  return { phase: 'pre', clock: null };
}

/** 선수 한 명 — 칩 · 벤치 줄에 필요한 것만 */
function player(p, cardsById) {
  const perf = p?.performance ?? {};
  const evs = perf.events ?? [];
  const count = (t) => evs.filter((e) => e?.type === t).length;
  const subs = perf.substitutionEvents ?? [];
  const out = subs.find((s) => s?.type === 'subOut');
  const inn = subs.find((s) => s?.type === 'subIn');
  const id = String(p?.id ?? '');
  const lay = p?.verticalLayout;
  return {
    id,
    name: String(p?.name ?? ''),
    last: String(p?.lastName || String(p?.name ?? '').split(' ').slice(-1)[0] || ''),
    no: num(p?.shirtNumber),
    ...(lay && num(lay.x) != null && num(lay.y) != null ? { x: num(lay.x), y: num(lay.y) } : {}),
    rating: rating(perf.rating),
    ...(p?.isCaptain ? { cap: true } : {}),
    goals: count('goal'),
    og: count('ownGoal'),
    assists: count('assist'),
    /* 카드는 경기 이벤트에서 분까지 — 없으면 선수 이벤트로 */
    cards: cardsById.get(id) ?? [
      ...Array(count('yellowCard')).fill({ kind: 'y' }),
      ...Array(count('redCard')).fill({ kind: 'r' }),
    ],
    ...(out ? { out: num(out.time), outInjury: out.reason === 'injury' || undefined } : {}),
    ...(inn ? { in: num(inn.time) } : {}),
  };
}

const cardKind = (c) => (/yellow\s*red|second/i.test(String(c)) ? 'yr' : /red/i.test(String(c)) ? 'r' : 'y');

/** 경기 이벤트 → 시간순 타임라인 + 선수별 카드(분 포함) */
export function eventsOf(md) {
  const raw = md?.content?.matchFacts?.events?.events ?? [];
  const cardsById = new Map();
  const events = [];
  for (const e of raw) {
    const min = num(e?.time);
    const plus = num(e?.overloadTime) || undefined;
    const side = e?.isHome ? 'home' : 'away';
    if (e?.type === 'Goal') {
      events.push({
        t: 'goal', min, plus, side,
        player: e?.player?.name ?? e?.nameStr ?? '',
        pid: String(e?.player?.id ?? e?.playerId ?? ''),
        og: !!e?.ownGoal || undefined,
        pen: /penalty/i.test(String(e?.goalDescriptionKey ?? e?.goalDescription ?? '')) || undefined,
        /* "assist by Youri Tielemans" → 이름만 */
        assist: String(e?.assistStr || e?.assistInput || '').replace(/^assist by\s*/i, '') || undefined,
        score: Array.isArray(e?.newScore) ? e.newScore : undefined,
      });
    } else if (e?.type === 'Card') {
      const kind = cardKind(e?.card);
      const pid = String(e?.player?.id ?? e?.playerId ?? '');
      events.push({ t: 'card', min, plus, side, kind, player: e?.player?.name ?? e?.nameStr ?? '', pid });
      if (pid) cardsById.set(pid, [...(cardsById.get(pid) ?? []), { kind, min }]);
    } else if (e?.type === 'Substitution') {
      const [inn, out] = e?.swap ?? [];
      events.push({
        t: 'sub', min, plus, side,
        in: inn?.name ?? '', inId: String(inn?.id ?? ''),
        out: out?.name ?? '', outId: String(out?.id ?? ''),
        injury: !!e?.injuredPlayerOut || undefined,
      });
    } else if (e?.type === 'Half') {
      events.push({ t: 'half', min, label: e?.halfStrShort ?? '' });
    }
  }
  return { events, cardsById };
}

/** 한 팀 줄 */
function side(t, cardsById) {
  return {
    fm: num(t?.id),
    name: String(t?.name ?? ''),
    formation: t?.formation ? String(t.formation) : null,
    rating: rating(t?.rating),
    coach: t?.coach?.name ?? null,
    starters: (t?.starters ?? []).map((p) => player(p, cardsById)),
    bench: (t?.subs ?? []).map((p) => player(p, cardsById)),
  };
}

/**
 * 경기 상세 → live-{slug}.json 의 본문.
 * @param ourFm 우리 팀 FotMob id — ours 로 홈/원정을 알려 준다(앱이 우리 팀을 아래에 그린다)
 */
export function liveSnapshot(md, ourFm) {
  const { phase, clock } = phaseOf(md);
  const teams = md?.header?.teams ?? [];
  const lu = md?.content?.lineup ?? {};
  const { events, cardsById } = eventsOf(md);
  const home = side(lu.homeTeam ?? { id: teams[0]?.id, name: teams[0]?.name }, cardsById);
  const away = side(lu.awayTeam ?? { id: teams[1]?.id, name: teams[1]?.name }, cardsById);
  return {
    fmId: String(md?.general?.matchId ?? ''),
    kickoffUtc: md?.general?.matchTimeUTCDate ?? md?.header?.status?.utcTime ?? null,
    league: md?.general?.leagueName ?? null,
    phase, clock,
    score: [num(teams[0]?.score) ?? 0, num(teams[1]?.score) ?? 0],
    /* predicted = 발표 전 예상 라인업 */
    lineupType: lu?.lineupType ?? null,
    /* 팀 색 — FotMob 의 어두운 화면용 · 밝은 화면용 두 벌(앱이 어두운 배경에 보이는 쪽을 고른다) */
    colors: md?.general?.teamColors ? {
      home: [md.general.teamColors.darkMode?.home, md.general.teamColors.lightMode?.home].filter(Boolean),
      away: [md.general.teamColors.darkMode?.away, md.general.teamColors.lightMode?.away].filter(Boolean),
    } : null,
    ours: String(home.fm) === String(ourFm) ? 'home' : String(away.fm) === String(ourFm) ? 'away' : null,
    home, away, events,
  };
}
