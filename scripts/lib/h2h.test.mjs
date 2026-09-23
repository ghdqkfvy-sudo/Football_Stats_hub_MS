import test from 'node:test';
import assert from 'node:assert/strict';
import { seriesGames, mergeH2H } from './h2h.mjs';

/* 실제 응답에서 잘라 온 모양 (한국 451 vs 에콰도르 209, 2010-05-16) */
const SUMMARY = {
  seasonseries: [
    {
      type: 'head-to-head',
      summary: 'KOR leads series 1-0',
      seriesScore: '1-0',
      totalCompetitions: 1,
      events: [
        {
          id: '289188',
          date: '2010-05-16T10:00:00Z',
          statusType: { completed: true },
          competitors: [
            { homeAway: 'home', team: { id: '451', abbreviation: 'KOR' }, score: '2' },
            { homeAway: 'away', team: { id: '209', abbreviation: 'ECU' }, score: '0' },
          ],
        },
        {
          /* 아직 안 치른 이번 맞대결 — 전적에 들어가면 안 된다 */
          id: '401905196',
          date: '2026-09-24T11:00Z',
          statusType: { completed: false },
          competitors: [
            { homeAway: 'home', team: { id: '451', abbreviation: 'KOR' } },
            { homeAway: 'away', team: { id: '209', abbreviation: 'ECU' } },
          ],
        },
      ],
    },
  ],
};

test('seriesGames — 끝난 경기만, 스코어는 숫자로', () => {
  const g = seriesGames(SUMMARY);
  assert.equal(g.length, 1);
  assert.deepEqual(g[0], {
    id: '289188',
    date: '2010-05-16T10:00:00Z',
    competition: '',
    homeId: '451',
    awayId: '209',
    homeAbbr: 'KOR',
    awayAbbr: 'ECU',
    homeScore: 2,
    awayScore: 0,
    done: true,
  });
});

test('seriesGames — head-to-head 가 아닌 항목은 무시한다', () => {
  assert.deepEqual(
    seriesGames({ seasonseries: [{ type: 'season', events: [{ id: '1', statusType: { completed: true } }] }] }),
    [],
  );
});

test('seriesGames — 요약이 없어도 죽지 않는다', () => {
  assert.deepEqual(seriesGames(null), []);
  assert.deepEqual(seriesGames({}), []);
  assert.deepEqual(seriesGames({ seasonseries: null }), []);
});

test('seriesGames — score.displayValue 형태도 읽는다', () => {
  const g = seriesGames({
    seasonseries: [{
      type: 'head-to-head',
      events: [{
        id: '7', date: 'd', statusType: { completed: true },
        competitors: [
          { homeAway: 'home', team: { id: 'a', abbreviation: 'A' }, score: { displayValue: '3' } },
          { homeAway: 'away', team: { id: 'b', abbreviation: 'B' }, score: { displayValue: '1' } },
        ],
      }],
    }],
  });
  assert.equal(g[0].homeScore, 3);
  assert.equal(g[0].awayScore, 1);
});

test('mergeH2H — id 로 중복 제거, 먼저 온 쪽이 이긴다', () => {
  const fromSchedule = [{ id: '289188', date: '2010-05-16T10:00:00Z', competition: 'fifa.friendly' }];
  const fromSeries = [{ id: '289188', date: '2010-05-16T10:00:00Z', competition: '' }];
  const out = mergeH2H(fromSchedule, fromSeries);
  assert.equal(out.length, 1);
  // 대회 이름을 가진 일정 쪽이 남아야 한다
  assert.equal(out[0].competition, 'fifa.friendly');
});

test('mergeH2H — 최신순으로 정렬한다', () => {
  const out = mergeH2H(
    [{ id: 'a', date: '2020-01-01T00:00Z' }, { id: 'c', date: '2024-01-01T00:00Z' }],
    [{ id: 'b', date: '2022-01-01T00:00Z' }],
  );
  assert.deepEqual(out.map((g) => g.id), ['c', 'b', 'a']);
});

test('mergeH2H — id 없는 항목은 버린다 (키가 없으면 중복을 못 센다)', () => {
  assert.deepEqual(mergeH2H([{ date: 'x' }, { id: '', date: 'y' }], null), []);
});
