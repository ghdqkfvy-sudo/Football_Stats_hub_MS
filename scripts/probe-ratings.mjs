#!/usr/bin/env node
/**
 * 경기 상세 모양 점검 (2026-10-18) — **사이트·데이터 파일은 건드리지 않는다.**
 * "오늘의 경기" 화면에 쓸 FotMob matchDetails 칸을 본다: 머리(스코어 · 경기 시간 · 상태),
 * 라인업(포메이션 · 선수 좌표 · 벤치 · 감독), 경기 이벤트(골 · 카드 · 교체).
 * 사용: node scripts/probe-ratings.mjs
 */
import fs from 'node:fs/promises';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
async function json(url) {
  const res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': UA }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
const clip = (v, n = 1500) => { const t = JSON.stringify(v); return t && t.length > n ? `${t.slice(0, n)}…` : t; };
const lines = ['# 경기 상세 모양', ''];
const team = await json('https://www.fotmob.com/api/data/teams?id=8650&ccode3=KOR');
const fin = []; const seen = new Set();
const walk = (o, d) => { if (!o || typeof o !== 'object' || d > 7 || seen.has(o)) return; seen.add(o); if (o.id != null && o.status?.finished && o.status?.utcTime) fin.push([String(o.id), Date.parse(o.status.utcTime)]); for (const v of Object.values(o)) walk(v, d + 1); };
walk(team, 0);
const last = fin.sort((a, b) => b[1] - a[1])[0][0];
const md = await json(`https://www.fotmob.com/api/data/matchDetails?matchId=${last}`);
lines.push(`경기 ${last}`, '', `- 최상위: ${Object.keys(md).join(', ')}`, `- general: ${clip(md.general, 900)}`, `- header: ${clip(md.header, 1500)}`);
const c = md.content ?? {};
lines.push(`- content: ${Object.keys(c).join(', ')}`);
const lu = c.lineup ?? {};
lines.push(`- lineup: ${Object.keys(lu).join(', ')}`, `- lineup.homeTeam 칸: ${Object.keys(lu.homeTeam ?? {}).join(', ')}`);
const ht = lu.homeTeam ?? {};
lines.push(`- homeTeam (선수 빼고): ${clip(Object.fromEntries(Object.entries(ht).filter(([k]) => !['starters', 'subs', 'unavailable'].includes(k))), 800)}`);
lines.push(`- starters[0]: ${clip(ht.starters?.[0], 1200)}`, `- starters[5]: ${clip(ht.starters?.[5], 1200)}`, `- subs[0]: ${clip(ht.subs?.[0], 900)}`);
const ev = c.matchFacts?.events;
lines.push(`- matchFacts 칸: ${Object.keys(c.matchFacts ?? {}).join(', ')}`, `- events 칸: ${Object.keys(ev ?? {}).join(', ')}`);
const evs = ev?.events ?? [];
const byType = {};
for (const e of evs) (byType[e.type] ??= []).push(e);
for (const [t, xs] of Object.entries(byType)) lines.push(`- 이벤트 ${t} ×${xs.length}: ${clip(xs[0], 900)}`);
console.log(lines.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
