import type { Match } from './types';
import { roundKo } from './rounds';

/**
 * 토너먼트(컵) 경기 결과 · 진출 여부 (2026-10-26) — CupPath 가 쓴다.
 * 승 · 무 · 패는 90분(연장 포함) 스코어로, 비긴 경기는 승부차기 승패를 따로 적는다.
 */

export const WDL_KO = { W: '승', D: '무', L: '패' } as const;

/** 한 경기 결과 — 90분(연장 포함) 스코어로 승 · 무 · 패, 비겼으면 승부차기 승패(점수 · ESPN 승자 표시) */
export function gameResult(m: Match, teamId: string): { wdl: 'W' | 'D' | 'L'; pk?: 'W' | 'L'; pkScore?: string } {
  const home = m.home.id === teamId;
  const ours = (home ? m.homeScore : m.awayScore) ?? 0;
  const theirs = (home ? m.awayScore : m.homeScore) ?? 0;
  if (ours !== theirs) return { wdl: ours > theirs ? 'W' : 'L' };
  const ph = m.homePens, pa = m.awayPens;
  if (ph != null && pa != null && ph !== pa) {
    const [po, pt] = home ? [ph, pa] : [pa, ph];
    return { wdl: 'D', pk: po > pt ? 'W' : 'L', pkScore: `${po}:${pt}` };
  }
  if (m.winnerId) return { wdl: 'D', pk: m.winnerId === teamId ? 'W' : 'L' };
  return { wdl: 'D' };
}

/**
 * 맞대결 라운드(1·2차전 모두 같은 상대)의 진출 여부 — 합산 스코어 → 승부차기 → ESPN 승자 표시 순.
 * 조별 · 리그 페이즈처럼 상대가 여럿이거나, 아직 안 끝났거나, 가릴 수 없으면 null.
 */
export function tieOutcome(games: Match[], teamId: string): 'adv' | 'out' | null {
  if (!games.length || games.some((g) => g.status !== 'finished')) return null;
  const oppOf = (g: Match) => (g.home.id === teamId ? g.away.id : g.home.id);
  if (new Set(games.map(oppOf)).size !== 1) return null;
  let ours = 0, theirs = 0;
  for (const g of games) {
    const home = g.home.id === teamId;
    ours += (home ? g.homeScore : g.awayScore) ?? 0;
    theirs += (home ? g.awayScore : g.homeScore) ?? 0;
  }
  if (ours !== theirs) return ours > theirs ? 'adv' : 'out';
  const last = games[games.length - 1];
  const r = gameResult(last, teamId);
  if (r.pk) return r.pk === 'W' ? 'adv' : 'out';
  return null;
}

export const fateLabel = (round: string, fate: 'adv' | 'out') => {
  const ko = roundKo(round);
  if (ko === '결승') return fate === 'adv' ? '우승' : '준우승';
  if (/3rd|third[- ]place/i.test(round) || ko === '3위 결정전') return fate === 'adv' ? '3위' : '4위';
  return fate === 'adv' ? '진출' : '탈락';
};

