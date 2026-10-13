import type { Match } from './types';
import { resultOf } from './league';
import type { CupRound } from './api';
import { isLeaguePhase, roundKo } from './rounds';

/**
 * Summary 팀 비교 — 우리 클럽들을 같은 잣대로 나란히.
 *
 * 리그가 달라(라리가 vs 프리미어리그) 순위·승점을 그대로 비교할 수 없으므로
 * **경기당 승점**과 **모든 대회 합산 전적**을 같이 둔다.
 * 친선전은 시즌 기록이 아니라 뺀다.
 */
export interface SeasonRecord {
  played: number;
  win: number;
  draw: number;
  loss: number;
  gf: number;
  ga: number;
  /** 모든 대회 최근 5경기 — 왼쪽이 오래된 것, 오른쪽이 최근 */
  form: ('W' | 'D' | 'L')[];
}

const FRIENDLY = /friendly/;

export function seasonRecord(matches: Match[], teamId: string): SeasonRecord {
  const done = matches
    .filter((m) => !FRIENDLY.test(m.competition) && (m.home.id === teamId || m.away.id === teamId))
    .filter((m) => resultOf(m, teamId) !== null)
    .sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc));
  const rec: SeasonRecord = { played: 0, win: 0, draw: 0, loss: 0, gf: 0, ga: 0, form: [] };
  for (const m of done) {
    const r = resultOf(m, teamId)!;
    const home = m.home.id === teamId;
    rec.played++;
    if (r === 'W') rec.win++;
    else if (r === 'D') rec.draw++;
    else rec.loss++;
    rec.gf += (home ? m.homeScore : m.awayScore) ?? 0;
    rec.ga += (home ? m.awayScore : m.homeScore) ?? 0;
    rec.form.push(r);
  }
  rec.form = rec.form.slice(-5);
  return rec;
}

/** 경기당 승점 (소수 둘째 자리) — 치른 경기가 없으면 null */
export function pointsPerGame(points: number, played: number): number | null {
  return played > 0 ? Math.round((points / played) * 100) / 100 : null;
}

/* ── 유럽대항전 단계 ─────────────────────────────────────── */


/**
 * 팀 비교의 "챔스" 칸.
 *  · 리그 페이즈 중   → 리그 페이즈 순위 ("12위")
 *  · 리그 페이즈 끝   → 순위로 갈린 결과 (1–8위 16강 직행 · 9–24위 플레이오프 · 25위↓ 탈락)
 *  · 토너먼트         → 몇 강인지 ("16강"), 끝난 라운드면 진출/탈락 ("8강 진출" · "16강 탈락")
 *
 * 라운드는 ESPN 이 대회마다 주는 calendar(시작·끝 시각)에 경기 날짜를 떨어뜨려 안다
 * (CupPath 와 같은 방법). 2차전까지 끝난 라운드는 합계(+승부차기)로 진출을 가린다 —
 * 다음 라운드 대진이 아직 안 나온 사이에 "탈락" 으로 잘못 보이지 않게.
 */
export type EuroStage =
  | { kind: 'league'; rank?: number; phaseOver: boolean; text: string }
  | { kind: 'ko'; round: string; status: 'playing' | 'through' | 'out' | 'won'; text: string };

/** 리그 페이즈 순위 → 결과 (36팀 단일 리그 방식: 챔스·유로파·컨퍼런스 공통) */
export function leaguePhaseOutcome(rank: number): string {
  if (rank <= 8) return '16강 직행';
  if (rank <= 24) return '플레이오프';
  return '탈락';
}

export function euroStage(
  matches: Match[],
  teamId: string,
  rounds: CupRound[],
  tableRank: number | undefined,
  now: number = Date.now(),
): EuroStage | null {
  const mine = matches
    .filter((m) => m.home.id === teamId || m.away.id === teamId)
    .sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc));
  if (!mine.length && tableRank === undefined) return null;

  const idxOf = (m: Match) => rounds.findIndex((r) => m.kickoffUtc >= r.start && m.kickoffUtc <= r.end);
  /* 지금 단계 = 경기(지난 것 + 잡힌 것)가 있는 가장 늦은 라운드 */
  const stageIdx = Math.max(-1, ...mine.map(idxOf));
  const round = rounds[stageIdx];

  const leagueView = (): EuroStage => {
    const phase = rounds.find((r) => isLeaguePhase(r.label));
    const phaseOver = !!phase && now > Date.parse(phase.end);
    if (tableRank === undefined) return { kind: 'league', phaseOver, text: '리그 페이즈' };
    return {
      kind: 'league', rank: tableRank, phaseOver,
      text: phaseOver ? `${tableRank}위 · ${leaguePhaseOutcome(tableRank)}` : `${tableRank}위`,
    };
  };

  /* 라운드를 모르면(캘린더 없음) 순위표에 있으면 리그 페이즈로 본다 */
  if (!round || isLeaguePhase(round.label)) return leagueView();

  const label = roundKo(round.label);
  const games = mine.filter((m) => idxOf(m) === stageIdx);
  if (games.some((m) => m.status !== 'finished')) {
    return { kind: 'ko', round: label, status: 'playing', text: label };
  }

  /* 라운드 종료 — 합계 득점, 같으면 마지막 경기 승부차기 */
  let ours = 0;
  let theirs = 0;
  for (const m of games) {
    const home = m.home.id === teamId;
    ours += (home ? m.homeScore : m.awayScore) ?? 0;
    theirs += (home ? m.awayScore : m.homeScore) ?? 0;
  }
  if (ours === theirs) {
    const last = games[games.length - 1];
    const home = last.home.id === teamId;
    const p = home ? last.homePens : last.awayPens;
    const q = home ? last.awayPens : last.homePens;
    if (p !== undefined && q !== undefined) { ours += p > q ? 1 : 0; theirs += q > p ? 1 : 0; }
  }
  const final = /^final$/i.test(round.label.trim());
  if (ours > theirs) {
    if (final) return { kind: 'ko', round: label, status: 'won', text: '우승' };
    const next = rounds[stageIdx + 1];
    return { kind: 'ko', round: label, status: 'through', text: next ? `${roundKo(next.label)} 진출` : `${label} 통과` };
  }
  if (ours < theirs) {
    return { kind: 'ko', round: label, status: 'out', text: final ? '준우승' : `${label} 탈락` };
  }
  /* 합계가 갈리지 않았는데 승부차기 기록도 없다 — 결과를 단정하지 않는다 */
  return { kind: 'ko', round: label, status: 'playing', text: label };
}
