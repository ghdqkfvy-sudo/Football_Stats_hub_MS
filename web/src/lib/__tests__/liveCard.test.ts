import { describe, expect, it } from 'vitest';
import { clockMin, contributions, playedMin, scoreAt, slotChain, statPairs } from '../liveCard';
import type { LiveEvent, LivePlayer, LiveSide } from '../../types/feedTypes';

const P = (id: string, name: string, extra: Partial<LivePlayer> = {}) =>
  ({ id, name, last: name.split(' ').slice(-1)[0], no: null, rating: null, goals: 0, og: 0, assists: 0, cards: [], ...extra }) as LivePlayer;
const ev: LiveEvent[] = [
  { t: 'goal', min: 14, side: 'home', player: 'James Maddison', pid: '1', assist: 'Mohammed Kudus', score: [1, 0] },
  { t: 'goal', min: 50, side: 'away', player: 'Jack Rudoni', pid: '9', score: [1, 1] },
  { t: 'sub', min: 69, side: 'home', in: 'Ben Davies', inId: '3', out: 'Andrew Robertson', outId: '2', injury: true },
  { t: 'goal', min: 90, plus: 6, side: 'home', player: 'Ben Davies', pid: '3', score: [2, 1] },
];

describe('오늘의 경기 호버 카드 계산', () => {
  it('경기 시계 · 뛴 분', () => {
    expect(clockMin({ phase: 'live', clock: "67'" })).toBe(67);
    expect(clockMin({ phase: 'done', clock: 'FT' })).toBe(90);
    expect(playedMin(P('2', 'Andrew Robertson', { out: 69 }), true, { phase: 'done', clock: null })).toBe(69);
    expect(playedMin(P('3', 'Ben Davies', { in: 69 }), false, { phase: 'done', clock: null })).toBe(21);
    expect(playedMin(P('4', 'Bench Guy'), false, { phase: 'done', clock: null })).toBeNull();
  });
  it('그 분까지 스코어 · 골/도움', () => {
    expect(scoreAt(ev, 69)).toEqual([1, 1]);
    expect(scoreAt(ev, 10)).toEqual([0, 0]);
    expect(contributions(ev, P('3', 'Ben Davies')).goals.map((g) => g.min)).toEqual([90]);
    expect(contributions(ev, P('7', 'Mohammed Kudus')).assists.map((g) => g.min)).toEqual([14]);
  });
  it('자리를 거쳐 간 선수 · 기록 한 줄', () => {
    const side = { bench: [P('3', 'Ben Davies')] } as unknown as LiveSide;
    const subs = ev.filter((e): e is Extract<LiveEvent, { t: 'sub' }> => e.t === 'sub');
    expect(slotChain(P('2', 'Andrew Robertson'), side, subs).map((p) => p.id)).toEqual(['2', '3']);
    expect(statPairs({ sh: 3, sot: 1, kp: 2, pa: [41, 47], xg: 0.42, dist: 9800 })).toEqual([['슈팅', '3 (유효 1)'], ['키패스', '2'], ['패스', '41/47 · 87%'], ['xG', '0.42'], ['뛴 거리', '9.8km']]);
  });
});
