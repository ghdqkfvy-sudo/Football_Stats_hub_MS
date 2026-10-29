import { describe, expect, it } from 'vitest';
import { currentRound, isKnockoutTree, tiesOf, treeOrder } from '../cupBracket';
import type { Match } from '../types';
import { dedupeCupRounds, type CupRoundData } from '../api';

const T = (id: string) => ({ id, name: id, shortName: id, abbr: id, logo: '' });
const m = (h: string, a: string, hs: number | undefined, as: number | undefined, kick: string, extra: Partial<Match> = {}) =>
  ({ id: `${h}${a}${kick}`, kickoffUtc: kick, status: hs == null ? 'scheduled' : 'finished', home: T(h), away: T(a), homeScore: hs, awayScore: as, ...extra }) as unknown as Match;

describe('컵 대진', () => {
  it('맞대결 묶기 — 단판 · 1·2차전 합산 · 승부차기 · ESPN 승자', () => {
    const ties = tiesOf([
      m('LIV', 'CHE', 1, 1, '2026-10-28', { homePens: 3, awayPens: 4 }),
      m('ARS', 'MCI', 1, 0, '2027-02-04'), m('MCI', 'ARS', 3, 1, '2027-02-11'),
      m('EVE', 'NEW', undefined, undefined, '2026-10-29'),
      m('BHA', 'LEI', 1, 1, '2026-10-28', { winnerId: 'BHA' }),
    ]);
    const by = (a: string) => ties.find((t) => t.a.id === a)!;
    expect([by('LIV').winnerId, by('LIV').pens]).toEqual(['CHE', [3, 4]]);
    expect([by('ARS').legs.length, by('ARS').agg, by('ARS').winnerId]).toEqual([2, [2, 3], 'MCI']);
    expect([by('EVE').state, by('EVE').winnerId]).toEqual(['scheduled', undefined]);
    expect(by('BHA').winnerId).toBe('BHA');
  });
  it('처음 보여 줄 라운드 · 트리 라운드 · 트리 순서', () => {
    const R = (label: string, ms: Match[]): CupRoundData => ({ label, start: '', end: '', matches: ms });
    const rounds = [R('Third Round', [m('A', 'B', 1, 0, '1')]), R('Fourth Round', [m('A', 'C', undefined, undefined, '2')]), R('Quarterfinals', [])];
    expect(currentRound(rounds)).toBe(1);
    expect(currentRound([rounds[0]])).toBe(0);
    expect([isKnockoutTree('Quarterfinals'), isKnockoutTree('Semifinals'), isKnockoutTree('Final'), isKnockoutTree('Fourth Round'), isKnockoutTree('3rd-Place Match')]).toEqual([true, true, true, false, false]);
    const qf = tiesOf([m('A', 'B', 1, 0, '1'), m('C', 'D', 1, 0, '2'), m('E', 'F', 1, 0, '3'), m('G', 'H', 0, 1, '4')]);
    const sf = tiesOf([m('A', 'E', undefined, undefined, '5'), m('C', 'H', undefined, undefined, '6')]);
    expect(treeOrder(qf, sf).map((t) => t.a.id)).toEqual(['A', 'E', 'C', 'G']);
  });
  it('한 경기는 한 라운드에만 — 가장 이른 라운드, 내용은 최신(미뤄진 코파 델 레이 경기)', () => {
    const R = (label: string, ms: Match[]): CupRoundData => ({ label, start: '', end: '', matches: ms });
    const old = m('A', 'B', undefined, undefined, '2026-10-28', { id: 'x' } as Partial<Match>);
    const moved = m('A', 'B', 2, 1, '2026-11-04', { id: 'x' } as Partial<Match>);
    const got = dedupeCupRounds([R('First Round', [old]), R('Second Round', [moved]), R('Round of 32', [moved])]);
    expect(got.map((r) => r.matches.length)).toEqual([1, 0, 0]);
    expect(got[0].matches[0].kickoffUtc).toBe('2026-11-04');
  });
});
