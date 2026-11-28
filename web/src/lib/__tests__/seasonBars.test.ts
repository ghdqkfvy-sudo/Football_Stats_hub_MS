import { describe, expect, it } from 'vitest';
import { currentStreak, seasonBars, streakLabel } from '../seasonBars';
import type { Match } from '../types';

const team = (id: string) => ({ id, name: `T${id}`, shortName: `T${id}`, abbr: id, logo: '' });
function m(day: number, comp: string, hs: number, as: number): Match {
  return {
    id: `${day}`, kickoffUtc: `2026-09-${String(day).padStart(2, '0')}T12:00Z`,
    competition: comp, competitionName: comp, status: 'finished',
    home: team('A'), away: team('B'), homeScore: hs, awayScore: as, goals: [], goalsLoaded: true,
  };
}
const rs = (s: string) => [...s].map((result) => ({ result: result as 'W' | 'D' | 'L' }));

describe('seasonBars', () => {
  it('클럽 친선경기는 빼고, 국가대표 친선전은 남긴다', () => {
    const bars = seasonBars([m(1, 'club.friendly', 5, 0), m(2, 'esp.1', 1, 0), m(3, 'fifa.friendly', 2, 2)], 'A');
    expect(bars.map((b) => b.competition)).toEqual(['esp.1', 'fifa.friendly']);
  });
});

describe('currentStreak', () => {
  it('2연승 · 2연패 이상', () => {
    expect(currentStreak(rs('LDWWW'))).toEqual({ kind: 'win', n: 3 });
    expect(currentStreak(rs('WWLL'))).toEqual({ kind: 'loss', n: 2 });
  });
  it('연승 · 연패가 아니면 3경기 이상 무패 · 무승', () => {
    expect(currentStreak(rs('LWDWD'))).toEqual({ kind: 'unbeaten', n: 4 });
    expect(currentStreak(rs('WLDLD'))).toEqual({ kind: 'winless', n: 4 });
  });
  it('흐름이라 부르기 어려우면 null', () => {
    expect(currentStreak(rs('LW'))).toBeNull();
    expect(currentStreak(rs('WLDW'))).toBeNull();
    expect(currentStreak([])).toBeNull();
  });
  it('글자', () => {
    expect(streakLabel({ kind: 'win', n: 10 })).toBe('10연승 중');
    expect(streakLabel({ kind: 'loss', n: 3 })).toBe('3연패 중');
    expect(streakLabel({ kind: 'unbeaten', n: 5 })).toBe('5경기 무패');
    expect(streakLabel({ kind: 'winless', n: 4 })).toBe('4경기 무승');
  });
});
