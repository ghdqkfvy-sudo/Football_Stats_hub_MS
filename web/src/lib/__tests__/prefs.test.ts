import { describe, expect, it } from 'vitest';
import { parsePrefs, startRoute, visibleTeams } from '../prefs';

const ALL = [{ id: 'real-madrid' }, { id: 'chelsea' }, { id: 'korea' }];

describe('parsePrefs', () => {
  it('없거나 깨진 값은 기본값', () => {
    expect(parsePrefs(null)).toEqual({ teams: null, start: 'last' });
    expect(parsePrefs('{oops')).toEqual({ teams: null, start: 'last' });
    expect(parsePrefs('{"teams":[1,2],"start":""}')).toEqual({ teams: null, start: 'last' });
  });
  it('저장한 값을 읽는다', () => {
    expect(parsePrefs('{"teams":["chelsea"],"start":"summary"}')).toEqual({ teams: ['chelsea'], start: 'summary' });
  });
});

describe('visibleTeams', () => {
  it('고른 팀만, 원래 순서대로', () => {
    expect(visibleTeams(ALL, { teams: ['korea', 'real-madrid'], start: 'last' }).map((t) => t.id)).toEqual(['real-madrid', 'korea']);
  });
  it('설정이 없거나 하나도 안 남으면 전부', () => {
    expect(visibleTeams(ALL, { teams: null, start: 'last' })).toHaveLength(3);
    expect(visibleTeams(ALL, { teams: [], start: 'last' })).toHaveLength(3);
    expect(visibleTeams(ALL, { teams: ['gone'], start: 'last' })).toHaveLength(3);
  });
});

describe('startRoute', () => {
  const ids = ALL.map((t) => t.id);
  it('마지막 화면이면 null, Summary · 팀이면 그 주소', () => {
    expect(startRoute({ teams: null, start: 'last' }, ids)).toBeNull();
    expect(startRoute({ teams: null, start: 'summary' }, ids)).toBe('#/');
    expect(startRoute({ teams: null, start: 'chelsea' }, ids)).toBe('#/chelsea');
  });
  it('없어진 팀이면 Summary', () => {
    expect(startRoute({ teams: null, start: 'gone' }, ids)).toBe('#/');
  });
});
