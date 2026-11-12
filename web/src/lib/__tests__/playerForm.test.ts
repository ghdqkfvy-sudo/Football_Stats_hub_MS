import { describe, expect, it } from 'vitest';
import { byMonth, ourScore, per90, recentDelta, seasonAvg, startShare, teamRanks } from '../playerForm';
import type { PlayerSeason, RecentGame } from '../squad';

const game = (over: Partial<RecentGame> = {}): RecentGame => ({
  matchId: Math.random().toString(36).slice(2), kickoffUtc: '2026-11-08T20:00Z', competition: 'esp.1',
  opponent: 'VAL', opponentName: 'Valencia', opponentId: '94', homeAway: '원정', scoreline: '0 : 3',
  result: 'W', minutes: 90, started: true, goals: 0, assists: 0, yellow: 0, red: 0, ...over,
});

const player = (over: Partial<PlayerSeason> = {}): PlayerSeason => ({
  id: 'p', name: 'P', jersey: 9, pos: 'F', apps: 10, starts: 8, minutes: 800, goals: 0, assists: 0, points: 0,
  yellow: 0, red: 0, slots: {}, modalSlot: 0, posPlaces: {}, posAny: {}, modalPos: '', byComp: [], recent: [],
  realMinutes: true, score: 0, ...over,
});

describe('ourScore', () => {
  it('원정이면 뒤집어 우리 득점을 앞에', () => {
    expect(ourScore({ scoreline: '0 : 3', homeAway: '원정' })).toBe('3:0');
    expect(ourScore({ scoreline: '4 : 1', homeAway: '홈' })).toBe('4:1');
  });
  it('모양이 다르면 그대로', () => {
    expect(ourScore({ scoreline: '연기', homeAway: '홈' })).toBe('연기');
  });
});

describe('per90 / startShare', () => {
  it('90분당 값', () => {
    expect(per90(20, 1433)).toBe(1.26);
    expect(per90(1, 45)).toBeNull();
  });
  it('선발 비율', () => {
    expect(startShare({ apps: 13, starts: 8 })).toBe(62);
    expect(startShare({ apps: 0, starts: 0 })).toBeNull();
  });
});

describe('seasonAvg / recentDelta', () => {
  const recent = [8, 8, 8, 8, 8, 6, 6, 6].map((rating) => game({ rating }));
  it('시즌 평균이 없으면 경기 평점의 평균', () => {
    expect(seasonAvg({ rating: undefined, recent })).toBe(7.25);
    expect(seasonAvg({ rating: 7.9, recent })).toBe(7.9);
  });
  it('최근 5경기와 시즌 평균의 차', () => {
    expect(recentDelta({ rating: 7.2, recent })).toEqual({ recent: 8, delta: 0.8 });
  });
  it('평점 있는 경기가 6경기 미만이면 견주지 않는다', () => {
    expect(recentDelta({ rating: 7.2, recent: recent.slice(0, 5) })).toBeNull();
    expect(recentDelta({ rating: 7.2, recent: [...recent.slice(0, 5), game()] })).toBeNull();
  });
});

describe('teamRanks', () => {
  const a = player({ id: 'a', goals: 17, assists: 3, points: 20, minutes: 1400, rating: 8.3 });
  const b = player({ id: 'b', goals: 5, assists: 6, points: 11, minutes: 1300, rating: 8.0 });
  const c = player({ id: 'c', goals: 5, assists: 0, points: 5, minutes: 300, rating: 9.1, apps: 2 });
  const d = player({ id: 'd', goals: 4, assists: 1, points: 5, minutes: 900, rating: 7.0 });
  const all = [a, b, c, d];
  it('3위 안에 드는 항목만, 같은 값은 같은 순위', () => {
    expect(teamRanks(a, all).map((r) => `${r.label}${r.rank}`)).toEqual(['득점1', '도움2', '공격P1', '평점1', '출전 시간1']);
    expect(teamRanks(b, all).find((r) => r.key === 'goals')?.rank).toBe(2);
    expect(teamRanks(d, all).find((r) => r.key === 'goals')).toBeUndefined();   // 4위
  });
  it('0 은 순위가 없고, 평점은 5경기 이상끼리만', () => {
    expect(teamRanks(c, all).some((r) => r.key === 'assists')).toBe(false);
    expect(teamRanks(c, all).some((r) => r.key === 'rating')).toBe(false);
    expect(teamRanks(a, all).find((r) => r.key === 'rating')?.rank).toBe(1);   // c(9.1 · 2경기)는 빠진다
  });
});

describe('byMonth', () => {
  it('KST 달로 묶는다 — 10.31 20:00Z 는 11월 1일 새벽', () => {
    const g = [game({ kickoffUtc: '2026-11-08T20:00Z' }), game({ kickoffUtc: '2026-10-31T20:00Z' }), game({ kickoffUtc: '2026-10-25T12:00Z' })];
    expect(byMonth(g).map((m) => [m.month, m.games.length])).toEqual([[11, 2], [10, 1]]);
  });
});
