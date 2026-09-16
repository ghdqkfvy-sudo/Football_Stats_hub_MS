/**
 * 대회 단위 파생 계산 — 순위표 / 홈·원정 기록 / 공격포인트 순위.
 *
 * 왜 직접 계산하는가:
 * ESPN의 standings 응답은 시즌 초반에 몇 라운드씩 뒤처진다. 실제로
 *  · 라리가: 각 팀이 5경기를 치른 시점에 gamesPlayed = 3
 *  · 챔피언스리그 2026-27: 1차전이 끝났는데 32팀 전원 0경기·0점
 * 인 응답을 확인했다. 그래서 경기 결과가 순위표보다 앞서 있으면
 * 결과로 표를 다시 만든다. 단, 우리가 가진 경기 기록이 ESPN이 집계한
 * 범위를 전부 덮을 때만 그렇게 한다(부분 데이터로 표를 망치지 않도록).
 */
import type { Match, ResultOf, StandingRow, StandingTable, TeamRef } from './types';

export interface TeamResults {
  home: Match[];
  away: Match[];
  record: { w: number; d: number; l: number };
  homeRecord: { w: number; d: number; l: number };
  awayRecord: { w: number; d: number; l: number };
}

export function resultOf(m: Match, teamId: string): ResultOf | null {
  if (m.status !== 'finished' || m.homeScore === undefined || m.awayScore === undefined) return null;
  const isHome = m.home.id === teamId;
  const mine = isHome ? m.homeScore : m.awayScore;
  const theirs = isHome ? m.awayScore : m.homeScore;
  return mine > theirs ? 'W' : mine < theirs ? 'L' : 'D';
}

/** 한 팀의 해당 대회 홈/원정 경기 묶음 */
export function teamResults(matches: Match[], teamId: string): TeamResults {
  const mine = matches
    .filter((m) => m.home.id === teamId || m.away.id === teamId)
    .sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc));

  const tally = (list: Match[]) => {
    const r = { w: 0, d: 0, l: 0 };
    for (const m of list) {
      const res = resultOf(m, teamId);
      if (res === 'W') r.w++;
      else if (res === 'D') r.d++;
      else if (res === 'L') r.l++;
    }
    return r;
  };

  const home = mine.filter((m) => m.home.id === teamId);
  const away = mine.filter((m) => m.away.id === teamId);
  return {
    home,
    away,
    record: tally(mine),
    homeRecord: tally(home),
    awayRecord: tally(away),
  };
}

/* ── 순위표 ─────────────────────────────────────────── */

type Acc = Omit<StandingRow, 'rank'>;

function blank(team: TeamRef): Acc {
  return { team, played: 0, win: 0, draw: 0, loss: 0, gf: 0, ga: 0, gd: 0, points: 0, form: [] };
}

function applyMatches(acc: Map<string, Acc>, matches: Match[], seedOnly: boolean) {
  for (const m of matches) {
    if (m.status !== 'finished' || m.homeScore === undefined || m.awayScore === undefined) continue;
    // 시드에 없는 팀은 넣지 않는다(다른 대회 경기가 섞이는 것을 막는다)
    if (seedOnly && (!acc.has(m.home.id) || !acc.has(m.away.id))) continue;
    const h = acc.get(m.home.id) ?? blank(m.home);
    const a = acc.get(m.away.id) ?? blank(m.away);
    acc.set(m.home.id, h);
    acc.set(m.away.id, a);

    h.played++; a.played++;
    h.gf += m.homeScore; h.ga += m.awayScore;
    a.gf += m.awayScore; a.ga += m.homeScore;
    if (m.homeScore > m.awayScore) { h.win++; h.points += 3; a.loss++; h.form.push('W'); a.form.push('L'); }
    else if (m.homeScore < m.awayScore) { a.win++; a.points += 3; h.loss++; a.form.push('W'); h.form.push('L'); }
    else { h.draw++; a.draw++; h.points++; a.points++; h.form.push('D'); a.form.push('D'); }
  }
}

function finish(acc: Map<string, Acc>): StandingRow[] {
  return [...acc.values()]
    .map((a) => ({ ...a, gd: a.gf - a.ga, form: a.form.slice(-5) }))
    .sort((x, y) => y.points - x.points || y.gd - x.gd || y.gf - x.gf || x.team.name.localeCompare(y.team.name))
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

/**
 * ESPN 순위표와 경기 기록을 합쳐 최종 표를 만든다.
 * @param espn    ESPN standings (참가팀 명단 + 공식 집계)
 * @param matches 해당 대회 경기들
 */
export function buildTable(
  espn: StandingTable | undefined,
  matches: Match[],
  competition: string,
  competitionName: string,
): StandingTable | null {
  // 1) ESPN 표가 있으면 그 팀 명단을 시드로 쓴다(아직 안 뛴 팀도 표에 남는다)
  if (espn && espn.rows.length) {
    const acc = new Map<string, Acc>();
    for (const r of espn.rows) acc.set(r.team.id, blank(r.team));
    applyMatches(acc, matches, true);

    // 2) 우리 기록이 ESPN 집계를 "모든 팀에 대해" 따라잡았을 때만 대체한다.
    //    한 팀이라도 기록이 모자라면 경기 수가 들쭉날쭉한 표가 나와
    //    승점 비교가 무의미해진다(실제로 경기 목록이 잘려 들어와 이 사고가 났었다).
    const covers = espn.rows.every((r) => (acc.get(r.team.id)?.played ?? 0) >= r.played);
    const ahead = espn.rows.some((r) => (acc.get(r.team.id)?.played ?? 0) > r.played);
    if (covers && ahead) {
      return {
        competition, competitionName,
        rows: finish(acc),
        derived: true,
        updatedAt: new Date().toISOString(),
      };
    }
    // ESPN 표를 그대로 쓰더라도 폼은 경기 기록에서 채워 넣는다
    const forms = formMap(matches);
    return {
      ...espn,
      competition,
      competitionName,
      derived: false,
      rows: espn.rows.map((r) => ({ ...r, form: forms.get(r.team.id) ?? r.form })),
    };
  }

  // 3) ESPN 표가 아예 없으면 경기 기록만으로 만든다 (컵 대회 등)
  const acc = new Map<string, Acc>();
  applyMatches(acc, matches, false);
  const rows = finish(acc);
  if (!rows.length) return null;
  return { competition, competitionName, rows, derived: true, updatedAt: new Date().toISOString() };
}

/** 경기 기록에서 팀별 최근 5경기 폼을 만든다 (ESPN 표에는 폼이 없다) */
export function formMap(matches: Match[]): Map<string, ResultOf[]> {
  const out = new Map<string, ResultOf[]>();
  const sorted = [...matches].sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc));
  for (const m of sorted) {
    for (const id of [m.home.id, m.away.id]) {
      const r = resultOf(m, id);
      if (!r) continue;
      const arr = out.get(id) ?? [];
      arr.push(r);
      out.set(id, arr);
    }
  }
  for (const [k, v] of out) out.set(k, v.slice(-5));
  return out;
}

/** 표가 몇 라운드까지 반영됐는지 */
export const tableRound = (t: StandingTable) => Math.max(0, ...t.rows.map((r) => r.played));

/* ── 공격포인트 순위 ────────────────────────────────── */

export interface LeaderRow {
  name: string;
  teamId: string;
  team?: TeamRef;
  goals: number;
  assists: number;
  points: number; // 공격포인트 = G + A
}

/**
 * 경기 득점 기록에서 득점·도움 순위를 만든다.
 * ESPN leaders 엔드포인트가 막히거나 비어 있을 때의 폴백이자,
 * 스냅샷 모드의 유일한 집계 경로다. (자책골은 집계에서 제외한다.)
 */
export function deriveLeaders(matches: Match[]): LeaderRow[] {
  const byName = new Map<string, LeaderRow>();
  const teamById = new Map<string, TeamRef>();

  const bump = (name: string, teamId: string, g: number, a: number) => {
    const key = `${name}|${teamId}`;
    const row = byName.get(key) ?? { name, teamId, goals: 0, assists: 0, points: 0 };
    row.goals += g;
    row.assists += a;
    byName.set(key, row);
  };

  for (const m of matches) {
    teamById.set(m.home.id, m.home);
    teamById.set(m.away.id, m.away);

    /* 1순위는 경기별 선수 기록(ESPN 요약 rosters). 득점뿐 아니라 **도움**도
       들어 있는 유일한 경로다. 스코어보드 득점 이벤트는 득점자만 주므로
       이게 없을 때의 폴백이다. */
    if (m.playerStats?.length) {
      for (const s of m.playerStats) bump(s.name, s.teamId, s.g || 0, s.a || 0);
      continue;
    }

    for (const g of m.goals) {
      if (!g.ownGoal && g.scorer && g.scorer !== '—') {
        const key = `${g.scorer}|${g.teamId}`;
        const row = byName.get(key) ?? { name: g.scorer, teamId: g.teamId, goals: 0, assists: 0, points: 0 };
        row.goals++;
        byName.set(key, row);
      }
      if (g.assist) {
        const key = `${g.assist}|${g.teamId}`;
        const row = byName.get(key) ?? { name: g.assist, teamId: g.teamId, goals: 0, assists: 0, points: 0 };
        row.assists++;
        byName.set(key, row);
      }
    }
  }

  return [...byName.values()]
    .map((r) => ({ ...r, points: r.goals + r.assists, team: teamById.get(r.teamId) }))
    .sort((a, b) => b.points - a.points || b.goals - a.goals || a.name.localeCompare(b.name));
}
