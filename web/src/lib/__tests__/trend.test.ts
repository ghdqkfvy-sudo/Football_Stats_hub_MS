import { describe, expect, it } from 'vitest';
import { axisTicks, buildTrend } from '../trend';
import type { Match } from '../types';

const team = (id: string) => ({ id, name: `Team${id}`, shortName: id, abbr: id, logo: '' });

function m(day: number, h: string, a: string, hs?: number, as?: number): Match {
  return {
    id: `${day}${h}${a}`, kickoffUtc: `2026-09-${String(day).padStart(2, '0')}T12:00Z`,
    competition: 'eng.1', competitionName: 'PL',
    status: hs === undefined ? 'scheduled' : 'finished',
    home: team(h), away: team(a), homeScore: hs, awayScore: as, goals: [], goalsLoaded: true,
  };
}

describe('buildTrend', () => {
  /* 1R: A 2-0 B, C 1-1 D   2R: B 3-0 C, D 1-0 A */
  const matches = [m(1, 'A', 'B', 2, 0), m(1, 'C', 'D', 1, 1), m(8, 'B', 'C', 3, 0), m(8, 'D', 'A', 1, 0)];

  it('라운드마다 순위와 승점을 쌓는다', () => {
    const t = buildTrend(matches);
    expect(t.rounds).toBe(2);
    expect(t.teams).toBe(4);
    expect(t.series.get('A')!.map((p) => [p.rank, p.points])).toEqual([[1, 3], [3, 3]]);
    /* 2R: D 4점 1위, B 3점(+1) 2위, A 3점(+1 · 다득점 2 < 3) 3위, C 1점 4위 */
    expect(t.series.get('D')!.map((p) => p.rank)).toEqual([3, 1]);   // 1R 은 C·D 동률 — 이름순
    expect(t.series.get('B')!.map((p) => p.rank)).toEqual([4, 2]);
    expect(t.leaderPoints).toEqual([3, 4]);
  });

  it('그 라운드 경기(상대 · 스코어 · 홈/원정)를 함께 준다', () => {
    const p = buildTrend(matches).series.get('A')![1];
    expect(p).toMatchObject({ round: 2, result: 'L', home: false, gf: 0, ga: 1 });
    expect(p.opponent.id).toBe('D');
  });

  it('예정 경기는 세지 않고, 덜 치른 팀의 선은 치른 경기까지만', () => {
    const t = buildTrend([...matches, m(15, 'A', 'C', 1, 0), m(15, 'B', 'D')]);
    expect(t.rounds).toBe(3);
    expect(t.series.get('A')).toHaveLength(3);
    expect(t.series.get('B')).toHaveLength(2);
    /* 3R 순위는 B·D 의 2경기 기록과 견준다 — A 6점 1위 */
    expect(t.series.get('A')![2].rank).toBe(1);
  });

  it('시드에 없는 팀이 낀 경기는 버리고, 안 뛴 팀도 팀 수에 든다', () => {
    const t = buildTrend([...matches, m(9, 'A', 'X', 5, 0)], ['A', 'B', 'C', 'D', 'E']);
    expect(t.series.get('A')).toHaveLength(2);
    expect(t.series.has('X')).toBe(false);
    expect(t.teams).toBe(5);
    expect(t.series.get('E')).toEqual([]);
  });

  it('경기가 없으면 빈 결과', () => {
    expect(buildTrend([])).toMatchObject({ rounds: 0, teams: 0, leaderPoints: [] });
  });
});

describe('axisTicks', () => {
  it('처음과 끝은 항상, 끝에 붙는 눈금은 뺀다', () => {
    expect(axisTicks(20, 5)).toEqual([1, 5, 10, 15, 20]);
    expect(axisTicks(12, 5)).toEqual([1, 5, 10, 12]);
    expect(axisTicks(11, 5)).toEqual([1, 5, 11]);
    expect(axisTicks(36, 10)).toEqual([1, 10, 20, 30, 36]);
    expect(axisTicks(1, 5)).toEqual([1]);
  });
});
