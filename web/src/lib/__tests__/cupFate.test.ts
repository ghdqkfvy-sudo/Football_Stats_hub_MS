import { describe, expect, it } from 'vitest';
import { fateLabel, gameResult, tieOutcome } from '../cupFate';
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
  it('라운드별 문구 — 결승은 우승 · 준우승, 3위 결정전은 3위 · 4위', () => {
    expect(fateLabel('Third Round', 'adv')).toBe('진출');
    expect(fateLabel('Rd of 16', 'out')).toBe('탈락');
    expect(fateLabel('Final', 'adv')).toBe('우승');
    expect(fateLabel('Final', 'out')).toBe('준우승');
    expect(fateLabel('3rd-Place Match', 'out')).toBe('4위');
  });
});
