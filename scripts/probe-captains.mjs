#!/usr/bin/env node
/**
 * 주장·부주장 정보 소스 점검 (2026-10-17) — **사이트·데이터 파일은 건드리지 않는다.**
 *
 * 팀마다 아래를 불러서 captain / armband / vice 같은 칸이 있는지, 있으면 누가 찍히는지 본다.
 *   1. FotMob 팀 API          — 스쿼드·개요 어딘가에 주장 칸이 있는지
 *   2. FotMob 최근 경기 상세   — 라인업 선수 칸의 주장 표시 (최근 끝난 경기 6개)
 *   3. ESPN 팀 로스터          — 주장 칸이 있는지
 *   4. ESPN 최근 경기 요약     — rosters 선수 칸의 주장 표시
 *   5. SofaScore 최근 경기     — lineups 선수 칸의 captain (비공식, 최근 끝난 경기 6개)
 * 결과는 작업 요약(GITHUB_STEP_SUMMARY)과 로그 · 아티팩트(JSON)로만 남긴다.
 *
 * 사용: node scripts/probe-captains.mjs [결과 JSON 경로]
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const OUT = process.argv[2] ?? path.join(process.env.RUNNER_TEMP ?? '.', 'captain-probe.json');
const SITE = 'https://site.api.espn.com';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const TEAMS = [
  { slug: 'real-madrid', ss: 2829, espn: '86', league: 'esp.1', fm: 8633 },
  { slug: 'chelsea', ss: 38, espn: '363', league: 'eng.1', fm: 8455 },
  { slug: 'man-united', ss: 35, espn: '360', league: 'eng.1', fm: 10260 },
  { slug: 'tottenham', ss: 33, espn: '367', league: 'eng.1', fm: 8586 },
  { slug: 'newcastle', ss: 39, espn: '361', league: 'eng.1', fm: 10261 },
  { slug: 'liverpool', ss: 44, espn: '364', league: 'eng.1', fm: 8650 },
  { slug: 'bayern', ss: 2672, espn: '132', league: 'ger.1', fm: 9823 },
  { slug: 'atletico', ss: 2836, espn: '1068', league: 'esp.1', fm: 9906 },
  { slug: 'lafc', ss: null, espn: '18966', league: 'usa.1', fm: 867280 },
];
const KEY = /capt|armband|vice/i;

async function json(url) {
  const res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': UA }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** 이름이 KEY 에 걸리는 칸(또는 값이 'captain' 류 문자열)의 경로·값 */
function hits(root, max = 15) {
  const out = [];
  const seen = new Set();
  const walk = (o, p, d) => {
    if (out.length >= max || !o || typeof o !== 'object' || d > 12 || seen.has(o)) return;
    seen.add(o);
    for (const [k, v] of Object.entries(o)) {
      const q = `${p}.${k}`;
      if (KEY.test(k)) out.push({ path: q, value: typeof v === 'object' ? JSON.stringify(v)?.slice(0, 120) : v });
      else if (typeof v === 'string' && KEY.test(v) && v.length < 60) out.push({ path: q, value: v });
      walk(v, q, d + 1);
    }
  };
  walk(root, '$', 0);
  return out;
}

function finishedMatchIds(teamJson, n = 6) {
  const out = new Map();
  const seen = new Set();
  const walk = (o, d) => {
    if (!o || typeof o !== 'object' || d > 7 || seen.has(o)) return;
    seen.add(o);
    const t = o?.status?.utcTime ?? null;
    if (o.id != null && t && o.status?.finished && !o.status?.cancelled) out.set(String(o.id), Date.parse(t));
    for (const v of Object.values(o)) walk(v, d + 1);
  };
  walk(teamJson, 0);
  return [...out].sort((a, b) => b[1] - a[1]).slice(0, n).map(([id]) => id);
}

/** 선수 객체에서 주장 표시가 참인 칸 이름 */
const capFlag = (pl) => Object.entries(pl ?? {}).filter(([k, v]) => KEY.test(k) && v && v !== 'false').map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`);

async function fotmob(t) {
  const r = { team: {}, matches: [] };
  let tj;
  try {
    tj = await json(`https://www.fotmob.com/api/data/teams?id=${t.fm}&ccode3=KOR`);
    r.team = { ok: true, hits: hits(tj) };
  } catch (e) { r.team = { ok: false, error: String(e.message) }; return r; }
  for (const id of finishedMatchIds(tj)) {
    try {
      const md = await json(`https://www.fotmob.com/api/data/matchDetails?matchId=${id}`);
      const lu = md?.content?.lineup ?? {};
      const side = [lu.homeTeam, lu.awayTeam].find((s) => String(s?.id) === String(t.fm));
      const players = [...(side?.starters ?? []), ...(side?.subs ?? [])];
      const flagged = players.map((p) => ({ name: p.name, flags: capFlag(p) })).filter((p) => p.flags.length);
      const sideHits = side ? hits(Object.fromEntries(Object.entries(side).filter(([k]) => k !== 'starters' && k !== 'subs'))) : [];
      r.matches.push({
        id,
        when: md?.general?.matchTimeUTCDate ?? null,
        league: md?.general?.leagueName ?? null,
        side: !!side,
        starterKeys: side?.starters?.[0] ? Object.keys(side.starters[0]) : [],
        flagged,
        sideHits,
        anyHits: flagged.length || sideHits.length ? [] : hits(md, 8),
      });
    } catch (e) { r.matches.push({ id, error: String(e.message) }); }
  }
  return r;
}

async function espn(t) {
  const r = {};
  try { r.roster = { ok: true, hits: hits(await json(`${SITE}/apis/site/v2/sports/soccer/${t.league}/teams/${t.espn}/roster`)) }; }
  catch (e) { r.roster = { ok: false, error: String(e.message) }; }
  try {
    const sc = await json(`${SITE}/apis/site/v2/sports/soccer/${t.league}/teams/${t.espn}/schedule`);
    const done = (sc.events ?? []).filter((e) => e.competitions?.[0]?.status?.type?.completed).sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
    const ev = done[0];
    if (!ev) { r.summary = { ok: false, error: '끝난 경기 없음' }; return r; }
    const sm = await json(`${SITE}/apis/site/v2/sports/soccer/${t.league}/summary?event=${ev.id}`);
    const ours = (sm.rosters ?? []).find((x) => String(x.team?.id) === t.espn);
    const flagged = (ours?.roster ?? []).map((p) => ({ name: p.athlete?.displayName, flags: capFlag(p) })).filter((p) => p.flags.length);
    r.summary = { ok: true, event: ev.id, date: ev.date, rosterKeys: ours?.roster?.[0] ? Object.keys(ours.roster[0]) : [], flagged, hits: hits(sm, 8) };
  } catch (e) { r.summary = { ok: false, error: String(e.message) }; }
  return r;
}

const SS = 'https://api.sofascore.com/api/v1';
async function sofascore(t) {
  const r = { matches: [] };
  try {
    if (!t.ss) {
      const s = await json(`${SS}/search/teams?q=${encodeURIComponent('Los Angeles FC')}`);
      t.ss = s?.results?.[0]?.entity?.id ?? null;
      if (!t.ss) return { error: '팀 검색 실패' };
    }
    const last = await json(`${SS}/team/${t.ss}/events/last/0`);
    const evs = (last.events ?? []).filter((e) => e.status?.type === 'finished').sort((a, b) => b.startTimestamp - a.startTimestamp).slice(0, 6);
    for (const ev of evs) {
      try {
        const lu = await json(`${SS}/event/${ev.id}/lineups`);
        const side = ev.homeTeam?.id === t.ss ? lu.home : lu.away;
        const players = side?.players ?? [];
        r.matches.push({
          id: ev.id, when: new Date(ev.startTimestamp * 1000).toISOString(), league: ev.tournament?.name,
          playerKeys: players[0] ? Object.keys(players[0]) : [],
          flagged: players.map((p) => ({ name: p.player?.name, flags: capFlag(p) })).filter((p) => p.flags.length),
          hits: hits(lu, 6),
        });
      } catch (e) { r.matches.push({ id: ev.id, error: String(e.message) }); }
    }
  } catch (e) { r.error = String(e.message); }
  return r;
}

const results = [];
for (const t of TEAMS) {
  const [fm, es, ss] = await Promise.all([fotmob(t), espn(t), sofascore(t)]);
  results.push({ slug: t.slug, fotmob: fm, espn: es, sofascore: ss });
  console.log(`\n=== ${t.slug} ===`);
  console.log('FotMob 팀 API:', JSON.stringify(fm.team));
  for (const m of fm.matches) console.log(' FotMob 경기', JSON.stringify(m));
  console.log('ESPN:', JSON.stringify(es));
  console.log('SofaScore:', JSON.stringify(ss));
}

/* 팀별 요약: 경기마다 주장 표시된 선수 */
const lines = ['# 주장·부주장 소스 점검', '', '| 팀 | FotMob 팀 API 칸 | FotMob 최근 경기 주장 (최신→과거) | ESPN 로스터 칸 | ESPN 최근 경기 | SofaScore 최근 경기 주장 |', '|---|---|---|---|---|---|'];
for (const r of results) {
  const fmTeam = r.fotmob.team.ok ? (r.fotmob.team.hits.map((h) => h.path.split('.').slice(-1)[0]).join(', ') || '없음') : `실패 ${r.fotmob.team.error}`;
  const fmMatches = r.fotmob.matches.map((m) => m.error ? '오류' : (m.flagged.map((p) => `${p.name}(${p.flags.join('/')})`).join('+') || (m.side ? '표시 없음' : '팀 못 찾음'))).join(' → ') || '-';
  const esR = r.espn.roster?.ok ? (r.espn.roster.hits.map((h) => h.path.split('.').slice(-1)[0]).join(', ') || '없음') : '실패';
  const esS = r.espn.summary?.ok ? (r.espn.summary.flagged.map((p) => `${p.name}(${p.flags.join('/')})`).join('+') || '표시 없음') : `실패 ${r.espn.summary?.error ?? ''}`;
  const ssM = r.sofascore.error ? `실패 ${r.sofascore.error}` : (r.sofascore.matches.map((m) => m.error ? `오류 ${m.error}` : (m.flagged.map((p) => `${p.name}(${p.flags.join('/')})`).join('+') || '표시 없음')).join(' → ') || '-');
  lines.push(`| ${r.slug} | ${fmTeam} | ${fmMatches} | ${esR} | ${esS} | ${ssM} |`);
}
const ex = results.flatMap((r) => r.fotmob.matches).find((m) => m.starterKeys?.length);
if (ex) lines.push('', `FotMob 라인업 선수 칸 예시: \`${ex.starterKeys.join(', ')}\``);
const ee = results.map((r) => r.espn.summary).find((s) => s?.rosterKeys?.length);
if (ee) lines.push('', `ESPN rosters 선수 칸 예시: \`${ee.rosterKeys.join(', ')}\``);
const se = results.flatMap((r) => r.sofascore.matches ?? []).find((m) => m.playerKeys?.length);
if (se) lines.push('', `SofaScore lineups 선수 칸 예시: \`${se.playerKeys.join(', ')}\``);
console.log('\n' + lines.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
await fs.writeFile(OUT, JSON.stringify(results, null, 2));
