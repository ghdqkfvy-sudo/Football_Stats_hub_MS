#!/usr/bin/env node
/**
 * 화면 스모크 테스트 — "업데이트할 때마다 비슷한 문제가 다시 생기는" 것을 사람이
 * 화면을 보고 알아채기 전에 잡는다.
 *
 * 지금까지 반복된 사고는 대부분 **코드 검사(타입·단위 테스트)로는 안 보이는** 종류였다:
 *   · 헤드샷이 통째로 깨짐 (외부 이미지 호스트 변경 · 잘못된 사진 · 실패 상태 고착)
 *   · 섹션이 조용히 빈칸 ("선수 기록이 아직 집계되지 않았습니다", 404 피드)
 *   · 레이아웃 넘침 · 런타임 오류로 한 탭이 통째로 흰 화면
 * 그래서 진짜 브라우저로 모든 팀 × 모든 탭을 데스크톱·폰 폭에서 열어 본다.
 *
 * 사용:  node web/e2e/smoke.mjs <사이트 주소>
 *   CI(ci.yml)       — 방금 빌드한 사이트(vite preview)
 *   정기(smoke.yml)  — 배포된 실제 사이트. 데이터는 10분마다 바뀌는데 그 커밋에는
 *                      CI 가 돌지 않으므로, 데이터 쪽 사고는 이쪽이 잡는다.
 *
 * 실패하면 무엇이 어디서 깨졌는지 표로 남기고(GitHub 요약) 종료 코드 1.
 */
import { chromium } from 'playwright';
import { appendFileSync } from 'node:fs';

const BASE = (process.argv[2] ?? 'http://127.0.0.1:4173/').replace(/\/?$/, '/');
const TEAMS = ['real-madrid', 'chelsea', 'man-united', 'tottenham', 'newcastle', 'liverpool', 'korea'];

/* 탭별 "비어 있으면 안 되는 것" — 선택자 · 최소 개수 */
const EXPECT = {
  summary: [['.mdh__card[data-hero]', 1, '다음 경기 히어로'], ['.tbl__row', 5, '대회 순위표'], ['.lbc__row', 3, '선수 순위'], ['.ml > *', 1, '이달 경기 결과']],
  schedule: [['.hero, .empty', 1, '다음 경기']],
  standings: [['.tbl__row', 5, '순위표'], ['.lbc__row', 3, '공격 포인트']],
  players: [['.pt__row', 10, '선수 스탯']],
  future: [['.krc', 1, '조항 선수 카드']],
  news: [['.ncard', 3, '뉴스']],
  koreans: [['.krc', 5, '코리안리거 카드']],
};
/* 헤드샷은 몇 장 깨질 수 있다(원본에 사진이 없는 선수). 그 이상은 사고다. */
const MAX_BROKEN_PHOTO_RATIO = 0.15;

const problems = [];
const note = (where, what) => { problems.push({ where, what }); console.log(`  ✗ ${where}: ${what}`); };

const browser = await chromium.launch();

async function checkView(page, where, kind) {
  const errs = page.__errs.splice(0);
  for (const e of errs) note(where, `런타임 오류 — ${e}`);

  const r = await page.evaluate(({ expect }) => {
    const out = { missing: [], overflow: document.documentElement.scrollWidth - innerWidth };
    for (const [sel, min, label] of expect) {
      const n = document.querySelectorAll(sel).length;
      if (n < min) out.missing.push(`${label} ${n}/${min}`);
    }
    out.photos = [...new Set([...document.querySelectorAll('.hs img')].map((i) => i.getAttribute('src')).filter(Boolean))];
    /* 이미 화면에서 실패해 글자 배지로 떨어진 것(Headshot 이 data-failed 로 남긴다) */
    out.failed = [...new Set([...document.querySelectorAll('.hs[data-failed]')].map((e) => e.getAttribute('data-failed')))];
    out.errorBox = !!document.querySelector('[data-error-boundary]');
    return out;
  }, { expect: EXPECT[kind] ?? [] });

  if (r.overflow > 1) note(where, `가로 넘침 ${r.overflow}px`);
  for (const m of r.missing) note(where, `비어 있음 — ${m}`);
  if (r.errorBox) note(where, '오류 화면(ErrorBoundary)');

  /* 사진은 게으른 로딩이라 화면 밖 것은 아직 안 받았다 — 주소를 직접 불러 본다 */
  if (r.photos.length || r.failed.length) {
    const tried = await page.evaluate(async (urls) => {
      const one = (u) => new Promise((res) => {
        const i = new Image();
        const t = setTimeout(() => res(u), 10000);
        i.onload = () => { clearTimeout(t); res(i.naturalWidth ? null : u); };
        i.onerror = () => { clearTimeout(t); res(u); };
        i.src = u;
      });
      const bad = [];
      for (let k = 0; k < urls.length; k += 8) {
        (await Promise.all(urls.slice(k, k + 8).map(one))).forEach((x) => x && bad.push(x));
      }
      return bad;
    }, r.photos);
    const broken = [...new Set([...tried, ...r.failed])];
    const total = new Set([...r.photos, ...r.failed]).size;
    const ratio = broken.length / total;
    if (ratio > MAX_BROKEN_PHOTO_RATIO) {
      const hosts = {};
      for (const u of broken) { const h = new URL(u, BASE).host; hosts[h] = (hosts[h] ?? 0) + 1; }
      note(where, `헤드샷 ${broken.length}/${total}장 깨짐 — ${Object.entries(hosts).map(([h, n]) => `${h} ${n}`).join(', ')}`);
    }
  }
}

for (const [label, viewport, mobile] of [['데스크톱', { width: 1440, height: 900 }, false], ['폰', { width: 390, height: 844 }, true]]) {
  const page = await browser.newPage({ viewport, isMobile: mobile, hasTouch: mobile });
  page.__errs = [];
  page.on('pageerror', (e) => page.__errs.push(e.message.slice(0, 160)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource|net::ERR_|favicon/.test(m.text())) page.__errs.push(m.text().slice(0, 160));
  });

  console.log(`\n── ${label} (${viewport.width}px)`);
  await page.goto(`${BASE}#/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);         // Summary 선수 순위는 전체 대회 파일을 뒤늦게 받는다
  await checkView(page, `${label} · Summary`, 'summary');

  for (const team of TEAMS) {
    await page.goto(`${BASE}#/${team}/schedule`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const tabs = await page.$$eval('.tabs .tab', (els) => els.map((e, i) => ({ i, id: e.textContent })));
    for (const { i } of tabs) {
      await page.click(`.tabs .tab:nth-child(${i + 1})`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(900);
      const hash = await page.evaluate(() => location.hash);
      const kind = hash.split('/')[2] ?? 'schedule';
      await checkView(page, `${label} · ${team} · ${kind}`, kind);
    }
  }
  await page.close();
}
await browser.close();

const md = problems.length
  ? `## ✗ 화면 스모크 — ${problems.length}건\n\n| 어디 | 무엇 |\n|---|---|\n${problems.map((p) => `| ${p.where} | ${p.what} |`).join('\n')}\n`
  : '## ✓ 화면 스모크 — 전 팀 · 전 탭 · 데스크톱/폰 이상 없음\n';
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
console.log('\n' + md);
process.exit(problems.length ? 1 : 0);
