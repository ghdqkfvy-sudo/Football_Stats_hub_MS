#!/usr/bin/env node
/**
 * 수집기(scripts/snapshot.mjs)와 앱(web/src/**)이 **같은 목록**을 보고 있는지 확인한다.
 *
 * ⚠️ 왜: 지금 같은 목록이 두 곳에 따로 적혀 있다.
 *   · 추적 팀      snapshot.mjs TEAMS        ↔ web/src/config/targets.ts TARGETS
 *   · 코리안리거   snapshot.mjs KOREANS      ↔ web/src/config/koreans.ts KOREAN_SEEDS
 *   · 조항 선수    snapshot.mjs FUTURE       ↔ web/src/data/future.ts FUTURE
 * 파일 이름이 팀 슬러그에서 나오기 때문에(schedule-{slug}.json) 한쪽만 고치면
 * 앱이 없는 파일을 찾고, 화면은 에러도 없이 "데이터 없음" 이 된다.
 *
 * 진짜 해법은 두 곳이 공유하는 모듈 하나를 두는 것이다. 그 리팩터링을 하기
 * 전까지, 최소한 어긋난 사실은 사람이 기억하지 않아도 드러나게 한다.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFile(join(ROOT, p), 'utf8');

/** 소스에서 `const NAME = [ … ];` 블록만 잘라 낸다 */
function block(src, name) {
  const i = src.indexOf(`const ${name}`);
  if (i < 0) return '';
  const j = src.indexOf('\n];', i);
  return j < 0 ? '' : src.slice(i, j);
}

const ids = (text, re) => [...text.matchAll(re)].map((m) => m[1]);
const uniq = (xs) => [...new Set(xs)].sort();

const diff = (label, a, b, aName, bName) => {
  const onlyA = a.filter((x) => !b.includes(x));
  const onlyB = b.filter((x) => !a.includes(x));
  if (!onlyA.length && !onlyB.length) {
    console.log(`✓ ${label} — ${a.length}건 일치`);
    return true;
  }
  console.error(`✗ ${label} 이 어긋났다`);
  if (onlyA.length) console.error(`    ${aName} 에만: ${onlyA.join(', ')}`);
  if (onlyB.length) console.error(`    ${bName} 에만: ${onlyB.join(', ')}`);
  return false;
};

const snap = await read('scripts/snapshot.mjs');
let ok = true;

/* ── 추적 팀: ESPN team id 와 슬러그 ───────────────────── */
{
  const snapTeams = block(snap, 'TEAMS = [');
  const targets = await read('web/src/config/targets.ts');
  const snapIds = uniq(ids(snapTeams, /id: '(\d+)'/g));
  const appIds = uniq(ids(targets, /espnTeamId: '(\d+)'/g));
  ok = diff('추적 팀 id', snapIds, appIds, 'snapshot.mjs TEAMS', 'targets.ts TARGETS') && ok;

  /* 슬러그가 데이터 파일 이름이 된다 — 여기가 어긋나면 404 다 */
  const snapSlugs = uniq(ids(snapTeams, /slug: '([\w-]+)'/g));
  const appSlugs = uniq(ids(targets, /^\s{4}id: '([\w-]+)',$/gm));
  ok = diff('팀 슬러그(데이터 파일 이름)', snapSlugs, appSlugs,
    'snapshot.mjs TEAMS.slug', 'targets.ts TARGETS.id') && ok;
}

/* ── 코리안리거 ───────────────────────────────────────── */
{
  const snapKo = block(snap, 'KOREANS = [');
  const cfg = await read('web/src/config/koreans.ts');
  const snapIds = uniq(ids(snapKo, /\['(\d+)'/g));
  const appIds = uniq(ids(block(cfg, 'KOREAN_SEEDS'), /id: '(\d+)'/g));
  ok = diff('코리안리거 athleteId', snapIds, appIds,
    'snapshot.mjs KOREANS', 'koreans.ts KOREAN_SEEDS') && ok;
}

/* ── 조항 선수 ───────────────────────────────────────── */
{
  const snapFut = block(snap, 'FUTURE = [');
  const fut = await read('web/src/data/future.ts');
  const snapIds = uniq(ids(snapFut, /\['(\d+)'/g));
  const appIds = uniq(ids(block(fut, 'FUTURE: FuturePlayer[]'), /id: '(\d+)'/g));
  ok = diff('조항 선수 athleteId', snapIds, appIds,
    'snapshot.mjs FUTURE', 'future.ts FUTURE') && ok;
}

if (!ok) {
  console.error('\n한쪽만 고치면 데이터 파일 이름이 안 맞아 화면이 조용히 비어 버린다.');
  process.exit(1);
}
console.log('\n모든 목록이 일치한다.');
