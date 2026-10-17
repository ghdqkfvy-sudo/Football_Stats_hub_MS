import { test } from 'node:test';
import assert from 'node:assert/strict';
import { footballerIds, mergeIdMaps, needsLookup, pickSofascore, searchNames, sofascoreImage } from './sofascore.mjs';

const TODAY = new Date('2026-10-16T00:00:00Z');
const ent = (ss, born) => ({
  claims: {
    ...(ss ? { P12302: [{ mainsnak: { datavalue: { value: ss } } }] } : {}),
    ...(born ? { P569: [{ mainsnak: { datavalue: { value: { time: `+${born}-03-01T00:00:00Z` } } } }] } : {}),
  },
});

test('footballerIds: 축구 선수 항목만, 검색 순서대로', () => {
  assert.deepEqual(footballerIds([
    { id: 'Q1', description: 'English singer' },
    { id: 'Q2', description: 'English association football player' },
    { id: 'Q3', description: 'American soccer player' },
  ]), ['Q2', 'Q3']);
  assert.deepEqual(footballerIds(undefined), []);
});

test('pickSofascore: 동명이인 — 생년이 나이와 안 맞는 항목은 건너뛴다(리스 제임스 사고)', () => {
  /* 첼시 리스 제임스 1999년생(26세) vs 셰필드 웬즈데이 1993년생 */
  const entities = { Q1: ent('111', 1993), Q2: ent('222', 1999) };
  assert.deepEqual(pickSofascore(['Q1', 'Q2'], entities, 26, TODAY), { qid: 'Q2', ss: '222' });
});

test('pickSofascore: ID 없는 항목은 건너뛰고, 나이를 모르면 생년으로 막지 않는다', () => {
  const entities = { Q1: ent(null, 1999), Q2: ent('333', 1990) };
  assert.deepEqual(pickSofascore(['Q1', 'Q2'], entities, undefined, TODAY), { qid: 'Q2', ss: '333' });
  assert.equal(pickSofascore(['Q1'], entities, 26, TODAY), null);
  assert.equal(pickSofascore(['Q9'], { Q9: ent('abc', 1999) }, 26, TODAY), null);   // 숫자 ID 만
});

test('needsLookup: 찾은 건 다시 안 찾고, 못 찾은 건 7일 뒤 다시', () => {
  const now = Date.parse('2026-10-16T00:00:00Z');
  assert.equal(needsLookup(undefined, now), true);
  assert.equal(needsLookup({ ss: '1', at: '2026-01-01T00:00:00Z' }, now), false);
  assert.equal(needsLookup({ ss: null, at: '2026-10-14T00:00:00Z' }, now), false);
  assert.equal(needsLookup({ ss: null, at: '2026-10-01T00:00:00Z' }, now), true);
  assert.equal(needsLookup({ ss: null }, now), true);
});

test('sofascoreImage', () => {
  assert.equal(sofascoreImage('96626'), 'https://img.sofascore.com/api/v1/player/96626/image');
});

test('mergeIdMaps: 찾은 ID 는 잃지 않는다 — 겹친 회차가 작은 기록으로 덮어써도', () => {
  const big = {
    a: { ss: '1', at: '2026-10-16T12:20:00Z' },
    b: { ss: '2', at: '2026-10-16T12:20:00Z' },
    c: { ss: null, at: '2026-10-16T12:20:00Z' },
  };
  const small = {
    a: { ss: null, at: '2026-10-16T12:24:00Z' },        // 뒤 회차가 한도에 걸려 못 찾음
    c: { ss: '3', at: '2026-10-16T12:24:00Z' },         // 뒤 회차가 새로 찾음
    d: { ss: '4', at: '2026-10-16T12:24:00Z' },
  };
  assert.deepEqual(mergeIdMaps(small, big), {
    a: { ss: '1', at: '2026-10-16T12:20:00Z' },
    b: { ss: '2', at: '2026-10-16T12:20:00Z' },
    c: { ss: '3', at: '2026-10-16T12:24:00Z' },
    d: { ss: '4', at: '2026-10-16T12:24:00Z' },
  });
  /* 둘 다 ID 가 있으면 더 최근 쪽 */
  assert.equal(mergeIdMaps({ x: { ss: '1', at: '2026-01-01' } }, { x: { ss: '9', at: '2026-02-01' } }).x.ss, '9');
  assert.deepEqual(mergeIdMaps(undefined, undefined), {});
});

test('searchNames: 위키데이터에 다른 이름으로 올라 있는 선수 (사비우 → Savinho)', () => {
  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  assert.deepEqual(searchNames('Sávio', norm), ['Sávio', 'Savinho']);
  assert.deepEqual(searchNames('Víctor Muñoz', norm), ['Víctor Muñoz']);
});
