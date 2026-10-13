#!/usr/bin/env node
/**
 * 배포 빌드 뒤에 팀별 캘린더 파일을 만든다.
 *
 *   node scripts/build-ics.mjs <피드 폴더> <출력 폴더>
 *   예) node ../scripts/build-ics.mjs public/data dist/cal   (web/ 에서, npm run build 가 부른다)
 *
 * 데이터 커밋(10분·1시간)마다 배포가 다시 돌므로 캘린더도 같이 새로 만들어진다.
 * 파일은 커밋하지 않는다 — 빌드 산출물이다.
 */
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { scheduleToIcs } from './lib/ics.mjs';

const [src = 'public/data', out = 'dist/cal'] = process.argv.slice(2);
await mkdir(out, { recursive: true });

let n = 0;
for (const f of await readdir(src)) {
  const m = /^schedule-(.+)\.json$/.exec(f);
  if (!m) continue;
  let json;
  try { json = JSON.parse(await readFile(join(src, f), 'utf8')); } catch { continue; }
  const name = json?.events?.[0]?.competitions?.[0]?.competitors
    ?.find((c) => c.team?.id === String(json.team))?.team?.displayName ?? m[1];
  await writeFile(join(out, `${m[1]}.ics`), scheduleToIcs(json, `${name} · MS Stats Hub`));
  n++;
}
console.log(`캘린더 ${n}개 → ${out}`);
