#!/usr/bin/env node
/**
 * 지금 라이브 수집을 켜야 할 경기 — 한 줄에 "slug espnId kickoff" (2026-10-18).
 * 팀 일정 수집(snapshot.yml)이 회차마다 부르고, 줄마다 live-match.yml 을 띄운다(이미 도는 경기는 워크플로가 거른다).
 * 이미 끝까지 받은 경기(live-{slug}.json 의 phase=done)는 다시 띄우지 않는다.
 *
 * 사용: node scripts/live-detect.mjs [데이터 폴더=web/public/data]
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { LIVE_TEAMS, liveCandidates } from './lib/live.mjs';

const OUT = process.argv[2] ?? 'web/public/data';
for (const slug of Object.keys(LIVE_TEAMS)) {
  const sched = await readFile(join(OUT, `schedule-${slug}.json`), 'utf8').then(JSON.parse).catch(() => null);
  const live = await readFile(join(OUT, `live-${slug}.json`), 'utf8').then(JSON.parse).catch(() => null);
  for (const m of liveCandidates(sched?.events)) {
    if (live?.espnId === m.id && live?.phase === 'done') continue;
    console.log(`${slug} ${m.id} ${m.kickoff}`);
  }
}
