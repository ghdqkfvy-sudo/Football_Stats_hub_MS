import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupSuspensions, upcomingMatchIds, injuredMembers, injuryList, isLongTerm, matchInfo, matchInjured, nextMatchId, normName, returnKo, squadSize, suspendedFrom } from './injuries.mjs';

test('normName: 악센트·대소문자·기호', () => {
  assert.equal(normName('Álex Baena'), 'alex baena');
  assert.equal(normName('Martin Ødegaard'), 'martin odegaard');
  assert.equal(normName('Jean-Philippe Mateta'), 'jean philippe mateta');
});

test('matchInjured: 전체 이름 → 성+첫 글자 → 유일한 성', () => {
  const athletes = {
    1: { name: 'Pedro Porro' },
    2: { name: 'Dejan Kulusevski' },
    3: { name: 'Xavi Simons' },
    4: { name: 'Ben Davies' },
    5: { name: 'Micky van de Ven' },
  };
  const got = matchInjured([
    { name: 'Pedro Porro' },
    { name: 'D. Kulusevski' },                 // 성 + 첫 글자
    { name: 'Xavier Simons' },                 // 성 + 첫 글자(X)
    { name: 'Someone Davies' },                // 성이 유일 → 받는다
    { name: 'Nobody Here' },                   // 없음
  ], athletes);
  assert.deepEqual([...got.keys()].sort(), ['1', '2', '3', '4']);
});

test('matchInjured: 성이 같은 선수가 둘이고 첫 글자도 다르면 맞추지 않는다', () => {
  const got = matchInjured([{ name: 'Carlos Silva' }], { 1: { name: 'Bernardo Silva' }, 2: { name: 'Thiago Silva' } });
  assert.equal(got.size, 0);
});

test('returnKo', () => {
  assert.deepEqual(returnKo('Mid November 2026'), { ko: '11월 중순 복귀 예상', doubtful: false });
  assert.deepEqual(returnKo('Early January 2027'), { ko: '1월 초 복귀 예상', doubtful: false });
  assert.deepEqual(returnKo('Late October 2026'), { ko: '10월 말 복귀 예상', doubtful: false });
  assert.deepEqual(returnKo('Doubtful'), { ko: '출전 불투명', doubtful: true });
  assert.equal(returnKo('A few days').ko, '며칠 뒤 복귀 예상');
  assert.equal(returnKo('A few weeks').ko, '몇 주 뒤 복귀 예상');
  assert.equal(returnKo('Out for the season').ko, '시즌 아웃');
  assert.equal(returnKo('').ko, '복귀 시점 미정');
  assert.deepEqual(returnKo('Back in training'), { ko: '훈련 복귀', doubtful: false });
  assert.equal(returnKo('Something new').ko, 'Something new');
});

test('injuredMembers · squadSize', () => {
  const json = { squad: { squad: [
    { title: 'keepers', members: [{ name: 'A' }, { name: 'B', injury: { id: '21', expectedReturn: 'Doubtful' } }] },
    { title: 'defenders', members: [{ name: 'C', injury: { expectedReturn: 'A few days' } }] },
    { title: 'coach', members: [{ name: 'Z', injury: { expectedReturn: 'A few days' } }] },
  ] } };
  assert.deepEqual(injuredMembers(json).map((m) => [m.name, m.pos]), [['B', 'G'], ['C', 'D']]);
  assert.equal(squadSize(json), 4);
  assert.equal(squadSize(null), 0);
});

test('isLongTerm: 복귀까지 4주 넘으면 장기', () => {
  const now = new Date('2026-10-17T00:00:00Z');
  assert.equal(isLongTerm('Early February 2027', now), true);
  assert.equal(isLongTerm('Mid November 2026', now), true);      // 11/15 — 29일, 4주 초과
  assert.equal(isLongTerm('Early November 2026', now), false);   // 11/5 — 19일
  assert.equal(isLongTerm('Late November 2026', now), true);     // 11/25 — 39일
  assert.equal(isLongTerm('Late October 2026', now), false);
  assert.equal(isLongTerm('A few weeks', now), false);
  assert.equal(isLongTerm('A few months', now), true);
  assert.equal(isLongTerm('Out for the season', now), true);
  assert.equal(isLongTerm('Doubtful', now), false);
  assert.equal(isLongTerm('Early January', now), true);           // 연도 없음 → 다가오는 1월
});

test('injuryList: 불투명 → 단기 → 장기, 우리 선수면 espnId', () => {
  const now = new Date('2026-10-17T00:00:00Z');
  const a = { name: 'Long Guy', id: 1, shirtNumber: 7, pos: 'F', injury: { expectedReturn: 'Early February 2027' } };
  const b = { name: 'Short Guy', id: 2, pos: 'M', injury: { expectedReturn: 'A few days' } };
  const c = { name: 'Maybe Guy', id: 3, pos: 'D', injury: { expectedReturn: 'Doubtful' } };
  const list = injuryList([a, b, c], new Map([['99', b]]), now);
  assert.deepEqual(list.map((x) => x.name), ['Maybe Guy', 'Short Guy', 'Long Guy']);
  assert.equal(list[1].espnId, '99');
  assert.equal(list[2].long, true);
  assert.equal(list[2].jersey, 7);
  assert.equal(list[0].doubtful, true);
  assert.equal(list[0].long, false);
});

test('nextMatchId: 어느 깊이에 있든', () => {
  assert.equal(nextMatchId({ overview: { nextMatch: { id: 5795484 } } }), '5795484');
  assert.equal(nextMatchId({ fixtures: { allFixtures: { nextMatch: { id: 1 } } } }), '1');
  assert.equal(nextMatchId({}), null);
});

test('suspendedFrom: 우리 팀 쪽 징계만 (상대 팀 · 부상은 뺀다)', () => {
  const details = {
    general: { matchTimeUTCDate: '2026-10-19T19:00:00Z', leagueName: 'Premier League' },
    content: { lineup: {
      homeTeam: { id: 8586, unavailable: [
        { id: 1, name: 'Cristian Romero', unavailability: { type: 'suspension', expectedReturn: 'Late October 2026' } },
        { id: 2, name: 'Xavi Simons', unavailability: { type: 'injury', expectedReturn: 'Early February 2027' } },
      ] },
      awayTeam: { id: 9825, unavailable: [{ id: 3, name: 'Other Guy', unavailability: { type: 'suspension' } }] },
    } },
  };
  const got = suspendedFrom(details, 8586);
  assert.deepEqual(got.map((x) => x.name), ['Cristian Romero']);
  assert.equal(got[0].ret, 'Late October 2026');
  assert.deepEqual(suspendedFrom(details, 1234), []);
  assert.deepEqual(matchInfo(details), { utc: '2026-10-19T19:00:00Z', league: 'Premier League' });
});

test('upcomingMatchIds: 끝나지 않은 경기 가까운 순', () => {
  const now = Date.parse('2026-10-17T00:00:00Z');
  const json = { fixtures: { allFixtures: { fixtures: [
    { id: 1, status: { utcTime: '2026-10-10T15:00:00Z', finished: true } },
    { id: 3, status: { utcTime: '2026-10-25T15:00:00Z', finished: false } },
    { id: 2, status: { utcTime: '2026-10-19T15:00:00Z', finished: false } },
  ] }, nextMatch: { id: 2, status: { utcTime: '2026-10-19T15:00:00Z' } } } };
  assert.deepEqual(upcomingMatchIds(json, now), ['2', '3']);
});

test('groupSuspensions: 몇 경기째까지 정지인지 선수별로', () => {
  const got = groupSuspensions([
    { utc: 'A', league: 'PL', suspended: [{ name: 'Cristian Romero' }] },
    { utc: 'B', league: 'PL', suspended: [{ name: 'Cristian Romero' }] },
    { utc: 'C', league: 'UCL', suspended: [{ name: 'Other' }] },
  ]);
  assert.deepEqual(got.map((x) => [x.name, x.games.map((g) => g.utc)]), [['Cristian Romero', ['A', 'B']], ['Other', ['C']]]);
});
