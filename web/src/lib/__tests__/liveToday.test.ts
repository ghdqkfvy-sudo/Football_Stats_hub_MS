import { describe, expect, it } from 'vitest';
import { dedupeToday, orderToday, showToday } from '../live';
import type { LiveMatch } from '../../types/feedTypes';

const NOW = Date.parse('2026-10-20T15:00:00Z');
const l = (slug: string, phase: LiveMatch['phase'], kick: string, starters = 11) =>
  ({ slug, phase, kickoffUtc: kick, home: { starters: Array(starters).fill({}) } }) as unknown as LiveMatch;

describe('대한민국 › 오늘의 경기', () => {
  it('진행 중 → 킥오프 전(빠른 순) → 끝남(늦은 순)', () => {
    const got = orderToday([
      l('a', 'done', '2026-10-20T10:00Z'), l('b', 'pre', '2026-10-20T16:30Z'), l('c', 'live', '2026-10-20T14:30Z'),
      l('d', 'done', '2026-10-20T12:00Z'), l('e', 'pre', '2026-10-20T16:00Z'),
    ]);
    expect(got.map((x) => x.slug)).toEqual(['c', 'e', 'b', 'd', 'a']);
  });
  it('킥오프 전인데 라인업이 없으면 빼고, 경기 날이 아니면 뺀다', () => {
    expect(showToday(l('a', 'pre', '2026-10-20T16:00Z', 0), NOW)).toBe(false);
    expect(showToday(l('a', 'pre', '2026-10-20T16:00Z'), NOW)).toBe(true);
    expect(showToday(l('a', 'done', '2026-10-19T12:00Z'), NOW)).toBe(false);
    expect(showToday(null, NOW)).toBe(false);
  });
  it('지켜보는 두 팀끼리의 경기는 하나만 — 홈팀 쪽', () => {
    const m = (slug: string, espnId: string, ours: 'home' | 'away') => ({ slug, espnId, ours }) as unknown as LiveMatch;
    const got = dedupeToday([m('liverpool', '1', 'away'), m('chelsea', '2', 'home'), m('tottenham', '1', 'home')]);
    expect(got.map((x) => x.slug)).toEqual(['chelsea', 'tottenham']);
    expect(dedupeToday([m('a', '1', 'home'), m('b', '1', 'away')]).map((x) => x.slug)).toEqual(['a']);
  });
});
