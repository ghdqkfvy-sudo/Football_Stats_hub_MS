import { describe, expect, it } from 'vitest';
import { isTodayLive, onPitch } from '../live';
import type { LiveMatch } from '../../types/feedTypes';

describe('오늘의 경기', () => {
  it('탭은 킥오프 2시간 전 ~ 18시간 뒤에만', () => {
    const live = { kickoffUtc: '2026-10-18T13:00:00Z' } as LiveMatch;
    expect(isTodayLive(live, Date.parse('2026-10-18T10:30:00Z'))).toBe(false);
    expect(isTodayLive(live, Date.parse('2026-10-18T11:30:00Z'))).toBe(true);
    expect(isTodayLive(live, Date.parse('2026-10-19T06:00:00Z'))).toBe(true);
    expect(isTodayLive(live, Date.parse('2026-10-19T08:00:00Z'))).toBe(false);
    expect(isTodayLive(null)).toBe(false);
  });

  it('경기장에 있는 선수 — 교체의 교체까지 따라간다', () => {
    const P = (id: string) => ({ id, name: id });
    const subs = [{ outId: 'a', inId: 'b', in: 'b', out: 'a' }, { outId: 'b', inId: 'c', in: 'c', out: 'b' }];
    const r = onPitch(P('a'), subs, [P('b'), P('c')]);
    expect(r.now.id).toBe('c');
    expect(r.chain.map((x) => x.id)).toEqual(['a', 'b']);
    expect(onPitch(P('z'), subs, [P('b')]).now.id).toBe('z');
  });
});

describe('득점 강조 팀 색', () => {
  it('어두운 배경에 보이는 FotMob 색 — 너무 하얀 원정 색은 밝은 화면용으로, 없으면 강조색', async () => {
    const { teamColor } = await import('../live');
    const live = { colors: { home: ['#C00808', '#C00808'], away: ['#ffffff', '#00A398'] } } as unknown as LiveMatch;
    expect(teamColor(live, 'home')).toBe('#C00808');
    expect(teamColor(live, 'away')).toBe('#00A398');
    expect(teamColor({ colors: null } as unknown as LiveMatch, 'home')).toBe('var(--accent)');
  });
});
