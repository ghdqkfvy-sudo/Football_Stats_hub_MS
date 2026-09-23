import { describe, expect, it } from 'vitest';
import {
  cycleIndex, matchesByDay, monthResults, nextUpBoard, nextUpOf,
  shiftWeek, weekKeys, weekLabel, weekStartKey,
} from '../summary';
import type { Match, MatchStatus } from '../types';

const team = (id: string) => ({
  id, name: `T${id}`, shortName: `T${id}`, abbr: id.toUpperCase().slice(0, 3), logo: '',
});

function m(id: string, kickoffUtc: string, status: MatchStatus = 'scheduled', home = 'A', away = 'B'): Match {
  return {
    id, kickoffUtc, competition: 'eng.1', competitionName: 'PL',
    status, home: team(home), away: team(away),
    homeScore: status === 'finished' ? 2 : undefined,
    awayScore: status === 'finished' ? 1 : undefined,
    goals: [], goalsLoaded: true,
  };
}

describe('nextUpOf', () => {
  const now = Date.parse('2026-09-23T12:00:00Z');

  it('아직 안 치른 가장 가까운 경기를 고른다', () => {
    const list = [
      m('1', '2026-09-20T12:00Z', 'finished'),
      m('2', '2026-09-27T12:00Z'),
      m('3', '2026-09-24T12:00Z'),
    ];
    expect(nextUpOf(list, now)?.id).toBe('3');
  });

  it('진행 중인 경기가 있으면 그게 다음 경기다', () => {
    /* ⚠️ 킥오프가 지났다고 건너뛰면 경기 중에 히어로가 다음 주를 가리킨다 */
    const list = [m('live', '2026-09-23T11:30Z', 'live'), m('next', '2026-09-27T12:00Z')];
    expect(nextUpOf(list, now)?.id).toBe('live');
  });

  it('남은 경기가 없으면 undefined', () => {
    expect(nextUpOf([m('1', '2026-09-01T12:00Z', 'finished')], now)).toBeUndefined();
    expect(nextUpOf([], now)).toBeUndefined();
  });
});

describe('nextUpBoard', () => {
  const now = Date.parse('2026-09-23T12:00:00Z');

  it('가장 가까운 경기를 가진 팀이 맨 앞(히어로)이다', () => {
    const board = nextUpBoard([
      { id: 'chelsea', matches: [m('c', '2026-09-28T14:00Z')] },
      { id: 'korea', matches: [m('k', '2026-09-24T10:00Z')] },
      { id: 'real-madrid', matches: [m('r', '2026-09-26T19:00Z')] },
    ], now);
    expect(board.map((x) => x.teamId)).toEqual(['korea', 'real-madrid', 'chelsea']);
  });

  it('남은 경기가 없는 팀은 아예 빠진다', () => {
    const board = nextUpBoard([
      { id: 'a', matches: [m('1', '2026-09-01T12:00Z', 'finished')] },
      { id: 'b', matches: [m('2', '2026-09-30T12:00Z')] },
    ], now);
    expect(board.map((x) => x.teamId)).toEqual(['b']);
  });
});

describe('주 계산', () => {
  it('어느 요일이든 그 주 월요일로 모인다', () => {
    // 2026-09-23 은 수요일 → 그 주 월요일은 09-21
    expect(weekStartKey('2026-09-23')).toBe('2026-09-21');
    expect(weekStartKey('2026-09-21')).toBe('2026-09-21');   // 월요일 자신
    expect(weekStartKey('2026-09-27')).toBe('2026-09-21');   // 일요일
    expect(weekStartKey('2026-09-28')).toBe('2026-09-28');   // 다음 월요일
  });

  it('월~일 7일을 만든다', () => {
    const keys = weekKeys('2026-09-21');
    expect(keys.length).toBe(7);
    expect(keys[0]).toBe('2026-09-21');
    expect(keys[6]).toBe('2026-09-27');
  });

  it('달과 해를 넘어가도 이어진다', () => {
    expect(weekKeys('2026-12-28')[6]).toBe('2027-01-03');
    expect(shiftWeek('2026-12-28', 1)).toBe('2027-01-04');
    expect(shiftWeek('2027-01-04', -1)).toBe('2026-12-28');
  });

  it('라벨은 M/D ~ M/D', () => {
    expect(weekLabel('2026-09-21')).toBe('9/21 ~ 9/27');
    expect(weekLabel('2026-12-28')).toBe('12/28 ~ 1/3');
  });
});

describe('matchesByDay', () => {
  it('KST 날짜로 담고 킥오프 순으로 세운다', () => {
    /* 9/23 19:00Z == 9/24 04:00 KST — 새벽 경기는 다음 날 칸이다 */
    const byDay = matchesByDay([
      { id: 'a', matches: [m('late', '2026-09-23T19:00Z'), m('early', '2026-09-23T06:00Z')] },
    ]);
    expect([...byDay.keys()].sort()).toEqual(['2026-09-23', '2026-09-24']);
    expect(byDay.get('2026-09-23')!.map((x) => x.match.id)).toEqual(['early']);
    expect(byDay.get('2026-09-24')!.map((x) => x.match.id)).toEqual(['late']);
  });

  it('우리 팀끼리 맞붙은 경기는 한 번만 넣는다', () => {
    /* ⚠️ 첼시 vs 맨유는 두 팀의 일정 파일에 모두 들어 있다 —
       그대로 두면 같은 경기가 캘린더 한 칸에 두 줄로 찍힌다. */
    const derby = m('derby', '2026-09-23T14:00Z');
    const byDay = matchesByDay([
      { id: 'chelsea', matches: [derby] },
      { id: 'man-united', matches: [derby] },
    ]);
    expect(byDay.get('2026-09-23')!.length).toBe(1);
    expect(byDay.get('2026-09-23')![0].teamId).toBe('chelsea');   // 먼저 온 팀 기준
  });

  it('같은 날 여러 경기는 시간순', () => {
    /* KST 9/23 은 UTC 9/22 15:00 ~ 9/23 14:59 다 — 세 경기를 그 안에 둔다
       (16:00Z 는 이미 9/24 01:00 KST 라 다른 칸이다) */
    const byDay = matchesByDay([
      { id: 'a', matches: [m('3', '2026-09-23T12:00Z')] },
      { id: 'b', matches: [m('1', '2026-09-22T15:30Z')] },
      { id: 'c', matches: [m('2', '2026-09-23T06:00Z')] },
    ]);
    expect(byDay.get('2026-09-23')!.map((x) => x.match.id)).toEqual(['1', '2', '3']);
  });
});

describe('cycleIndex', () => {
  it('같은 날짜를 다시 누르면 다음 경기로 넘어간다', () => {
    expect(cycleIndex(null, '2026-09-23', 0, 3)).toBe(0);         // 처음 선택
    expect(cycleIndex('2026-09-23', '2026-09-23', 0, 3)).toBe(1); // 두 번째
    expect(cycleIndex('2026-09-23', '2026-09-23', 1, 3)).toBe(2);
    expect(cycleIndex('2026-09-23', '2026-09-23', 2, 3)).toBe(0); // 한 바퀴
  });

  it('다른 날짜를 누르면 처음부터', () => {
    expect(cycleIndex('2026-09-23', '2026-09-24', 2, 2)).toBe(0);
  });

  it('경기가 없으면 0', () => {
    expect(cycleIndex('2026-09-23', '2026-09-23', 0, 0)).toBe(0);
  });
});

describe('monthResults', () => {
  it('그 달에 끝난 경기만, 최신순으로', () => {
    const feeds = [{
      id: 'a',
      matches: [
        m('1', '2026-09-05T12:00Z', 'finished'),
        m('2', '2026-09-20T12:00Z', 'finished'),
        m('3', '2026-09-30T12:00Z'),               // 아직 안 끝남
        m('4', '2026-08-30T12:00Z', 'finished'),   // 지난달
      ],
    }];
    expect(monthResults(feeds, '2026-09').map((x) => x.match.id)).toEqual(['2', '1']);
  });

  it('우리 팀끼리의 경기는 한 번만', () => {
    const derby = m('derby', '2026-09-10T12:00Z', 'finished');
    const rows = monthResults([
      { id: 'chelsea', matches: [derby] },
      { id: 'man-united', matches: [derby] },
    ], '2026-09');
    expect(rows.length).toBe(1);
  });

  it('KST 기준으로 달을 가른다', () => {
    /* 8/31 16:00Z == 9/1 01:00 KST → 9월 경기다 */
    const feeds = [{ id: 'a', matches: [m('x', '2026-08-31T16:00Z', 'finished')] }];
    expect(monthResults(feeds, '2026-09').length).toBe(1);
    expect(monthResults(feeds, '2026-08').length).toBe(0);
  });
});
