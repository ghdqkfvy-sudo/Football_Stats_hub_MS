import test from 'node:test';
import assert from 'node:assert/strict';
import { slimEvent, slimFeed } from './slim.mjs';

const ev = () => ({
  id: '1', date: '2026-11-08T20:00Z', links: [{ href: 'x' }],
  competitions: [{
    id: '1', venue: { fullName: 'Mestalla' }, odds: [{}], broadcasts: [{}], tickets: [{}],
    status: { type: { name: 'STATUS_FULL_TIME' } }, __goals: [{ scorer: 'A' }], __stats: [{ name: 'A' }],
    competitors: [
      { homeAway: 'home', score: { value: 0 }, team: { id: '94', displayName: 'Valencia', logos: [{ href: 'l' }], links: [{ href: 'y' }] } },
      { homeAway: 'away', score: { value: 3 }, team: { id: '86', displayName: 'Real Madrid', links: [] } },
    ],
  }],
});

test('slimEvent: 링크 · 배당 · 중계 · 티켓만 떼고 나머지는 그대로', () => {
  const s = slimEvent(ev());
  assert.equal(s.links, undefined);
  const c = s.competitions[0];
  for (const k of ['odds', 'broadcasts', 'tickets']) assert.equal(c[k], undefined);
  assert.equal(c.competitors[0].team.links, undefined);
  /* 앱이 읽는 것 — 스코어 · 엠블럼 · 경기장 · 상태 · 득점 · 선수 기록 */
  assert.equal(c.competitors[1].score.value, 3);
  assert.equal(c.competitors[0].team.logos[0].href, 'l');
  assert.equal(c.venue.fullName, 'Mestalla');
  assert.equal(c.status.type.name, 'STATUS_FULL_TIME');
  assert.equal(c.__goals[0].scorer, 'A');
  assert.equal(c.__stats[0].name, 'A');
});

test('slimEvent: 원본을 바꾸지 않는다', () => {
  const src = ev();
  slimEvent(src);
  assert.equal(src.links.length, 1);
  assert.equal(src.competitions[0].odds.length, 1);
  assert.equal(src.competitions[0].competitors[0].team.links.length, 1);
});

test('slimFeed: events 가 있는 파일만 줄인다', () => {
  const other = { players: [1, 2] };
  assert.equal(slimFeed(other), other);
  const f = slimFeed({ events: [ev()], team: '86', fetchedAt: 't' });
  assert.equal(f.team, '86');
  assert.equal(f.events[0].links, undefined);
});

test('slimEvent: 모양이 낯설어도 터지지 않는다', () => {
  assert.equal(slimEvent(null), null);
  assert.deepEqual(slimEvent({ id: '1' }), { id: '1' });
  assert.deepEqual(slimEvent({ competitions: [null, { competitors: [{}] }] }), { competitions: [null, { competitors: [{}] }] });
});
