import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  betterPhoto, birthYearOf, kindFromUrl, matchInRoster, photoFromSportsdb,
  pickSportsdbPlayer, plausibleBirthYear, rateLimiter, urlVerdict,
} from './photos.mjs';

/** 테스트를 고정하기 위한 '오늘' — 2026-09-23 */
const TODAY = new Date('2026-09-23T00:00:00Z');

/* 스냅샷의 normName 과 같은 정규화 — 발음기호를 벗긴다.
   (이게 없으면 'João' 와 'Joao' 가 다른 이름이 되어 테스트가 실제를 못 흉내낸다) */
const norm = (s) => String(s ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

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

test('pickSportsdbPlayer: 소속팀이 맞아야 고른다 — 동명이인 사고 방지', () => {
  const list = [
    { strPlayer: 'Danny Ings', strSport: 'Cricket', strTeam: 'Somerset' },
    { strPlayer: 'Danny Ings', strSport: 'Soccer', strTeam: 'West Ham United' },
    { strPlayer: 'Danny Ings', strSport: 'Soccer', strTeam: 'Newcastle United' },
  ];
  assert.equal(pickSportsdbPlayer(list, 'Newcastle United', norm).strTeam, 'Newcastle United');

  /* ⚠️ 실제로 난 사고: 리스 제임스(첼시) 자리에 셰필드 웬즈데이의
     1993년생 동명이인 얼굴이 박혔다. 이름은 완전히 같아서 이름 검사로는
     절대 못 걸러진다 — 소속팀이 안 맞으면 포기해야 한다. */
  const reece = [{ strPlayer: 'Reece James', strSport: 'Soccer', strTeam: 'Sheffield Wednesday' }];
  assert.equal(pickSportsdbPlayer(reece, 'Chelsea', norm), null);

  // 소속팀을 모르면 아무도 고르지 않는다 (예전엔 첫 번째를 집었다)
  assert.equal(pickSportsdbPlayer(list, '', norm), null);
  assert.equal(pickSportsdbPlayer([{ strSport: 'Cricket' }], 'x', norm), null);
  assert.equal(pickSportsdbPlayer(null, 'x', norm), null);
});

test('birthYearOf: 여러 표기에서 연도를 뽑는다', () => {
  assert.equal(birthYearOf('1993-11-07'), 1993);
  assert.equal(birthYearOf('English footballer (born 1999)'), 1999);
  assert.equal(birthYearOf(2006), 2006);
  assert.equal(birthYearOf(''), undefined);
  assert.equal(birthYearOf(null), undefined);
  assert.equal(birthYearOf('no year here'), undefined);
});

test('plausibleBirthYear: 생일 전후 두 해를 허용하고, 근거가 없으면 막지 않는다', () => {
  // 2026년에 26세 → 1999년생(생일 지남) 또는 2000년생(생일 전)
  assert.equal(plausibleBirthYear(1999, 26, TODAY), true);
  assert.equal(plausibleBirthYear(2000, 26, TODAY), true);
  assert.equal(plausibleBirthYear(1993, 26, TODAY), false);
  // 확인할 근거가 없으면 통과시킨다 — "확인 못 함" 과 "틀림" 은 다르다
  assert.equal(plausibleBirthYear(undefined, 26, TODAY), true);
  assert.equal(plausibleBirthYear(1993, undefined, TODAY), true);
});

test('pickSportsdbPlayer: 나이가 어긋나면 동명이인이다 (리스 제임스)', () => {
  /* ⚠️ 실제 데이터. 첼시 리스 제임스는 1999년생(26세)이고, TheSportsDB 에
     있는 유일한 "Reece James" 는 셰필드 웬즈데이의 1993년생이다.
     이름·국적·포지션이 전부 같아서 나이 말고는 가를 방법이 없다. */
  const sheffield = [{
    strPlayer: 'Reece James', strSport: 'Soccer', strTeam: 'Sheffield Wednesday',
    dateBorn: '1993-11-07', strCutout: 'wrong.png',
  }];
  assert.equal(pickSportsdbPlayer(sheffield, 'Chelsea', norm, 26, TODAY), null);
  // 소속팀까지 같더라도 나이가 다르면 거른다
  assert.equal(pickSportsdbPlayer(
    [{ ...sheffield[0], strTeam: 'Chelsea' }], 'Chelsea', norm, 26, TODAY,
  ), null);
  // 나이가 맞으면 받는다
  assert.equal(pickSportsdbPlayer(
    [{ ...sheffield[0], strTeam: 'Chelsea', dateBorn: '1999-12-08' }], 'Chelsea', norm, 26, TODAY,
  ).strTeam, 'Chelsea');
});

test('matchInRoster: 팀 안에서도 나이가 어긋나면 거른다', () => {
  const roster = [
    { strPlayer: 'Reece James', dateBorn: '1993-11-07', strCutout: 'wrong.png' },
  ];
  assert.equal(matchInRoster(roster, 'Reece James', norm, 26, TODAY), null);
  assert.equal(matchInRoster(roster, 'Reece James', norm, 32, TODAY).strCutout, 'wrong.png');
  // 나이를 모르면 막지 않는다
  assert.equal(matchInRoster(roster, 'Reece James', norm, undefined, TODAY).strCutout, 'wrong.png');
});

test('matchInRoster: 팀 안에서는 표기 차이에 관대해도 안전하다', () => {
  const roster = [
    { strPlayer: 'João Pedro', strCutout: 'jp.png' },
    { strPlayer: 'Pedro Neto', strCutout: 'pn.png' },
    { strPlayer: 'Jorrel Hato', strCutout: 'jh.png' },
    { strPlayer: 'Cole Palmer', strThumb: 'cp.jpg' },
  ];
  // 발음기호가 달라도 정규화하면 같다 (이름 검색은 이걸 못 찾았다)
  assert.equal(matchInRoster(roster, 'Joao Pedro', norm).strCutout, 'jp.png');
  // ESPN 이 성만 줘도 팀 안에서 하나뿐이면 찾는다
  assert.equal(matchInRoster(roster, 'Hato', norm).strCutout, 'jh.png');
  // 'Pedro' 는 João Pedro / Pedro Neto 둘에 걸리고, 한 단어라 성 비교도
  // 하지 않는다 → 포기한다 (엉뚱한 얼굴보다 사진 없음이 낫다)
  assert.equal(matchInRoster(roster, 'Pedro', norm), null);
  // 풀네임이면 정확히 찾는다
  assert.equal(matchInRoster(roster, 'Joao Pedro', norm).strCutout, 'jp.png');
  assert.equal(matchInRoster(roster, 'Pedro Neto', norm).strCutout, 'pn.png');
  assert.equal(matchInRoster(roster, 'Nobody Here', norm), null);
  assert.equal(matchInRoster([], 'x', norm), null);
});

test('photoFromSportsdb: 컷아웃 우선, 없으면 썸네일', () => {
  assert.deepEqual(photoFromSportsdb({ strCutout: 'c.png', strThumb: 't.jpg' }),
    { url: 'c.png', kind: 'cutout' });
  assert.deepEqual(photoFromSportsdb({ strThumb: 't.jpg' }), { url: 't.jpg', kind: 'thumb' });
  assert.equal(photoFromSportsdb({}), undefined);
  assert.equal(photoFromSportsdb(null), undefined);
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
