#!/usr/bin/env node
/**
 * 부상 정보 대조 점검 (2026-10-18) — **사이트·데이터 파일은 건드리지 않는다.**
 * FotMob 앱 화면과 우리 수집값이 다를 때(예: 이사크) 어느 칸이 다른지 본다:
 *   1. 팀 API 스쿼드의 injury (우리가 지금 쓰는 값)
 *   2. 선수 API(playerData) 의 injuryInformation (이름 · 마지막 갱신일)
 *   3. 다음 경기 상세(matchDetails)의 결장자(unavailable) — 앱 경기 화면의 "결장" 목록
 * 사용: node scripts/probe-injury-names.mjs
 */
import fs from 'node:fs/promises';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const TEAMS = { liverpool: 8650, 'man-united': 10260, tottenham: 8586, newcastle: 10261, chelsea: 8455, 'real-madrid': 8633, bayern: 9823, atletico: 9906, lafc: 867280 };

async function json(url) {
  const res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': UA }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
function nextMatchId(o, seen = new Set(), d = 0) {
  if (!o || typeof o !== 'object' || d > 6 || seen.has(o)) return null;
  seen.add(o);
  if (o.nextMatch?.id != null) return String(o.nextMatch.id);
  for (const v of Object.values(o)) { const f = nextMatchId(v, seen, d + 1); if (f) return f; }
  return null;
}

const lines = ['# 부상 정보 대조', ''];
for (const [slug, fm] of Object.entries(TEAMS)) {
  let team;
  try { team = await json(`https://www.fotmob.com/api/data/teams?id=${fm}&ccode3=KOR`); } catch (e) { lines.push(`- ${slug}: 팀 API 실패 ${e.message}`); continue; }
  const members = (team?.squad?.squad ?? []).flatMap((g) => g?.members ?? []).filter((m) => m?.injury);
  let unavailable = null; let mid = nextMatchId(team); let mname = '';
  if (mid) {
    try {
      const md = await json(`https://www.fotmob.com/api/data/matchDetails?matchId=${mid}`);
      const lu = md?.content?.lineup ?? {};
      const side = [lu.homeTeam, lu.awayTeam].find((s) => String(s?.id) === String(fm));
      mname = `${md?.general?.homeTeam?.name} vs ${md?.general?.awayTeam?.name} ${md?.general?.matchTimeUTCDate ?? ''}`;
      unavailable = side ? (side.unavailable ?? []) : null;
    } catch (e) { mname = `경기 상세 실패 ${e.message}`; }
  }
  lines.push(`## ${slug} — 다음 경기 ${mid ?? '?'} (${mname})`, '', '| 선수 | 팀 API injury | 선수 API 부상 · 갱신일 | 다음 경기 결장자 |', '|---|---|---|---|');
  const names = new Set(members.map((m) => m.name));
  for (const u of unavailable ?? []) if (!names.has(u.name)) members.push({ name: u.name, id: u.id, injury: null });
  for (const m of members) {
    let pdTxt = '-';
    try {
      const pd = await json(`https://www.fotmob.com/api/data/playerData?id=${m.id}`);
      const ii = pd?.injuryInformation;
      pdTxt = ii ? `${ii.name} · ${ii.expectedReturn?.expectedReturnFallback ?? ''} · ${String(ii.lastUpdated?.utcTime ?? '').slice(0, 10)}` : '없음';
    } catch (e) { pdTxt = `실패 ${e.message}`; }
    const u = (unavailable ?? []).find((x) => String(x.id) === String(m.id) || x.name === m.name);
    const uTxt = unavailable === null ? '모름' : u ? `${u.unavailability?.type ?? '?'} · ${u.unavailability?.expectedReturn ?? ''}` : '없음';
    lines.push(`| ${m.name} | ${m.injury ? `${m.injury.id} · ${m.injury.expectedReturn}` : '없음'} | ${pdTxt} | ${uTxt} |`);
  }
  lines.push('');
}
console.log(lines.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
