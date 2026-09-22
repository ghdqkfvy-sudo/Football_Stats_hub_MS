import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  betterPhoto, kindFromUrl, pickSportsdbPlayer, rateLimiter, urlVerdict,
} from './photos.mjs';

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

test('betterPhoto: 등급이 높을 때만 갈아탄다', () => {
  const wiki = { url: 'w', kind: 'wiki' };
  const cut = { url: 'c', kind: 'cutout' };
  // 위키 사진이 한 번 박히면 영원히 남던 문제 — 컷아웃이 오면 올라가야 한다
  assert.equal(betterPhoto(wiki, cut), cut);
  // 반대로 컷아웃이 위키로 내려가지는 않는다
  assert.equal(betterPhoto(cut, wiki), cut);
  // 같은 등급이면 그대로 둔다
  assert.equal(betterPhoto(cut, { url: 'c2', kind: 'cutout' }), cut);
  assert.equal(betterPhoto(null, wiki), wiki);
  assert.equal(betterPhoto(wiki, { url: '' }), wiki);
  assert.equal(betterPhoto(null, null), null);
});

test('kindFromUrl: 지난 회차 파일에 kind 가 없어도 등급을 되짚는다', () => {
  assert.equal(kindFromUrl('https://r2.thesportsdb.com/images/media/player/cutout/a.png'), 'cutout');
  assert.equal(kindFromUrl('https://r2.thesportsdb.com/images/media/player/thumb/a.jpg'), 'thumb');
  assert.equal(kindFromUrl('https://a.espncdn.com/i/headshots/soccer/players/full/1.png'), 'espn');
  assert.equal(kindFromUrl('https://thumb.wikimedia.org/x.jpg'), 'wiki');
  assert.equal(kindFromUrl('https://upload.wikimedia.org/x.jpg'), 'wiki');
  assert.equal(kindFromUrl(''), undefined);
});

test('pickSportsdbPlayer: 축구 선수만, 동명이인은 소속팀으로 가른다', () => {
  const list = [
    { strPlayer: 'Danny Ings', strSport: 'Cricket', strTeam: 'Somerset' },
    { strPlayer: 'Danny Ings', strSport: 'Soccer', strTeam: 'West Ham United' },
    { strPlayer: 'Danny Ings', strSport: 'Soccer', strTeam: 'Newcastle United' },
  ];
  assert.equal(pickSportsdbPlayer(list, 'Newcastle United', norm).strTeam, 'Newcastle United');
  // 소속팀을 모르면 첫 축구 선수
  assert.equal(pickSportsdbPlayer(list, '', norm).strTeam, 'West Ham United');
  assert.equal(pickSportsdbPlayer([{ strSport: 'Cricket' }], 'x', norm), null);
  assert.equal(pickSportsdbPlayer(null, 'x', norm), null);
});

test('urlVerdict: 404 만 버린다 — 405/403/네트워크 오류로는 버리지 않는다', () => {
  assert.equal(urlVerdict(404), 'gone');
  assert.equal(urlVerdict(410), 'gone');
  assert.equal(urlVerdict(200), 'keep');
  assert.equal(urlVerdict(405), 'keep');
  assert.equal(urlVerdict(403), 'keep');
  assert.equal(urlVerdict(0), 'keep');       // fetch 자체가 터진 경우
  assert.equal(urlVerdict(undefined), 'keep');
});

test('rateLimiter: 순서대로, 최소 간격을 지켜 부른다', async () => {
  const lim = rateLimiter({ minIntervalMs: 30, breakAfter: 99 });
  const at = [];
  const t0 = Date.now();
  await Promise.all([1, 2, 3].map((n) =>
    lim.run(async () => { at.push({ n, t: Date.now() - t0 }); return { ok: true, value: n }; })));
  assert.deepEqual(at.map((x) => x.n), [1, 2, 3]);
  assert.ok(at[2].t >= 55, `세 번째 호출이 너무 빠르다: ${at[2].t}ms`);
});

test('rateLimiter: 연속 실패하면 회로를 열고 더 부르지 않는다', async () => {
  const lim = rateLimiter({ minIntervalMs: 0, breakAfter: 3 });
  let calls = 0;
  const fail = () => lim.run(async () => { calls++; return { ok: false, value: undefined } });
  for (let i = 0; i < 10; i++) await fail();
  assert.equal(calls, 3, '회로가 열린 뒤에는 호출하지 않아야 한다');
  assert.equal(lim.broken, true);
  // 성공하던 값도 더는 돌려주지 않는다 (호출자는 이어받기로 떨어진다)
  assert.equal(await lim.run(async () => ({ ok: true, value: 'x' })), undefined);
  lim.reset();
  assert.equal(await lim.run(async () => ({ ok: true, value: 'x' })), 'x');
});

test('rateLimiter: 한 건이 예외를 던져도 줄이 끊기지 않는다', async () => {
  const lim = rateLimiter({ minIntervalMs: 0, breakAfter: 99 });
  const boom = lim.run(async () => { throw new Error('boom') });
  await assert.rejects(boom, /boom/);
  assert.equal(await lim.run(async () => ({ ok: true, value: 'after' })), 'after');
});
