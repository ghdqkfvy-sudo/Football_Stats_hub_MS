#!/usr/bin/env node
/**
 * 평점 점검 2 (2026-10-18) — **사이트·데이터 파일은 건드리지 않는다.**
 * 코리안리거 · Future Resources 선수의 FotMob 평점을 받을 길을 본다:
 *   1. 위키데이터에서 FotMob 선수 ID 속성 찾기 (sofascore-ids.json 에 이미 있는 위키데이터 항목으로)
 *   2. FotMob 검색 API
 *   3. 선수 API(playerData) 의 평점 칸 — 시즌 평균 · 최근 경기
 * 사용: node scripts/probe-ratings.mjs
 */
import fs from 'node:fs/promises';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const WUA = 'FootballStatsHub/1.0 (https://github.com/ghdqkfvy-sudo/Football_Stats_hub_MS)';
async function json(url, ua = UA) {
  const res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': ua }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
function hits(root, re, max = 40) {
  const out = []; const seen = new Set();
  const walk = (o, p, d) => {
    if (out.length >= max || !o || typeof o !== 'object' || d > 9 || seen.has(o)) return;
    seen.add(o);
    for (const [k, v] of Object.entries(o)) {
      const q = `${p}.${k}`;
      if (re.test(k) || (typeof v === 'string' && re.test(v) && v.length < 40)) out.push(`\`${q}\` = ${JSON.stringify(v)?.slice(0, 200)}`);
      walk(v, q, d + 1);
    }
  };
  walk(root, '$', 0);
  return out;
}
const ids = JSON.parse(await fs.readFile('web/public/data/sofascore-ids.json', 'utf8')).ids;
const kor = JSON.parse(await fs.readFile('web/public/data/koreans.json', 'utf8')).players;
const fut = JSON.parse(await fs.readFile('web/public/data/future.json', 'utf8')).players;
const lines = ['# 평점 점검 2 — 코리안리거 · Future', ''];

/* 1. 위키데이터 — 손흥민 항목의 외부 ID 속성 중 FotMob */
let prop = null;
try {
  const q = ids['149945']?.qid;
  const e = await json(`https://www.wikidata.org/w/api.php?format=json&action=wbgetentities&ids=${q}&props=claims`, WUA);
  const claims = e?.entities?.[q]?.claims ?? {};
  const pids = Object.keys(claims);
  const labels = {};
  for (let i = 0; i < pids.length; i += 45) {
    const l = await json(`https://www.wikidata.org/w/api.php?format=json&action=wbgetentities&ids=${pids.slice(i, i + 45).join('|')}&props=labels&languages=en`, WUA);
    for (const [k, v] of Object.entries(l?.entities ?? {})) labels[k] = v?.labels?.en?.value ?? '';
  }
  const fm = pids.filter((p) => /fotmob/i.test(labels[p] ?? ''));
  lines.push(`- 위키데이터 ${q}: FotMob 속성 ${fm.map((p) => `${p}(${labels[p]})=${claims[p]?.[0]?.mainsnak?.datavalue?.value}`).join(' · ') || '없음'}`);
  prop = fm[0] ?? null;
} catch (e) { lines.push(`- 위키데이터 실패 ${e.message}`); }

/* 위키데이터로 전원 FotMob ID */
const fmId = {};
if (prop) {
  const players = [...kor, ...fut];
  const qids = players.map((p) => ids[p.id]?.qid).filter(Boolean);
  for (let i = 0; i < qids.length; i += 45) {
    const e = await json(`https://www.wikidata.org/w/api.php?format=json&action=wbgetentities&ids=${qids.slice(i, i + 45).join('|')}&props=claims`, WUA);
    for (const p of players) {
      const q = ids[p.id]?.qid; const v = e?.entities?.[q]?.claims?.[prop]?.[0]?.mainsnak?.datavalue?.value;
      if (v) fmId[p.id] = String(v);
    }
  }
  lines.push(`- 위키데이터로 FotMob ID 찾은 선수: ${Object.keys(fmId).length} / ${players.length}`, `  - 못 찾음: ${players.filter((p) => !fmId[p.id]).map((p) => p.name).join(', ') || '없음'}`);
}

/* 2. FotMob 검색 */
for (const u of ['https://www.fotmob.com/api/data/search/suggest?hits=5&lang=en&term=Son%20Heung-Min', 'https://www.fotmob.com/api/search/suggest?hits=5&lang=en&term=Son%20Heung-Min']) {
  try { const j = await json(u); lines.push(`- 검색 ${u.split('/api/')[1].split('?')[0]}: ${JSON.stringify(j).slice(0, 400)}`); } catch (e) { lines.push(`- 검색 ${u.split('/api/')[1].split('?')[0]}: 실패 ${e.message}`); }
}

/* 3. 선수 API — 손흥민 · 이강인 · 니코 파스 */
for (const p of [kor[0], kor[1], fut[0]]) {
  const id = fmId[p?.id];
  if (!id) { lines.push(`- ${p?.name}: FotMob ID 없음`); continue; }
  try {
    const pd = await json(`https://www.fotmob.com/api/data/playerData?id=${id}`);
    lines.push(`- ${p.name} (${id}) 최상위 칸: ${Object.keys(pd).join(', ')}`);
    lines.push(...hits(pd, /rating/i, 40).filter((x) => !/isTopRating/.test(x)).map((x) => `  - ${x}`));
    const rm = pd?.recentMatches?.[0];
    if (rm) lines.push(`  - recentMatches[0] 칸: ${Object.keys(rm).join(', ')} · 예: ${JSON.stringify(rm).slice(0, 400)}`);
  } catch (e) { lines.push(`- ${p.name}: 선수 API 실패 ${e.message}`); }
}
console.log(lines.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
