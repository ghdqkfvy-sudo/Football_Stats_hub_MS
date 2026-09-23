/**
 * 배포 전 데이터 관문.
 *
 * 2026-09-23 새벽, 스냅샷 잡 두 개가 같은 시각에 푸시 단계에 들어가면서
 * `git pull --rebase --autostash` 의 스태시 복원이 충돌했고, 충돌 마커가
 * 그대로 들어간 JSON 이 커밋·배포됐다. JSON.parse 가 죽어 사이트의 일정과
 * 뉴스가 전부 빈 화면이 됐는데, 그걸 알아챈 건 사람이 화면을 보고 나서였다.
 *
 * 수집 쪽은 고쳤지만(워크플로에서 스태시를 걷어냈다), 원인이 무엇이든
 * **깨진 데이터가 배포로 넘어가지 않게** 마지막에 한 번 더 본다.
 * 여기서 실패하면 배포가 멈추고, 사이트는 직전의 멀쩡한 버전을 계속 보여 준다.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? 'web/public/data';
const MARKER = /^(<<<<<<< |=======$|>>>>>>> )/m;

/** 이 파일들이 없으면 화면 한 섹션이 통째로 비므로, 없는 것도 실패로 본다 */
const REQUIRED = ['meta.json'];

const problems = [];
let checked = 0;

let names;
try {
  names = readdirSync(dir).filter((f) => f.endsWith('.json'));
} catch {
  console.error(`데이터 폴더를 찾을 수 없다: ${dir}`);
  process.exit(1);
}

for (const name of names) {
  const path = join(dir, name);
  const text = readFileSync(path, 'utf8');
  checked++;

  if (MARKER.test(text)) {
    problems.push(`${name}: 병합 충돌 마커가 들어 있다`);
    continue;
  }
  if (statSync(path).size === 0) {
    problems.push(`${name}: 빈 파일`);
    continue;
  }
  try {
    JSON.parse(text);
  } catch (e) {
    problems.push(`${name}: JSON 파싱 실패 — ${String(e).split('\n')[0]}`);
  }
}

for (const need of REQUIRED) {
  if (!names.includes(need)) problems.push(`${need}: 없음`);
}

if (problems.length) {
  console.error(`데이터 ${checked}개 중 ${problems.length}개가 깨졌다:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(`데이터 ${checked}개 전부 정상 (${dir})`);
