import { describe, expect, it } from 'vitest';
import { barLength, seasonBars, tally } from '../seasonBars';
import { usageGroups, usageOf } from '../usage';
import { buildTrend, rankMoves } from '../trend';
import { alignRatings } from '../playerForm';
import type { Match } from '../types';
import type { PlayerSeason, RecentGame } from '../squad';

const team = (id: string) => ({ id, name: `T${id}`, shortName: id, abbr: id, logo: '' });
const m = (day: number, h: string, a: string, hs?: number, as?: number, over: Partial<Match> = {}): Match => ({
  id: `${day}${h}${a}`, kickoffUtc: `2026-09-${String(day).padStart(2, '0')}T12:00Z`, competition: 'eng.1', competitionName: 'PL',
  status: hs === undefined ? 'scheduled' : 'finished', home: team(h), away: team(a), homeScore: hs, awayScore: as,
  goals: [], goalsLoaded: true, ...over,
});

describe('seasonBars', () => {
  const ms = [m(8, 'B', 'A', 0, 3), m(1, 'A', 'B', 1, 1), m(15, 'A', 'C'), m(12, 'C', 'D', 2, 0), m(20, 'A', 'D', 1, 1, { winnerId: 'D' })];
  const bars = seasonBars(ms, 'A');
  it('우리 팀의 끝난 경기만, 오래된 순으로, 우리 기준 득실', () => {
    expect(bars.map((b) => [b.opponent.id, b.home, b.gf, b.ga, b.diff, b.result])).toEqual([
      ['B', true, 1, 1, 0, 'D'], ['B', false, 3, 0, 3, 'W'], ['D', true, 1, 1, 0, 'L'],
    ]);
  });
  it('승부차기는 승자 표시로 승패를 읽는다', () => {
    expect(bars[2].result).toBe('L');
  });
  it('합계 · 막대 길이', () => {
    expect(tally(bars)).toEqual({ w: 1, d: 1, l: 1, gf: 5, ga: 2 });
    expect([barLength(0), barLength(2), barLength(-1), barLength(7)]).toEqual([0, 0.5, 0.25, 1]);
  });
});

const game = (over: Partial<RecentGame>): RecentGame => ({
  matchId: Math.random().toString(36).slice(2), kickoffUtc: '2026-11-08T20:00Z', competition: 'esp.1', opponent: 'X', opponentName: 'X',
  opponentId: '1', homeAway: '홈', scoreline: '1 : 0', result: 'W', minutes: 90, started: true, goals: 0, assists: 0, yellow: 0, red: 0, ...over,
});
const player = (over: Partial<PlayerSeason>): PlayerSeason => ({
  id: 'p', name: 'P', jersey: 9, pos: 'F', apps: 0, starts: 0, minutes: 0, goals: 0, assists: 0, points: 0, yellow: 0, red: 0,
  slots: {}, modalSlot: 0, posPlaces: {}, posAny: {}, modalPos: '', byComp: [], recent: [], realMinutes: true, score: 0, ...over,
});

describe('usage', () => {
  it('선발로 뛴 시간과 교체로 뛴 시간을 가른다', () => {
    const p = player({ recent: [game({ minutes: 90 }), game({ minutes: 70 }), game({ started: false, minutes: 25 })] });
    expect(usageOf(p)).toMatchObject({ start: 160, sub: 25, total: 185 });
  });
  it('경기별 기록이 없으면 시즌 출전 시간 전부를 선발로', () => {
    expect(usageOf(player({ minutes: 300 }))).toMatchObject({ start: 300, sub: 0, total: 300 });
  });
  it('포지션마다 출전 시간 순, 안 뛴 선수는 뺀다', () => {
    const g = usageGroups([
      player({ id: 'f1', pos: 'F', minutes: 100 }), player({ id: 'f2', pos: 'F', minutes: 900 }),
      player({ id: 'd1', pos: 'D', minutes: 500 }), player({ id: 'g0', pos: 'G', minutes: 0 }),
    ]);
    expect(g.map((x) => [x.pos, x.rows.map((r) => r.p.id)])).toEqual([['F', ['f2', 'f1']], ['D', ['d1']]]);
  });
});

describe('rankMoves', () => {
  it('직전 라운드 대비 — 올라가면 양수, 그대로면 없다', () => {
    /* 1R: A 2-0 B, C 1-1 D → A1 C2 D3 B4   2R: B 3-0 C, D 1-0 A → D1 B2 A3 C4 */
    const t = buildTrend([m(1, 'A', 'B', 2, 0), m(1, 'C', 'D', 1, 1), m(8, 'B', 'C', 3, 0), m(8, 'D', 'A', 1, 0)]);
    const mv = rankMoves(t);
    expect([mv.get('A'), mv.get('B'), mv.get('C'), mv.get('D')]).toEqual([-2, 2, -2, 2]);
  });
  it('한 경기뿐이면 견주지 않는다', () => {
    expect(rankMoves(buildTrend([m(1, 'A', 'B', 2, 0)])).size).toBe(0);
  });
});

describe('alignRatings', () => {
  it('최근 경기 쪽을 맞추고, 짧은 쪽은 앞을 비운다', () => {
    const a = [game({ rating: 8 }), game({ rating: 7 }), game({})];          // 최신순
    const b = [game({ rating: 6 })];
    expect(alignRatings(a, b)).toEqual({ a: [null, 7, 8], b: [null, null, 6], len: 3 });
  });
  it('n 경기까지만', () => {
    const a = [1, 2, 3, 4].map((r) => game({ rating: r }));
    expect(alignRatings(a, [], 2)).toEqual({ a: [2, 1], b: [null, null], len: 2 });
  });
});
