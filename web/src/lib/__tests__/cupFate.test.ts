import { describe, expect, it } from 'vitest';
import { fateOf, gameResult, tieOutcome } from '../cupFate';
import type { Match } from '../types';

const m = (home: string, away: string, hs: number, as: number, extra: Partial<Match> = {}) =>
  ({ id: `${home}${away}${hs}${as}`, status: 'finished', home: { id: home }, away: { id: away }, homeScore: hs, awayScore: as, ...extra }) as unknown as Match;

describe('토너먼트 결과 · 진출', () => {
  it('승 · 패 · 무(승부차기 점수 / ESPN 승자 표시)', () => {
    expect(gameResult(m('A', 'B', 2, 0), 'A')).toEqual({ wdl: 'W' });
    expect(gameResult(m('A', 'B', 2, 3), 'A')).toEqual({ wdl: 'L' });
    expect(gameResult(m('A', 'B', 1, 1, { homePens: 3, awayPens: 4 }), 'B')).toEqual({ wdl: 'D', pk: 'W', pkScore: '4:3' });
    expect(gameResult(m('A', 'B', 1, 1, { winnerId: 'A' }), 'A')).toEqual({ wdl: 'D', pk: 'W' });
    expect(gameResult(m('A', 'B', 1, 1), 'A')).toEqual({ wdl: 'D' });
  });
  it('맞대결: 단판 · 1·2차전 합산 · 승부차기, 상대가 여럿(조별)이거나 안 끝났으면 null', () => {
    expect(tieOutcome([m('A', 'B', 2, 0)], 'A')).toBe('adv');
    expect(tieOutcome([m('A', 'B', 2, 3)], 'A')).toBe('out');
    expect(tieOutcome([m('A', 'B', 1, 0), m('B', 'A', 3, 1)], 'A')).toBe('out');
    expect(tieOutcome([m('A', 'B', 1, 1, { winnerId: 'A' })], 'A')).toBe('adv');
    expect(tieOutcome([m('A', 'B', 1, 0), m('C', 'A', 0, 2)], 'A')).toBeNull();
    expect(tieOutcome([m('A', 'B', 1, 0, { status: 'scheduled' } as Partial<Match>)], 'A')).toBeNull();
    expect(tieOutcome([m('A', 'B', 1, 1)], 'A')).toBeNull();
  });
  it('라운드별 배지 — 결승은 CHAMPIONS · RUNNERS-UP, 3위 결정전은 THIRD · FOURTH PLACE ("Third Round" 는 일반 라운드)', () => {
    expect(fateOf('Third Round', 'adv').label).toBe('THROUGH');
    expect(fateOf('Rd of 16', 'out').label).toBe('KNOCKED OUT');
    expect(fateOf('Final', 'adv').label).toBe('CHAMPIONS');
    expect(fateOf('Final', 'out').label).toBe('RUNNERS-UP');
    expect(fateOf('3rd-Place Match', 'out').label).toBe('FOURTH PLACE');
  });
});
