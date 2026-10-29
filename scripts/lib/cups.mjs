/**
 * 컵 대회 라운드 대진 (2026-10-26) — Summary › 대회 순위의 컵 대진표가 읽는 cup-{대회}.json.
 *
 * 우리 팀 일정에는 우리 경기만 있어 "이번 라운드에 누가 누구랑 붙나" 를 그릴 수 없다.
 * ESPN 스코어보드를 **하루씩** 받아(날짜 범위로 한 번에 받으면 응답이 조용히 잘린다 — snapshot.mjs 참고)
 * 라운드 달력(calendar) 구간에 떨어뜨린다. 지난 날짜는 이전 파일의 경기를 그대로 쓴다.
 *
 * 네트워크 없는 순수 함수만 — 받는 쪽은 snapshot.mjs.
 */

/** 대진표를 만드는 컵 — 순위표가 없는 단판 토너먼트(국내 컵) */
export const CUP_LEAGUES = ['eng.league_cup', 'eng.fa', 'esp.copa_del_rey', 'ger.dfb_pokal'];

const DAY = 86400000;
const ymd = (t) => new Date(t).toISOString().slice(0, 10).replace(/-/g, '');

/** 스코어보드 이벤트 → 앱이 normalize.matchFrom 으로 읽는 최소 모양(승부차기 · 승자 · 상태 포함) */
export function cupEvent(ev) {
  const c = ev?.competitions?.[0];
  if (!c || !ev?.id) return null;
  const st = c.status ?? ev.status ?? {};
  const team = (x) => ({
    team: {
      id: String(x?.team?.id ?? ''),
      displayName: String(x?.team?.displayName ?? x?.team?.name ?? ''),
      shortDisplayName: String(x?.team?.shortDisplayName ?? ''),
      abbreviation: String(x?.team?.abbreviation ?? ''),
      ...(x?.team?.logo ? { logo: String(x.team.logo) } : {}),
    },
    homeAway: x?.homeAway,
    score: { displayValue: String(x?.score?.displayValue ?? x?.score ?? '') },
    ...(x?.shootoutScore != null ? { shootoutScore: Number(x.shootoutScore) } : {}),
    ...(x?.winner === true ? { winner: true } : {}),
  });
  return {
    id: String(ev.id),
    date: String(ev.date ?? ''),
    competitions: [{
      status: {
        displayClock: st?.displayClock,
        type: {
          completed: st?.type?.completed === true,
          state: st?.type?.state,
          name: st?.type?.name,
          shortDetail: st?.type?.shortDetail,
        },
      },
      competitors: (Array.isArray(c.competitors) ? c.competitors : []).map(team),
      ...(c.venue?.fullName ? { venue: { fullName: String(c.venue.fullName) } } : {}),
    }],
  };
}

/**
 * 이번에 받아 올 날짜(YYYYMMDD) — 라운드 구간 ∩ [지금-3일, 지금+14일].
 * 이전 파일에 그 라운드가 없으면(처음) 구간 시작부터 받는다. 14일 넘게 남은 날은 아직 안 받는다.
 */
export function daysToFetch(round, now, hasPrev) {
  const s = Date.parse(round.start), e = Date.parse(round.end);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return [];
  const from = Math.max(s, hasPrev ? now - 3 * DAY : s);
  const to = Math.min(e, now + 14 * DAY);
  const out = [];
  for (let t = Date.UTC(new Date(from).getUTCFullYear(), new Date(from).getUTCMonth(), new Date(from).getUTCDate()); t <= to; t += DAY) out.push(ymd(t));
  return out;
}

/** 라운드 경기 합치기 — 이전 파일 경기 위에 이번에 받은 경기를 덮는다(id 기준), 킥오프 순 */
export function mergeRound(prevEvents, fetched) {
  const by = new Map((prevEvents ?? []).map((e) => [e.id, e]));
  for (const e of fetched) if (e) by.set(e.id, e);
  return [...by.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.id.localeCompare(b.id));
}

/** 경기를 라운드 구간에 떨어뜨린다 — 구간 밖이면 null */
export function roundIndexOf(rounds, iso) {
  const t = Date.parse(iso);
  return rounds.findIndex((r) => t >= Date.parse(r.start) && t <= Date.parse(r.end));
}

/**
 * 경기를 라운드에 **한 번만** 놓는다 (2026-10-29 코파 델 레이).
 * ESPN 은 미래 라운드 구간을 겹치게 준다(2라운드부터 하루 간격 시작 · 끝은 전부 2027-07-01).
 * 날짜로만 넣으면 미뤄진 1라운드 경기가 2라운드 · 32강 · 16강 … 에 똑같이 들어갔다.
 *  - 이전 파일에 있던 경기는 처음 놓였던(가장 이른) 라운드에 그대로 — 날짜가 바뀌어도(연기) 옮기지 않는다
 *  - 새 경기는 날짜가 들어가는 **첫** 라운드
 *  - 같은 경기는 이번에 받은 것(최신)으로 덮는다
 * @param cal    라운드 달력 [{label,start,end}]
 * @param prev   이전 파일의 rounds [{label, events}] (없으면 [])
 * @param fetched 이번에 받은 경기들(라운드 구분 없이)
 * @returns cal 순서대로 [{label,start,end,events}]
 */
export function assignRounds(cal, prev, fetched) {
  const home = new Map();
  const latest = new Map();
  for (const r of prev ?? []) for (const e of r.events ?? []) {
    if (!home.has(e.id)) home.set(e.id, r.label);
    if (!latest.has(e.id)) latest.set(e.id, e);
  }
  for (const e of fetched) if (e) {
    latest.set(e.id, e);
    if (!home.has(e.id)) {
      const i = roundIndexOf(cal, e.date);
      if (i >= 0) home.set(e.id, cal[i].label);
    }
  }
  return cal.map((r) => ({
    label: r.label, start: r.start, end: r.end,
    events: [...latest.values()].filter((e) => home.get(e.id) === r.label)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.id.localeCompare(b.id)),
  }));
}
