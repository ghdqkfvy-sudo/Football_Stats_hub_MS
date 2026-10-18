#!/usr/bin/env node
/**
 * 평점 점검 (2026-10-18) — **사이트·데이터 파일은 건드리지 않는다.**
 * FotMob 에서 평점이 어디에 어떤 모양으로 오는지 본다:
 *   1. 최근 끝난 경기 상세(matchDetails)의 라인업 선수 performance (경기별 평점)
 *   2. 선수 API(playerData) 의 rating 칸 (시즌 평균 · 대회별)
 * 사용: node scripts/probe-ratings.mjs
 */
import fs from 'node:fs/promises';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const TEAMS = { liverpool: 8650, 'real-madrid': 8633, tottenham: 8586, lafc: 867280 };
async function json(url) {
  const res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': UA }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
function finished(o, out = new Map(), seen = new Set(), d = 0) {
  if (!o || typeof o !== 'object' || d > 7 || seen.has(o)) return out;
  seen.add(o);
  const t = o?.status?.utcTime;
  if (o.id != null && t && o.status?.finished && !o.status?.cancelled) out.set(String(o.id), Date.parse(t));
  for (const v of Object.values(o)) finished(v, out, seen, d + 1);
  return out;
}
function hits(root, re, max = 25) {
  const out = []; const seen = new Set();
  const walk = (o, p, d) => {
    if (out.length >= max || !o || typeof o !== 'object' || d > 9 || seen.has(o)) return;
    seen.add(o);
    for (const [k, v] of Object.entries(o)) {
      const q = `${p}.${k}`;
      if (re.test(k)) out.push(`\`${q}\` = ${JSON.stringify(v)?.slice(0, 220)}`);
      walk(v, q, d + 1);
    }
  };
  walk(root, '$', 0);
  return out;
}
const lines = ['# 평점 점검', ''];
for (const [slug, fm] of Object.entries(TEAMS)) {
  lines.push(`## ${slug}`);
  try {
    const team = await json(`https://www.fotmob.com/api/data/teams?id=${fm}&ccode3=KOR`);
    const ids = [...finished(team)].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([id]) => id);
    for (const id of ids) {
      const md = await json(`https://www.fotmob.com/api/data/matchDetails?matchId=${id}`);
      const lu = md?.content?.lineup ?? {};
      const side = [lu.homeTeam, lu.awayTeam].find((s) => String(s?.id) === String(fm));
      lines.push(`- 경기 ${id} ${md?.general?.homeTeam?.name} vs ${md?.general?.awayTeam?.name} (${md?.general?.leagueName}) · 팀 평점 칸: ${hits(side ?? {}, /rating/i, 3).join(' · ') || '없음'}`);
      for (const p of [...(side?.starters ?? []).slice(0, 3), ...(side?.subs ?? []).slice(0, 2)]) {
        lines.push(`  - ${p.name}: performance=${JSON.stringify(p.performance)?.slice(0, 260)}`);
      }
      const other = hits(md?.content?.playerStats ?? {}, /rating/i, 3);
      if (other.length) lines.push(`  - playerStats 평점 칸 예: ${other.join(' · ')}`);
    }
    const pid = team?.squad?.squad?.flatMap((g) => g?.members ?? []).find((m) => m?.role?.key !== 'coach' && m?.id)?.id;
    const any = (team?.squad?.squad ?? []).flatMap((g) => g?.members ?? []).filter((m) => m?.rating != null).slice(0, 3);
    lines.push(`- 팀 API 스쿼드 선수 rating 칸: ${any.map((m) => `${m.name}=${JSON.stringify(m.rating)}`).join(' · ') || '없음'}`);
    if (pid) {
      const pd = await json(`https://www.fotmob.com/api/data/playerData?id=${pid}`);
      lines.push(`- 선수 API(${pd?.name}) rating 칸:`, ...hits(pd, /rating/i, 15).map((x) => `  - ${x}`));
    }
  } catch (e) { lines.push(`- 실패 ${e.message}`); }
  lines.push('');
}
console.log(lines.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
