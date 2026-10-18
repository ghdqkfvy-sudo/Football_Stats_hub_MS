#!/usr/bin/env node
/**
 * 오늘의 경기 — 한 번 받아 live-{slug}.json 을 쓴다 (2026-10-18).
 * 경기 중 워크플로(live-match.yml)가 1분마다 부르고, 표준 출력 첫 줄로 단계(pre · live · done · error)를 알린다.
 *
 * 사용: node scripts/live-match.mjs <데이터 폴더> <slug> <ESPN 경기 id> <킥오프 ISO>
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { LIVE_TEAMS, fixtureNear, liveSnapshot } from './lib/live.mjs';

const [OUT = 'web/public/data', slug, espnId, kickoff] = process.argv.slice(2);
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const fotmob = async (path) => {
  const res = await fetch(`https://www.fotmob.com/api/data/${path}`, { headers: { accept: 'application/json', 'user-agent': UA }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

const team = LIVE_TEAMS[slug];
if (!team || !espnId) { console.log('error'); console.error('팀 또는 경기 id 가 없다'); process.exit(0); }
const file = join(OUT, `live-${slug}.json`);
const prev = await readFile(file, 'utf8').then(JSON.parse).catch(() => null);

try {
  /* FotMob 경기 id — 같은 경기를 이미 받고 있으면 그 id, 아니면 팀 일정에서 킥오프 시각으로 찾는다 */
  let fmId = prev?.espnId === espnId ? prev?.fmId : null;
  if (!fmId) fmId = fixtureNear(await fotmob(`teams?id=${team.fm}&ccode3=KOR`), kickoff);
  if (!fmId) throw new Error('FotMob 에서 이 경기를 못 찾음');
  const snap = liveSnapshot(await fotmob(`matchDetails?matchId=${fmId}`), team.fm);
  const body = { format: 1, slug, espnId, ...snap, kickoffUtc: snap.kickoffUtc ?? kickoff, updatedAt: new Date().toISOString() };
  await writeFile(file, `${JSON.stringify(body)}\n`);
  console.log(snap.phase);
  console.error(`${slug} ${espnId} → FotMob ${fmId}: ${snap.phase} ${snap.clock ?? ''} ${snap.score.join('-')}`);
} catch (e) {
  console.log('error');
  console.error(`${slug} ${espnId}: ${String(e?.message ?? e)} — 파일은 그대로 둔다`);
}
