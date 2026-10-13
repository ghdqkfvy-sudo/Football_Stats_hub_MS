import type { Match } from './types';
import { resultOf } from './league';

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
