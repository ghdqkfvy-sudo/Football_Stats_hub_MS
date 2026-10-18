import { test } from 'node:test';
import assert from 'node:assert/strict';
import { finishedFixtures, lineupRatings, pairFixture, squadRatings } from './ratings.mjs';

test('squadRatings: 평점 있는 선수만, 감독 제외', () => {
  const j = { squad: { squad: [
    { title: 'coach', members: [{ name: 'Boss', rating: 7 }] },
    { title: 'keepers', members: [{ name: 'Courtois', id: 1, rating: 7.054 }, { name: 'Lunin', id: 2, rating: null }] },
  ] } };
  assert.deepEqual(squadRatings(j), [{ name: 'Courtois', id: 1, rating: 7.05 }]);
});

test('finishedFixtures · pairFixture: 끝난 경기만, 킥오프 3시간 안쪽에서 가장 가까운 것', () => {
  const j = { fixtures: { allFixtures: { fixtures: [
    { id: 10, status: { utcTime: '2026-10-17T14:00:00Z', finished: true } },
    { id: 11, status: { utcTime: '2026-10-21T19:00:00Z', finished: false } },
    { id: 12, status: { utcTime: '2026-10-14T16:45:00Z', finished: true } },
  ] } } };
  const fx = finishedFixtures(j);
  assert.deepEqual(fx.map((f) => f.id).sort(), ['10', '12']);
  assert.equal(pairFixture('2026-10-17T14:00Z', fx), '10');
  assert.equal(pairFixture('2026-10-14T17:00Z', fx), '12');
  assert.equal(pairFixture('2026-10-11T15:30Z', fx), null);
});

test('lineupRatings: 우리 팀 쪽 선발 + 교체, 평점 없는(안 뛴) 선수 제외', () => {
  const md = { content: { lineup: {
    homeTeam: { id: 1, starters: [{ name: 'Them', performance: { rating: 9 } }] },
    awayTeam: { id: 8650, starters: [{ name: 'Isak', id: 5, performance: { rating: 7.43 } }], subs: [{ name: 'Gakpo', performance: { rating: 6.1 } }, { name: 'Bench', performance: {} }] },
  } } };
  assert.deepEqual(lineupRatings(md, 8650).map((p) => [p.name, p.rating]), [['Isak', 7.4], ['Gakpo', 6.1]]);
  assert.deepEqual(lineupRatings(md, 999), []);
});
