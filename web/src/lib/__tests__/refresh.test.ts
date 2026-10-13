import { describe, expect, it } from 'vitest';
import { FEED_POLL_MS, LIVE_POLL_MS, inMatchWindow, mergeMatches, pollDelay } from '../refresh';
import type { Match } from '../types';

const team = (id: string) => ({ id, name: id, shortName: id, abbr: id, logo: '' });
const mk = (over: Partial<Match>): Match => ({
  id: '1', kickoffUtc: '2026-10-14T19:00:00Z', competition: 'esp.1', competitionName: 'La Liga',
  status: 'scheduled', home: team('86'), away: team('83'), goals: [], goalsLoaded: false, ...over,
});
const at = (iso: string) => Date.parse(iso);

describe('inMatchWindow', () => {
  it('진행 중 경기가 있으면 언제든 경기 시간대다', () => {
    expect(inMatchWindow([mk({ status: 'live' })], at('2026-01-01T00:00:00Z'))).toBe(true);
  });
  it('킥오프 10분 전부터 3시간 뒤까지', () => {
    const m = [mk({})];
    expect(inMatchWindow(m, at('2026-10-14T18:49:00Z'))).toBe(false);
    expect(inMatchWindow(m, at('2026-10-14T18:51:00Z'))).toBe(true);
    expect(inMatchWindow(m, at('2026-10-14T21:59:00Z'))).toBe(true);
    expect(inMatchWindow(m, at('2026-10-14T22:01:00Z'))).toBe(false);
  });
  it('시각 미정·종료 경기는 세지 않는다', () => {
    expect(inMatchWindow([mk({ timeTBD: true })], at('2026-10-14T19:00:00Z'))).toBe(false);
    expect(inMatchWindow([mk({ status: 'finished' })], at('2026-10-14T19:00:00Z'))).toBe(false);
  });
});

describe('pollDelay', () => {
  it('프록시면 30초, 정적 피드면 2분, 경기 시간대 밖이면 null', () => {
    const live = [mk({ status: 'live' })];
    expect(pollDelay(live, true)).toBe(LIVE_POLL_MS);
    expect(pollDelay(live, false)).toBe(FEED_POLL_MS);
    expect(pollDelay([mk({})], true, at('2026-01-01T00:00:00Z'))).toBeNull();
  });
});

describe('mergeMatches', () => {
  const goal: Match['goals'][number] = { minute: 10, clock: "10'", teamId: '86', scorer: 'A', ownGoal: false, penalty: false };
  it('종료 경기의 불러 둔 득점은 이어 붙인다', () => {
    const prev = [mk({ status: 'finished', goals: [goal], goalsLoaded: true })];
    const next = [mk({ status: 'finished' })];
    expect(mergeMatches(prev, next)[0].goals).toEqual([goal]);
    expect(mergeMatches(prev, next)[0].goalsLoaded).toBe(true);
  });
  it('진행 중 → 종료로 바뀐 경기는 새 값을 쓴다', () => {
    const prev = [mk({ status: 'live', goals: [goal], goalsLoaded: true })];
    const next = [mk({ status: 'finished' })];
    expect(mergeMatches(prev, next)[0].goalsLoaded).toBe(false);
  });
});
