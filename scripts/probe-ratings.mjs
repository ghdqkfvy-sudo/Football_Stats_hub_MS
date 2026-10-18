#!/usr/bin/env node
/**
 * 평점 점검 3 (2026-10-18) — **사이트·데이터 파일은 건드리지 않는다.**
 * 위키데이터에는 FotMob ID 가 없었다(점검 2). FotMob 검색(search/suggest)으로 코리안리거 ·
 * Future 선수를 찾고, 소속팀 이름이 맞는 후보만 받는다. 찾은 선수의 선수 API 평점 칸도 본다.
 * 사용: node scripts/probe-ratings.mjs
 */
import fs from 'node:fs/promises';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
async function json(url) {
  const res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': UA }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function hits(root, re, max = 30) {
  const out = []; const seen = new Set();
  const walk = (o, p, d) => {
    if (out.length >= max || !o || typeof o !== 'object' || d > 9 || seen.has(o)) return;
    seen.add(o);
    for (const [k, v] of Object.entries(o)) {
      const q = `${p}.${k}`;
      if (re.test(k)) out.push(`\`${q}\` = ${JSON.stringify(v)?.slice(0, 160)}`);
      walk(v, q, d + 1);
    }
  };
  walk(root, '$', 0);
  return out;
}
const kor = JSON.parse(await fs.readFile('web/public/data/koreans.json', 'utf8')).players;
const fut = JSON.parse(await fs.readFile('web/public/data/future.json', 'utf8')).players;
const players = [...kor, ...fut];
/* 한국 이름은 FotMob 이 "이름 성" 순서(Heung-Min Son) */
const terms = (p) => {
  const t = [p.name];
  const w = p.name.split(' ');
  if (w.length === 2) t.push(`${w[1]} ${w[0]}`);
  return t;
};
const sameClub = (a, b) => { const x = norm(a), y = norm(b); return !!x && !!y && (x.includes(y) || y.includes(x) || x.split(' ').some((w) => w.length > 3 && y.split(' ').includes(w))); };
const lines = ['# 평점 점검 3 — FotMob 검색으로 선수 찾기', '', '| 선수 | 소속 | 찾은 FotMob | 팀 | 결과 |', '|---|---|---|---|---|'];
const found = [];
for (const p of players) {
  let pick = null; let cands = [];
  for (const t of terms(p)) {
    try {
      const j = await json(`https://www.fotmob.com/api/data/search/suggest?hits=8&lang=en&term=${encodeURIComponent(t)}`);
      cands = (j ?? []).flatMap((g) => g?.suggestions ?? []).filter((s) => s?.type === 'player');
      pick = cands.find((s) => sameClub(s.teamName, p.club)) ?? null;
      if (pick) break;
    } catch (e) { cands = [{ name: `오류 ${e.message}` }]; }
    await sleep(200);
  }
  lines.push(`| ${p.name} | ${p.club} | ${pick ? `${pick.name} (${pick.id})` : cands.slice(0, 2).map((c) => c.name).join(' / ') || '-'} | ${pick?.teamName ?? cands[0]?.teamName ?? ''} | ${pick ? '맞음' : '못 찾음'} |`);
  if (pick) found.push({ p, id: pick.id });
}
lines.push('', `찾음 ${found.length} / ${players.length}`, '');
for (const { p, id } of found.slice(0, 2)) {
  try {
    const pd = await json(`https://www.fotmob.com/api/data/playerData?id=${id}`);
    lines.push(`## ${p.name} (${id}) 선수 API`, `- 최상위 칸: ${Object.keys(pd).join(', ')}`);
    lines.push(...hits(pd, /rating/i, 30).filter((x) => !/isTopRating/.test(x)).map((x) => `  - ${x}`));
    const rm = pd?.recentMatches?.[0];
    if (rm) lines.push(`- recentMatches[0]: ${JSON.stringify(rm).slice(0, 500)}`);
  } catch (e) { lines.push(`- ${p.name}: 선수 API 실패 ${e.message}`); }
}
console.log(lines.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
