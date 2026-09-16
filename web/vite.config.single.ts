import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * 단일 파일 프리뷰 빌드 (Artifact 등 네트워크가 막힌 곳에서 열어 보기용).
 *
 * 이 빌드만 `public/data/*.json` 을 **빌드 시점에** 인라인한다.
 * 손으로 적은 값이 아니라 `npm run snapshot` 이 ESPN 에서 떠 온 파일 그대로이고,
 * 화면에는 언제 뜬 것인지(`자동 갱신 · N일 전`)가 항상 같이 표시된다.
 *
 * public/data 가 비어 있으면 아무것도 인라인되지 않고 앱은 "데이터 없음" 을
 * 그대로 보여 준다 — 오래된 값을 조용히 보여 주는 것보다 그 편이 낫다.
 *
 * 일반 빌드(`npm run build`)에는 이 플러그인이 붙지 않는다.
 */
function inlineFeed() {
  const dir = join(process.cwd(), 'public', 'data');
  const bundle: Record<string, unknown> = {};
  if (existsSync(dir)) {
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      try {
        bundle[f] = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      } catch {
        /* 깨진 파일은 넣지 않는다 */
      }
    }
  }
  const n = Object.keys(bundle).length;
  console.log(n ? `  인라인 피드 ${n}개 파일` : '  인라인 피드 없음 (npm run snapshot 으로 채웁니다)');
  return {
    name: 'inline-feed',
    config: () => ({ define: { __INLINE_FEED__: JSON.stringify(bundle) } }),
  };
}

export default defineConfig({
  plugins: [react(), inlineFeed(), viteSingleFile()],
  build: { outDir: 'dist-single', assetsInlineLimit: 100000000, cssCodeSplit: false },
});
