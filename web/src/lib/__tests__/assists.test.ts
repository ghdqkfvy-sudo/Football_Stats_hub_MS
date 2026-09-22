import { describe, expect, it } from 'vitest';
import { resolveAssists, type MatchPlayerStat } from '../assists';
import type { GoalEvent } from '../types';

const goal = (o: Partial<GoalEvent> & { minute: number; teamId: string }): GoalEvent => ({
  clock: `${o.minute}'`, scorer: '—', ownGoal: false, penalty: false, ...o,
});

const stat = (o: Partial<MatchPlayerStat> & { name: string; teamId: string }): MatchPlayerStat =>
  ({ g: 0, a: 0, ...o });

describe('resolveAssists', () => {
  it('도움이 골보다 적으면 아무 골에도 붙이지 않는다', () => {
    /* ⚠️ 예전에는 "가능한 후보가 하나뿐" 이면 무조건 붙여서, 단독 드리블
       골에도 남의 이름이 찍혔다. 어느 골이 도움 없이 들어갔는지 알 수
       없으므로 전부 아래 "도움" 줄로 보내야 한다. */
    const goals = [goal({ minute: 10, teamId: 'A', scorer: 'Striker' }), goal({ minute: 70, teamId: 'A', scorer: 'Winger' })];
    const stats = [
      stat({ name: 'Striker', teamId: 'A', g: 1 }),
      stat({ name: 'Winger', teamId: 'A', g: 1 }),
      stat({ name: 'Playmaker', teamId: 'A', a: 1 }),
    ];
    const { inferred, leftover } = resolveAssists(goals, stats);
    expect(inferred.size).toBe(0);
    expect(leftover.map((x) => x.name)).toEqual(['Playmaker']);
  });

  it('수가 맞으면 출전 구간으로 좁혀 배정한다', () => {
    const goals = [
      goal({ minute: 20, teamId: 'A', scorer: 'Striker' }),
      goal({ minute: 80, teamId: 'A', scorer: 'Striker' }),
    ];
    const stats = [
      stat({ name: 'Striker', teamId: 'A', g: 2 }),
      // 전반만 뛴 선수 / 후반에 들어온 선수 — 각자 자기 시간대의 골을 돕는다
      stat({ name: 'FirstHalf', teamId: 'A', a: 1, in: 0, out: 45 }),
      stat({ name: 'SecondHalf', teamId: 'A', a: 1, in: 60, out: null }),
    ];
    const { inferred, leftover } = resolveAssists(goals, stats);
    expect(inferred.get(0)?.name).toBe('FirstHalf');
    expect(inferred.get(1)?.name).toBe('SecondHalf');
    expect(leftover).toEqual([]);
  });

  it('API 가 이미 붙여 둔 도움을 장부에서 뺀다 — 같은 도움이 두 번 나오지 않는다', () => {
    /* ⚠️ 실제 버그: 벨링엄 골에 "비니시우스" 가 이미 붙어 있는데도 그의
       도움 1개가 후보로 남아 다른 골에 또 배정되고 아래 줄에도 다시 나왔다. */
    const goals = [
      goal({ minute: 35, teamId: 'A', scorer: 'Bellingham', assist: 'Vinicius Junior' }),
      goal({ minute: 60, teamId: 'A', scorer: 'Mbappe' }),
    ];
    const stats = [
      stat({ name: 'Vinícius Júnior', teamId: 'A', a: 1 }),   // 표기가 다르다 (발음기호)
      stat({ name: 'Bellingham', teamId: 'A', g: 1 }),
      stat({ name: 'Mbappe', teamId: 'A', g: 1 }),
    ];
    const { inferred, leftover } = resolveAssists(goals, stats);
    // 비니시우스의 1도움은 이미 35분 골에 쓰였다 → 60분 골에 또 붙지 않는다
    expect(inferred.size).toBe(0);
    expect(leftover).toEqual([]);
  });

  it('id 가 있으면 이름 표기 차이를 무시하고 맞춘다', () => {
    const goals = [
      goal({ minute: 35, teamId: 'A', scorer: 'Bellingham', assist: 'Vini Jr.', assistId: '111' } as Partial<GoalEvent> & { minute: number; teamId: string }),
    ];
    const stats = [stat({ id: '111', name: '완전히 다른 표기', teamId: 'A', a: 1 })];
    const { leftover } = resolveAssists(goals, stats);
    expect(leftover).toEqual([]);
  });

  it('PK·자책골에는 도움을 붙이지 않는다', () => {
    const goals = [
      goal({ minute: 30, teamId: 'A', scorer: 'Taker', penalty: true }),
      goal({ minute: 50, teamId: 'A', scorer: 'Unlucky', ownGoal: true }),
    ];
    const stats = [stat({ name: 'Playmaker', teamId: 'A', a: 1 })];
    const { inferred, leftover } = resolveAssists(goals, stats);
    expect(inferred.size).toBe(0);
    expect(leftover.map((x) => x.name)).toEqual(['Playmaker']);
  });

  it('자기 골을 자기가 돕지 않는다', () => {
    const goals = [goal({ minute: 40, teamId: 'A', scorer: 'Solo' })];
    const stats = [stat({ name: 'Solo', teamId: 'A', g: 1, a: 1, in: 0, out: null })];
    const { inferred, leftover } = resolveAssists(goals, stats);
    expect(inferred.size).toBe(0);
    expect(leftover.map((x) => x.name)).toEqual(['Solo']);
  });

  it('기록이 없으면 조용히 비운다', () => {
    expect(resolveAssists([], undefined)).toEqual({ inferred: new Map(), leftover: [] });
  });

  it('상대 팀 도움이 우리 팀 골로 넘어가지 않는다', () => {
    const goals = [goal({ minute: 20, teamId: 'A', scorer: 'Ours' })];
    const stats = [
      stat({ name: 'Ours', teamId: 'A', g: 1 }),
      stat({ name: 'Theirs', teamId: 'B', a: 1 }),
    ];
    const { inferred, leftover } = resolveAssists(goals, stats);
    expect(inferred.size).toBe(0);
    expect(leftover.map((x) => x.name)).toEqual(['Theirs']);
  });
});
