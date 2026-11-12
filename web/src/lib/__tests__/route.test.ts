import { describe, expect, it } from 'vitest';
import { formatRoute, parseRoute } from '../route';

describe('parseRoute / formatRoute', () => {
  it('팀 · 탭', () => {
    expect(parseRoute('#/chelsea/standings')).toEqual({ targetId: 'chelsea', tab: 'standings' });
    expect(parseRoute('#/')).toEqual({ targetId: null, tab: null });
    expect(formatRoute('chelsea', 'standings')).toBe('#/chelsea/standings');
    expect(formatRoute(null, null)).toBe('#/');
  });
  it('경기 · 선수 링크', () => {
    expect(parseRoute('#/chelsea/schedule/m/12345')).toEqual({ targetId: 'chelsea', tab: 'schedule', sub: { kind: 'm', id: '12345' } });
    expect(parseRoute('#/chelsea/players/p/678')).toEqual({ targetId: 'chelsea', tab: 'players', sub: { kind: 'p', id: '678' } });
    expect(formatRoute('chelsea', 'players', { kind: 'p', id: '678' })).toBe('#/chelsea/players/p/678');
  });
  it('모르는 꼬리는 버린다', () => {
    expect(parseRoute('#/chelsea/players/x/678')).toEqual({ targetId: 'chelsea', tab: 'players' });
    expect(parseRoute('#/chelsea/players/p')).toEqual({ targetId: 'chelsea', tab: 'players' });
  });
});
