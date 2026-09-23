/**
 * 사진 되살리기 — 사고 복구용.
 *
 * 스냅샷은 매 회차 지난 파일에서 사진을 이어받는다. 그 사슬이 한 번
 * 끊기면(파일이 깨지거나, 한도에 걸린 회차가 겹치거나) 애써 모은 컷아웃이
 * 통째로 위키 사진으로 떨어지고, TheSportsDB 무료 키로는 다시 채우는 데
 * 여러 시간이 걸린다. 2026-09-23 새벽에 정확히 그렇게 됐다.
 *
 * 옛 파일(git 에서 꺼낸 것)에 더 좋은 사진이 있으면 지금 파일로 옮긴다.
 * 판정은 스냅샷과 **같은 규칙**(betterPhoto — 등급이 높을 때만 교체)이라
 * 되살리기가 데이터를 뒤로 되돌리는 일은 없다. 사진 말고는 아무것도
 * 건드리지 않는다.
 *
 *   git worktree/show 로 옛 버전을 어딘가 풀어 둔 뒤
 *   node scripts/restore-photos.mjs <옛-데이터-폴더> <지금-데이터-폴더>
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { betterPhoto, isBadPhoto, kindFromUrl } from './lib/photos.mjs';

const [from, to] = process.argv.slice(2);
if (!from || !to) {
  console.error('사용법: node scripts/restore-photos.mjs <옛-데이터-폴더> <지금-데이터-폴더>');
  process.exit(2);
}

const readJson = async (dir, name) => {
  try { return JSON.parse(await readFile(join(dir, name), 'utf8')); } catch { return null; }
};
/* 확인된 오답은 옛 커밋에 남아 있어도 되살리지 않는다 — 실제로 한 번
   그렇게 하비에르 사비올라 얼굴이 Sávio 자리로 돌아왔다.
   (betterPhoto 가 이미 막지만, 여기서 읽히게 한 번 더 적는다) */
const photoOf = (a) =>
  (a?.photo && !isBadPhoto(a.photo) ? { url: a.photo, kind: a.photoKind ?? kindFromUrl(a.photo) } : null);

let files = 0;
let restored = 0;

for (const name of (await readdir(to)).filter((f) => f.startsWith('squad-') && f.endsWith('.json'))) {
  const [oldJ, newJ] = await Promise.all([readJson(from, name), readJson(to, name)]);
  if (!oldJ || !newJ) { console.log(`  ${name}: 건너뜀 (한쪽을 읽지 못함)`); continue; }

  let n = 0;
  for (const [id, a] of Object.entries(newJ.athletes ?? {})) {
    const best = betterPhoto(photoOf(a), photoOf(oldJ.athletes?.[id]));
    if (best && best.url !== a.photo) {
      a.photo = best.url;
      a.photoKind = best.kind;
      n++;
    }
  }
  if (n) {
    await writeFile(join(to, name), JSON.stringify(newJ), 'utf8');
    files++;
    restored += n;
  }
  console.log(`  ${name}: ${n}명 되살림`);
}

console.log(`파일 ${files}개 · 선수 ${restored}명의 사진을 되살렸다.`);
