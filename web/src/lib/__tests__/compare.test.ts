import { describe, expect, it } from 'vitest';
import { pointsPerGame, seasonRecord } from '../compare';
import type { Match } from '../types';

const team = (id: string) => ({ id, name: id, shortName: id, abbr: id, logo: '' });
const m = (id: string, at: string, home: string, away: string, hs: number, as: number, competition = 'eng.1'): Match => ({
  id, kickoffUtc: at, competition, competitionName: competition, status: 'finished',
  home: team(home), away: team(away), homeScore: hs, awayScore: as, goals: [], goalsLoaded: false,
});

describe('seasonRecord', () => {
  it('모든 대회를 합치고 친선전은 뺀다 · 폼은 오른쪽이 최근', () => {
    const r = seasonRecord([
      m('1', '2026-08-01T00:00Z', 'A', 'B', 2, 0),
      m('0', '2026-07-20T00:00Z', 'A', 'C', 5, 0, 'club.friendly'),
      m('2', '2026-08-10T00:00Z', 'C', 'A', 1, 1, 'uefa.champions'),
      m('3', '2026-08-20T00:00Z', 'A', 'D', 0, 3),
    ], 'A');
    expect(r).toMatchObject({ played: 3, win: 1, draw: 1, loss: 1, gf: 3, ga: 4 });
    expect(r.form).toEqual(['W', 'D', 'L']);
  });
});

describe('pointsPerGame', () => {
  it('소수 둘째 자리 · 0경기는 null', () => {
    expect(pointsPerGame(18, 8)).toBe(2.25);
    expect(pointsPerGame(10, 3)).toBe(3.33);
    expect(pointsPerGame(0, 0)).toBeNull();
  });
});
