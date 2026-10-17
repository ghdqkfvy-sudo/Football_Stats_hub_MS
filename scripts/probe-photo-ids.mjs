#!/usr/bin/env node
/**
 * 사진 ID 점검 (2026-10-17) — **사이트·데이터 파일은 건드리지 않는다.**
 * SofaScore ID 를 못 찾은 선수를 위키데이터에서 다른 이름으로도 찾아 보고,
 * 후보마다 설명 · SofaScore ID(P12302) · 생년을 로그로 남긴다.
 * 사용: node scripts/probe-photo-ids.mjs
 */
const WD = 'https://www.wikidata.org/w/api.php';
const UA = 'FootballStatsHub/1.0 (https://github.com/ghdqkfvy-sudo/Football_Stats_hub_MS)';
const PLAYERS = [
  { name: 'Sávio', age: 22, try: ['Sávio', 'Savinho', 'Sávio Moreira de Oliveira', 'Savio Moreira'] },
  { name: 'Víctor Muñoz', age: 23, try: ['Víctor Muñoz', 'Victor Munoz', 'Víctor Muñoz footballer', 'Víctor Muñoz Cuenca'] },
];
async function wd(params) {
  const q = new URLSearchParams({ format: 'json', ...params });
  const res = await fetch(`${WD}?${q}`, { headers: { accept: 'application/json', 'user-agent': UA }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
const first = (e, p) => e?.claims?.[p]?.[0]?.mainsnak?.datavalue?.value;
const lines = ['# 사진 ID 점검', ''];
for (const p of PLAYERS) {
  lines.push(`## ${p.name} (ESPN 나이 ${p.age})`, '', '| 검색어 | 항목 | 이름 | 설명 | SofaScore | 생년 | TM |', '|---|---|---|---|---|---|---|');
  for (const term of p.try) {
    try {
      const s = await wd({ action: 'wbsearchentities', type: 'item', language: 'en', limit: '10', search: term });
      const hits = s?.search ?? [];
      if (!hits.length) { lines.push(`| ${term} | 결과 없음 | | | | | |`); continue; }
      const e = await wd({ action: 'wbgetentities', ids: hits.map((h) => h.id).join('|'), props: 'claims|labels', languages: 'en' });
      for (const h of hits) {
        const ent = e?.entities?.[h.id];
        const ss = first(ent, 'P12302') ?? '';
        const by = String(first(ent, 'P569')?.time ?? '').slice(1, 5);
        const tm = first(ent, 'P2446') ?? '';
        lines.push(`| ${term} | ${h.id} | ${h.label ?? ''} | ${h.description ?? ''} | ${ss} | ${by} | ${tm} |`);
      }
    } catch (err) { lines.push(`| ${term} | 오류 ${err.message} | | | | | |`); }
  }
  lines.push('');
}
console.log(lines.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) await (await import('node:fs/promises')).appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
