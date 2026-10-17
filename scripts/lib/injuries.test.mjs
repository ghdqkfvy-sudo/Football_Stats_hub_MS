import { test } from 'node:test';
import assert from 'node:assert/strict';
import { injuredMembers, injuryList, isLongTerm, matchInjured, normName, returnKo, squadSize } from './injuries.mjs';

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
