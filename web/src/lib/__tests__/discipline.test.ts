import { describe, expect, it } from 'vitest';
import { discipline } from '../discipline';
import type { Match } from '../types';
import type { RecentGame } from '../squad';

const NOW = Date.parse('2026-10-17T00:00:00Z');
const m = (id: string, comp: string, kick: string, status: 'finished' | 'scheduled'): Match => ({
  id, kickoffUtc: kick, competition: comp as Match['competition'], competitionName: comp, status,
  home: { id: '1', name: 'Us', shortName: 'Us', abbr: 'US', logo: '' },
  away: { id: '2', name: 'Them', shortName: 'Them', abbr: 'TH', logo: '' },
  goals: [], goalsLoaded: true,
} as Match);
const g = (id: string, comp: string, kick: string, yellow = 0, red = 0): RecentGame => ({
  matchId: id, kickoffUtc: kick, competition: comp, opponent: 'TH', opponentName: 'Them', opponentId: '2',
  homeAway: '홈', scoreline: '1:0', result: 'W', minutes: 90, started: true, yellow, red,
} as RecentGame);

/* 팀 일정: 리그 4경기 지남 → 10/19 리그 · 10/22 챔스 */
const team = [
  m('L1', 'eng.1', '2026-09-01T15:00Z', 'finished'),
  m('L2', 'eng.1', '2026-09-15T15:00Z', 'finished'),
  m('C1', 'uefa.champions', '2026-09-20T19:00Z', 'finished'),
  m('L3', 'eng.1', '2026-10-01T15:00Z', 'finished'),
  m('L4', 'eng.1', '2026-10-10T15:00Z', 'finished'),
  m('L5', 'eng.1', '2026-10-19T15:00Z', 'scheduled'),
  m('C2', 'uefa.champions', '2026-10-22T19:00Z', 'scheduled'),
];

describe('징계 — 대회별', () => {
  it('리그 경고 5장을 막 채우면 다음 리그 경기 정지 · 레드 배지(바로 다음 경기)', () => {
    const recent = [
      g('L1', 'eng.1', '2026-09-01T15:00Z', 2), g('L2', 'eng.1', '2026-09-15T15:00Z', 1),
      g('L3', 'eng.1', '2026-10-01T15:00Z', 1), g('L4', 'eng.1', '2026-10-10T15:00Z', 1),
    ];
    const d = discipline(recent, team, undefined, NOW);
    expect(d.sus).toMatchObject({ competition: 'eng.1', reason: 'yellow', yellows: 5, confirmed: false });
    expect(d.sus?.match?.id).toBe('L5');
    expect(d.badge).toBe('red');
  });

  it('챔스 퇴장 → 다음 챔스 경기 정지, 하지만 바로 다음 경기는 리그라 배지는 안 단다', () => {
    const recent = [g('C1', 'uefa.champions', '2026-09-20T19:00Z', 0, 1), g('L4', 'eng.1', '2026-10-10T15:00Z')];
    const d = discipline(recent, team, undefined, NOW);
    expect(d.sus).toMatchObject({ competition: 'uefa.champions', reason: 'red' });
    expect(d.sus?.match?.id).toBe('C2');
    expect(d.badge).toBeUndefined();
  });

  it('리그 경고는 챔스 누적에 섞지 않는다 — 챔스 2장이면 챔스 위험, 리그 4장이면 리그 위험', () => {
    const recent = [
      g('L1', 'eng.1', '2026-09-01T15:00Z', 2), g('L2', 'eng.1', '2026-09-15T15:00Z', 1), g('L3', 'eng.1', '2026-10-01T15:00Z', 1),
      g('C1', 'uefa.champions', '2026-09-20T19:00Z', 2),
    ];
    const d = discipline(recent, team, undefined, NOW);
    expect(d.sus).toBeUndefined();
    expect(d.risks).toEqual(expect.arrayContaining([
      { competition: 'eng.1', yellows: 4, limit: 5 },
      { competition: 'uefa.champions', yellows: 2, limit: 3 },
    ]));
    expect(d.badge).toBe('yellow');                     // 다음 경기(리그)에 위험
  });

  it('퇴장 뒤 팀이 그 대회를 이미 치렀으면 징계는 끝난 것으로 본다', () => {
    const recent = [g('L3', 'eng.1', '2026-10-01T15:00Z', 0, 1)];
    expect(discipline(recent, team, undefined, NOW).sus).toBeUndefined();
  });

  it('FotMob 확정 징계는 시각으로 경기를 찾고, 우리 계산 사유를 보탠다', () => {
    const recent = [g('L4', 'eng.1', '2026-10-10T15:00Z', 0, 1)];
    const d = discipline(recent, team, { utc: '2026-10-19T15:00:00Z', ret: 'Late October 2026' }, NOW);
    expect(d.sus).toMatchObject({ competition: 'eng.1', reason: 'red', confirmed: true, ret: 'Late October 2026' });
    expect(d.badge).toBe('red');
  });

  it('FotMob 이 두 경기에 올려 두면 2경기 정지 · 확인 범위 안의 다음 같은 대회 경기가 복귀', () => {
    const t = [...team, m('L6', 'eng.1', '2026-10-26T15:00Z', 'scheduled'), m('L7', 'eng.1', '2026-11-02T15:00Z', 'scheduled')];
    const d = discipline([], t, {
      games: [{ utc: '2026-10-19T15:00:00Z' }, { utc: '2026-10-26T15:00:00Z' }],
      checkedUntil: '2026-11-02T15:00:00Z',
    }, NOW);
    expect(d.sus?.missed?.map((x) => x.id)).toEqual(['L5', 'L6']);
    expect(d.sus?.back?.id).toBe('L7');
    /* 확인 범위가 L6 까지면 복귀는 미정 */
    const d2 = discipline([], t, { games: [{ utc: '2026-10-19T15:00:00Z' }, { utc: '2026-10-26T15:00:00Z' }], checkedUntil: '2026-10-26T15:00:00Z' }, NOW);
    expect(d2.sus?.back).toBeUndefined();
  });

  it('정지 경기가 지나가면 남은 경기 수가 줄고, 다 지나면 정지가 사라진다', () => {
    const t = [...team, m('L6', 'eng.1', '2026-10-26T15:00Z', 'scheduled'), m('L7', 'eng.1', '2026-11-02T15:00Z', 'scheduled')];
    const fm = { games: [{ utc: '2026-10-19T15:00:00Z' }, { utc: '2026-10-26T15:00:00Z' }, { utc: '2026-11-02T15:00:00Z' }] };
    expect(discipline([], t, fm, NOW).sus?.missed?.length).toBe(3);
    /* L5 가 끝난 뒤 */
    const t2 = t.map((x) => (x.id === 'L5' ? { ...x, status: 'finished' as const } : x));
    expect(discipline([], t2, fm, Date.parse('2026-10-20T00:00:00Z')).sus?.missed?.length).toBe(2);
    /* 셋 다 끝난 뒤 */
    const t3 = t.map((x) => (['L5', 'L6', 'L7'].includes(x.id) ? { ...x, status: 'finished' as const } : x));
    expect(discipline([], t3, fm, Date.parse('2026-11-03T00:00:00Z')).sus).toBeUndefined();
  });

  it('리그 퇴장 + 챔스 경고 누적이 동시에 — 대회별로 둘 다 담는다', () => {
    const recent = [
      g('C1', 'uefa.champions', '2026-09-20T19:00Z', 3),
      g('L4', 'eng.1', '2026-10-10T15:00Z', 0, 1),
    ];
    const d = discipline(recent, team, undefined, NOW);
    expect(d.all.map((x) => [x.competition, x.reason, x.match?.id])).toEqual([
      ['eng.1', 'red', 'L5'],
      ['uefa.champions', 'yellow', 'C2'],
    ]);
    expect(d.badge).toBe('red');
  });

  it('규정을 모르는 대회(MLS)는 경고 위험을 띄우지 않는다', () => {
    const mls = [m('M1', 'usa.1', '2026-10-01T00:00Z', 'finished'), m('M2', 'usa.1', '2026-10-20T00:00Z', 'scheduled')];
    const d = discipline([g('M1', 'usa.1', '2026-10-01T00:00Z', 4)], mls, undefined, NOW);
    expect(d.risks).toEqual([]);
  });
});
