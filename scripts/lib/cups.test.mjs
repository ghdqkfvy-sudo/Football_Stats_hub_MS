import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignRounds, cupEvent, daysToFetch, farRange, mergeRound, roundIndexOf } from './cups.mjs';

const EV = { id: '9', date: '2026-10-28T20:00Z', competitions: [{
  status: { type: { completed: true, state: 'post', name: 'STATUS_FINAL_PEN', shortDetail: 'FT-Pens' } },
  competitors: [
    { homeAway: 'home', team: { id: '364', displayName: 'Liverpool', abbreviation: 'LIV', logo: 'x.png' }, score: '1', shootoutScore: 3 },
    { homeAway: 'away', team: { id: '363', displayName: 'Chelsea', abbreviation: 'CHE' }, score: '1', shootoutScore: 4, winner: true },
  ],
  venue: { fullName: 'Anfield' },
}] };

test('cupEvent: 스코어 · 승부차기 · 승자 · 상태 · 경기장만 남긴다', () => {
  const e = cupEvent(EV);
  const [h, a] = e.competitions[0].competitors;
  assert.deepEqual([h.score.displayValue, h.shootoutScore, h.winner, a.shootoutScore, a.winner], ['1', 3, undefined, 4, true]);
  assert.equal(h.team.logo, 'x.png');
  assert.equal(e.competitions[0].status.type.shortDetail, 'FT-Pens');
  assert.equal(e.competitions[0].venue.fullName, 'Anfield');
  assert.equal(cupEvent({}), null);
});

test('daysToFetch: 처음엔 구간 시작부터, 이후엔 지금-3일부터 · 지금+14일까지만', () => {
  const now = Date.parse('2026-10-26T12:00Z');
  const r = { start: '2026-09-29T07:00Z', end: '2026-11-03T07:59Z' };
  const first = daysToFetch(r, now, false);
  assert.equal(first[0], '20260929');
  assert.equal(first.at(-1), '20261103');
  const again = daysToFetch(r, now, true);
  assert.deepEqual([again[0], again.at(-1), again.length], ['20261023', '20261103', 12]);
  assert.deepEqual(daysToFetch({ start: '2027-02-01T00:00Z', end: '2027-03-01T00:00Z' }, now, false), []);
});

test('mergeRound · roundIndexOf', () => {
  const got = mergeRound([{ id: '1', date: '2026-10-28' }, { id: '2', date: '2026-10-27' }], [{ id: '1', date: '2026-10-28', x: 1 }, null]);
  assert.deepEqual(got.map((e) => e.id), ['2', '1']);
  assert.equal(got[1].x, 1);
  const rounds = [{ start: '2026-09-01T00:00Z', end: '2026-09-28T23:59Z' }, { start: '2026-09-29T00:00Z', end: '2026-11-03T00:00Z' }];
  assert.equal(roundIndexOf(rounds, '2026-10-28T20:00Z'), 1);
  assert.equal(roundIndexOf(rounds, '2026-12-01T00:00Z'), -1);
});

test('assignRounds: 겹치는 라운드 구간 · 미뤄진 경기 — 한 경기는 한 라운드에만', () => {
  const cal = [
    { label: 'First Round', start: '2026-10-12T00:00Z', end: '2026-11-01T00:00Z' },
    { label: 'Second Round', start: '2026-11-01T00:00Z', end: '2027-07-01T00:00Z' },
    { label: 'Round of 32', start: '2026-11-02T00:00Z', end: '2027-07-01T00:00Z' },
  ];
  const prev = [{ label: 'First Round', events: [{ id: '1', date: '2026-10-28T19:00Z', v: 'old' }] }];
  const got = assignRounds(cal, prev, [
    { id: '1', date: '2026-11-04T19:00Z', v: 'new' },   // 1라운드 경기가 11-04 로 미뤄짐
    { id: '2', date: '2026-11-05T19:00Z' },             // 새 경기 — 겹치는 구간 중 첫 라운드
    { id: '3', date: '2026-10-27T19:00Z' },
  ]);
  assert.deepEqual(got.map((r) => r.events.map((e) => e.id)), [['3', '1'], ['2'], []]);
  assert.equal(got[0].events.find((e) => e.id === '1').v, 'new');
});

test('farRange: +14일 창 너머 라운드 구간을 범위 하나로 — 8강(12월)은 잡고, 먼 라운드는 아직', () => {
  const now = Date.parse('2026-10-30T02:00Z');
  assert.equal(farRange({ start: '2026-11-03T08:00Z', end: '2026-12-29T07:59Z' }, now), '20261114-20261229');
  assert.equal(farRange({ start: '2026-09-29T07:00Z', end: '2026-11-03T07:59Z' }, now), null);   // 창 안에서 끝남
  assert.equal(farRange({ start: '2027-02-09T00:00Z', end: '2027-06-01T00:00Z' }, now), null);   // 60일 넘게 남음
});
