/**
 * athlete.mjs 검증 — 응답 조각은 **실제 ESPN 응답에서 그대로 떠 온 것**이다
 * (2026-09-17, 김민재 157688 / ger.1 / 바이에른 132).
 * 모양을 손으로 지어내면 "필드명이 조용히 바뀌었다" 를 잡을 수 없다.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  appearanceFrom, athleteRecent, eventLogItems, flattenStats,
  scheduleMeta, seasonTotals, subInMinute,
} from './athlete.mjs';

const R = 'http://sports.core.api.espn.com/v2/sports/soccer/leagues/ger.1';

const EVENTLOG = {
  events: {
    count: 3,
    items: [
      { event: { $ref: `${R}/events/401884817?lang=en` }, teamId: '132', played: true,
        statistics: { $ref: `${R}/events/401884817/…/statistics/0` } },
      { event: { $ref: `${R}/events/401884801?lang=en` }, teamId: '132', played: true,
        statistics: { $ref: `${R}/events/401884801/…/statistics/0` } },
      { event: { $ref: `${R}/events/401884791?lang=en` }, teamId: '132', played: true,
        statistics: { $ref: `${R}/events/401884791/…/statistics/0` } },
      // 아직 안 치른 경기는 played:false 로 온다
      { event: { $ref: `${R}/events/401884999?lang=en` }, teamId: '132', played: false },
    ],
  },
};

/** 선발 84분 · 경고 1 (401884817 실측) */
const STATS_PLAYED = {
  splits: { categories: [
    { name: 'general', stats: [
      { name: 'appearances', value: 1 }, { name: 'minutes', value: 84 },
      { name: 'starts', value: 1 }, { name: 'subIns', value: 0 },
      { name: 'subOuts', value: 1 }, { name: 'yellowCards', value: 1 },
      { name: 'redCards', value: 0 },
    ] },
    { name: 'offensive', stats: [
      { name: 'totalGoals', value: 0 }, { name: 'goalAssists', value: 0 },
    ] },
  ] },
};

/** ⚠️ played:true 인데 실제로는 안 뛴 경기 (401884801 실측) */
const STATS_BENCH = {
  splits: { categories: [
    { name: 'general', stats: [
      { name: 'appearances', value: 0 }, { name: 'minutes', value: 0 },
      { name: 'starts', value: 0 }, { name: 'subIns', value: 0 },
    ] },
    { name: 'offensive', stats: [
      { name: 'totalGoals', value: 0 }, { name: 'goalAssists', value: 0 },
    ] },
  ] },
};

/** 교체 투입 62분, 1골 (모양은 실측과 같고 값만 교체 사례로) */
const STATS_SUB = {
  splits: { categories: [
    { name: 'general', stats: [
      { name: 'appearances', value: 1 }, { name: 'minutes', value: 28 },
      { name: 'starts', value: 0 }, { name: 'subIns', value: 1 },
    ] },
    { name: 'offensive', stats: [
      { name: 'totalGoals', value: 1 }, { name: 'goalAssists', value: 0 },
    ] },
  ] },
};

const LINEUP_SUB = {
  playerId: 157688, starter: false,
  subbedIn: { didSub: true, clock: { displayValue: "62'", value: 3720 } },
  subbedOut: { didSub: false },
};

const SCHEDULE = {
  events: [
    { id: '401884817', date: '2026-08-28T18:30Z', league: { slug: 'ger.1' },
      competitions: [{ status: { type: { completed: true } }, competitors: [
        { team: { id: '132', displayName: 'Bayern Munich' }, homeAway: 'home', score: { displayValue: '5' } },
        { team: { id: '134', displayName: 'VfB Stuttgart' }, homeAway: 'away', score: { displayValue: '1' } },
      ] }] },
    { id: '401884791', date: '2026-09-13T15:30Z', league: { slug: 'ger.1' },
      competitions: [{ status: { type: { completed: true } }, competitors: [
        { team: { id: '10388', displayName: 'SV Elversberg' }, homeAway: 'home', score: { displayValue: '1' } },
        { team: { id: '132', displayName: 'Bayern Munich' }, homeAway: 'away', score: { displayValue: '2' } },
      ] }] },
    { id: '401884801', date: '2026-09-01T18:30Z', league: { slug: 'ger.1' },
      competitions: [{ status: { type: { completed: true } }, competitors: [
        { team: { id: '132', displayName: 'Bayern Munich' }, homeAway: 'home', score: { displayValue: '0' } },
        { team: { id: '124', displayName: 'FC Koln' }, homeAway: 'away', score: { displayValue: '0' } },
      ] }] },
  ],
};

test('eventLogItems: $ref 에서 경기 id 를 뽑고 미확정 경기도 남긴다', () => {
  const items = eventLogItems(EVENTLOG);
  assert.equal(items.length, 4);
  assert.deepEqual(items[0], { eventId: '401884817', teamId: '132', played: true, hasStats: true });
  assert.equal(items[3].played, false);
  assert.deepEqual(eventLogItems(null), []);
  assert.deepEqual(eventLogItems({ events: {} }), []);
});

test('flattenStats: 카테고리를 한 겹으로 펼친다', () => {
  const f = flattenStats(STATS_PLAYED);
  assert.equal(f.minutes, 84);
  assert.equal(f.totalGoals, 0);
  assert.equal(f.yellowCards, 1);
  assert.deepEqual(flattenStats(undefined), {});
});

test('appearanceFrom: 명단에만 든 경기는 null 이다', () => {
  // ⚠️ 이게 이 모듈의 핵심. eventlog 의 played:true 로는 못 가른다.
  assert.equal(appearanceFrom(flattenStats(STATS_BENCH)), null);

  const a = appearanceFrom(flattenStats(STATS_PLAYED));
  assert.deepEqual(a, { starter: true, minutes: 84, goals: 0, assists: 0, yellow: true, red: false });

  const s = appearanceFrom(flattenStats(STATS_SUB));
  assert.equal(s.starter, false);
  assert.equal(s.minutes, 28);
  assert.equal(s.goals, 1);
});

test('seasonTotals: starts 가 없으면 출전 - 교체투입 으로 메운다', () => {
  assert.deepEqual(seasonTotals(STATS_PLAYED), {
    apps: 1, starts: 1, minutes: 84, goals: 0, assists: 0, yellow: 1, red: 0,
  });
  const noStarts = { splits: { categories: [{ name: 'general', stats: [
    { name: 'appearances', value: 10 }, { name: 'subIns', value: 4 },
  ] }] } };
  assert.equal(seasonTotals(noStarts).starts, 6);
  assert.deepEqual(seasonTotals(null), {
    apps: 0, starts: 0, minutes: 0, goals: 0, assists: 0, yellow: 0, red: 0,
  });
});

test('scheduleMeta: 우리 팀 시점의 스코어·승패로 뒤집어 읽는다', () => {
  const m = scheduleMeta(SCHEDULE, '132');
  // 홈 5-1 승
  assert.deepEqual(m.get('401884817'), {
    date: '2026-08-28T18:30Z', competition: 'ger.1', opponent: 'VfB Stuttgart',
    opponentId: '134', score: '5 : 1', result: 'W', completed: true,
  });
  // 원정 2-1 승 — 우리 점수가 먼저 와야 한다
  const away = m.get('401884791');
  assert.equal(away.score, '2 : 1');
  assert.equal(away.result, 'W');
  assert.equal(away.opponent, 'SV Elversberg');
  assert.equal(m.get('401884801').result, 'D');
});

test('subInMinute: didSub 이 아니면 undefined', () => {
  assert.equal(subInMinute(LINEUP_SUB), 62);
  assert.equal(subInMinute({ subbedIn: { didSub: false } }), undefined);
  assert.equal(subInMinute(null), undefined);
  // displayValue 가 없으면 초 단위 value 로 떨어진다
  assert.equal(subInMinute({ subbedIn: { didSub: true, clock: { value: 3720 } } }), 62);
});

test('athleteRecent: 날짜순으로 세우고, 안 뛴 경기를 건너뛰고 채운다', async () => {
  const calls = [];
  const get = async (url) => {
    calls.push(url);
    if (url.includes('/eventlog')) return EVENTLOG;
    if (url.includes('401884817') && url.includes('/statistics/0')) return STATS_PLAYED;
    if (url.includes('401884801') && url.includes('/statistics/0')) return STATS_BENCH;
    if (url.includes('401884791') && url.includes('/statistics/0')) return STATS_SUB;
    if (url.includes('401884791')) return LINEUP_SUB;   // 교체였으므로 로스터를 본다
    return null;
  };

  const rows = await athleteRecent({
    get, league: 'ger.1', season: 2026, athleteId: '157688',
    meta: scheduleMeta(SCHEDULE, '132'), take: 3,
  });

  // 401884801 은 명단만 → 제외. 남는 건 9/13, 8/28 두 경기이고 최신순이어야 한다.
  assert.equal(rows.length, 2);
  assert.equal(rows[0].eventId, '401884791');
  assert.equal(rows[0].date, '2026-09-13T15:30Z');
  assert.equal(rows[0].started, false);
  assert.equal(rows[0].subIn, 62);
  assert.equal(rows[0].goals, 1);
  assert.equal(rows[1].eventId, '401884817');
  assert.equal(rows[1].started, true);
  assert.equal(rows[1].minutes, 84);

  // 선발 경기에는 로스터를 부르지 않는다 (요청 낭비 방지)
  assert.ok(!calls.some((u) => u.endsWith('/roster/157688') && u.includes('401884817')));
  // 아직 안 치른 경기(played:false)는 아예 조회하지 않는다
  assert.ok(!calls.some((u) => u.includes('401884999')));
});

test('athleteRecent: eventlog 가 비면 조용히 빈 배열', async () => {
  const rows = await athleteRecent({
    get: async () => null, league: 'ger.1', season: 2026, athleteId: '1', meta: new Map(),
  });
  assert.deepEqual(rows, []);
});
