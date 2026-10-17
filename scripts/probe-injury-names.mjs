#!/usr/bin/env node
/**
 * 부상명 점검 (2026-10-17) — **사이트·데이터 파일은 건드리지 않는다.**
 * FotMob 은 팀 스쿼드에서 부상을 번호(injury.id)로만 준다. 이름이 어디 있는지 본다:
 *   1. 팀 API 스쿼드의 injury 객체 전체 (번호 말고 다른 칸이 있는지)
 *   2. 선수 API(playerData) 의 부상 칸
 * 사용: node scripts/probe-injury-names.mjs
 */
import fs from 'node:fs/promises';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const TEAMS = { 'real-madrid': 8633, chelsea: 8455, 'man-united': 10260, tottenham: 8586, newcastle: 10261, liverpool: 8650, bayern: 9823, atletico: 9906, lafc: 867280 };

async function json(url) {
  const res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': UA }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
/** 이름에 injur 가 들어간 칸의 경로·값 */
function hits(root, max = 12) {
  const out = [];
  const seen = new Set();
  const walk = (o, p, d) => {
    if (out.length >= max || !o || typeof o !== 'object' || d > 10 || seen.has(o)) return;
    seen.add(o);
    for (const [k, v] of Object.entries(o)) {
      const q = `${p}.${k}`;
      if (/injur/i.test(k)) out.push({ path: q, value: JSON.stringify(v)?.slice(0, 300) });
      walk(v, q, d + 1);
    }
  };
  walk(root, '$', 0);
  return out;
}

const lines = ['# 부상명 점검', ''];
const codes = new Map();   // 번호 → 이름들
for (const [slug, fm] of Object.entries(TEAMS)) {
  let team;
  try { team = await json(`https://www.fotmob.com/api/data/teams?id=${fm}&ccode3=KOR`); } catch (e) { lines.push(`- ${slug}: 팀 API 실패 ${e.message}`); continue; }
  const members = (team?.squad?.squad ?? []).flatMap((g) => g?.members ?? []).filter((m) => m?.injury);
  lines.push(`## ${slug} — 부상 ${members.length}명`);
  if (members[0]) lines.push(`- 팀 API injury 객체 예: \`${JSON.stringify(members[0].injury)}\``);
  for (const m of members.slice(0, 6)) {
    try {
      const pd = await json(`https://www.fotmob.com/api/data/playerData?id=${m.id}`);
      const h = hits(pd);
      lines.push(`- ${m.name} (번호 ${m.injury?.id}): ${h.map((x) => `\`${x.path}\`=${x.value}`).join(' · ') || '부상 칸 없음'}`);
      const nm = h.map((x) => { try { return JSON.parse(x.value)?.name; } catch { return null; } }).find(Boolean);
      if (nm) { const s = codes.get(String(m.injury?.id)) ?? new Set(); s.add(nm); codes.set(String(m.injury?.id), s); }
    } catch (e) { lines.push(`- ${m.name}: 선수 API 실패 ${e.message}`); }
  }
  lines.push('');
}
lines.push('## 번호 → 이름 (모은 것)', '', ...[...codes].sort((a, b) => Number(a[0]) - Number(b[0])).map(([k, s]) => `- ${k}: ${[...s].join(' / ')}`));
console.log(lines.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
