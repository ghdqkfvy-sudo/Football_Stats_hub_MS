import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventsOf, fixtureNear, liveCandidates, liveSnapshot, phaseOf } from './live.mjs';

/* 2026-10-17 브렌트퍼드 1-2 리버풀(FotMob 5795476) 응답에서 칸 모양만 줄여 옮긴 것 */
const MD = {
  general: { matchId: '5795476', matchTimeUTCDate: '2026-10-17T14:00:00.000Z', leagueName: 'Premier League' },
  header: {
    teams: [{ name: 'Brentford', id: 9937, score: 1 }, { name: 'Liverpool', id: 8650, score: 2 }],
    status: { started: true, finished: false, liveTime: { short: "63'" } },
  },
  content: {
    lineup: {
      lineupType: 'standard',
      homeTeam: { id: 9937, name: 'Brentford', formation: '4-2-3-1', rating: 6.4, coach: { name: 'Keith Andrews' },
        starters: [{ id: 776689, name: 'Caoimhín Kelleher', lastName: 'Kelleher', shirtNumber: '1', verticalLayout: { x: 0.5, y: 0.1 }, performance: { rating: 6 } }],
        subs: [] },
      awayTeam: { id: 8650, name: 'Liverpool', formation: '4-2-3-1',
        starters: [{ id: 846005, name: 'Dominik Szoboszlai', lastName: 'Szoboszlai', shirtNumber: '8', isCaptain: true, verticalLayout: { x: 0.3, y: 0.485 },
          performance: { rating: 6.63, events: [{ type: 'yellowCard' }], substitutionEvents: [{ time: 32, type: 'subOut', reason: 'injury' }] } }],
        subs: [{ id: 1436258, name: 'Trey Nyoni', shirtNumber: '42', performance: { rating: 7.1, events: [{ type: 'goal' }], substitutionEvents: [{ time: 32, type: 'subIn' }] } },
          { id: 1, name: 'Bench Guy', shirtNumber: '30', performance: {} }] },
    },
    matchFacts: { events: { events: [
      { type: 'Card', time: 31, isHome: false, card: 'Yellow', player: { id: 846005, name: 'Dominik Szoboszlai' } },
      { type: 'Substitution', time: 32, isHome: false, injuredPlayerOut: true, swap: [{ name: 'Trey Nyoni', id: '1436258' }, { name: 'Dominik Szoboszlai', id: '846005' }] },
      { type: 'Goal', time: 44, isHome: true, player: { id: 1010426, name: 'Keane Lewis-Potter' }, newScore: [1, 0], goalDescriptionKey: 'header' },
      { type: 'Half', time: 45, halfStrShort: 'HT' },
      { type: 'Card', time: 70, overloadTime: 2, isHome: true, card: 'Red', player: { id: 5, name: 'X' } },
    ] } },
  },
};

test('phaseOf: 시작 전 · 경기 중(시계) · 종료', () => {
  assert.deepEqual(phaseOf({ header: { status: {} } }), { phase: 'pre', clock: null });
  assert.deepEqual(phaseOf(MD), { phase: 'live', clock: "63'" });
  assert.equal(phaseOf({ header: { status: { started: true, liveTime: { short: '95\u200e’\u200e' } } } }).clock, "95'");
  assert.deepEqual(phaseOf({ header: { status: { started: true, finished: true, reason: { short: 'FT' } } } }), { phase: 'done', clock: 'FT' });
});

test('liveSnapshot: 스코어 · 우리 팀 쪽 · 선수(좌표 · 평점 · 카드 분 · 교체)', () => {
  const s = liveSnapshot(MD, 8650);
  assert.deepEqual(s.score, [1, 2]);
  assert.equal(s.ours, 'away');
  assert.equal(s.away.formation, '4-2-3-1');
  const sz = s.away.starters[0];
  assert.deepEqual([sz.no, sz.x, sz.y, sz.rating, sz.cap, sz.out, sz.outInjury], [8, 0.3, 0.485, 6.6, true, 32, true]);
  assert.deepEqual(sz.cards, [{ kind: 'y', min: 31 }]);
  const ny = s.away.bench[0];
  assert.deepEqual([ny.in, ny.goals, ny.rating], [32, 1, 7.1]);
  assert.equal(s.away.bench[1].rating, null);
  assert.equal(s.home.coach, 'Keith Andrews');
});

test('eventsOf: 골 · 카드(경고/퇴장) · 교체(들어온/나간 · 부상) · 하프타임', () => {
  const { events } = eventsOf(MD);
  assert.deepEqual(events.map((e) => e.t), ['card', 'sub', 'goal', 'half', 'card']);
  assert.deepEqual([events[1].in, events[1].out, events[1].injury], ['Trey Nyoni', 'Dominik Szoboszlai', true]);
  assert.deepEqual([events[4].kind, events[4].plus], ['r', 2]);
  assert.deepEqual(events[2].score, [1, 0]);
});

test('liveCandidates · fixtureNear: 킥오프 75분 전 ~ 150분 뒤, 끝난 경기 제외', () => {
  const now = Date.parse('2026-10-18T13:00:00Z');
  const ev = (id, date, done = false) => ({ id, date, competitions: [{ status: { type: { completed: done } } }] });
  const got = liveCandidates([ev('a', '2026-10-18T14:00Z'), ev('b', '2026-10-18T14:30Z'), ev('c', '2026-10-18T11:00Z'), ev('d', '2026-10-18T12:00Z', true)], now);
  assert.deepEqual(got.map((x) => x.id), ['a', 'c']);
  const team = { fixtures: { allFixtures: { fixtures: [{ id: 9, status: { utcTime: '2026-10-18T14:00:00Z' } }, { id: 8, status: { utcTime: '2026-10-11T14:00:00Z', finished: true } }] } } };
  assert.equal(fixtureNear(team, '2026-10-18T14:00Z'), '9');
  assert.equal(fixtureNear(team, '2026-10-25T14:00Z'), null);
});
