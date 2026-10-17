#!/usr/bin/env node
/**
 * 부상 정보 소스 비교 점검 (2026-10-17) — **사이트·데이터 파일은 건드리지 않는다.**
 *
 * 부상 선수 정보를 어디서 받을지 정하려고, 후보들을 한 회차에 같이 불러 본다.
 * 수집 서버(GitHub Actions)에서만 닿는 곳이 많아서 워크플로(injury-probe.yml)로 돌리고,
 * 결과는 작업 요약(GITHUB_STEP_SUMMARY)과 로그 · 아티팩트(JSON)로만 남긴다.
 *
 *   1. ESPN 팀 로스터     — injuries · status 칸
 *   2. ESPN 리그 부상 목록 — /soccer/{리그}/injuries
 *   3. ESPN 경기 요약     — 다음 경기 summary 의 injuries 같은 칸
 *   4. SofaScore          — 다음 경기 missing-players (비공식)
 *   5. FotMob             — 팀 API 스쿼드의 injury (비공식)
 *   6. Transfermarkt      — 부상·징계 페이지 (HTML)
 *   7. API-Football       — /injuries (키가 있을 때만: API_FOOTBALL_KEY)
 *
 * 사용: node scripts/probe-injuries.mjs [데이터 폴더=web/public/data] [결과 JSON 경로]
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const DATA = process.argv[2] ?? 'web/public/data';
const OUT = process.argv[3] ?? path.join(process.env.RUNNER_TEMP ?? '.', 'injury-probe.json');
const SITE = 'https://site.api.espn.com';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

/* 팀별 각 소스의 ID — 앱의 targets.ts 와 같은 열 팀 */
const TEAMS = [
  { slug: 'real-madrid', espn: '86', league: 'esp.1', ss: 2829, fm: 8633, tm: ['real-madrid', 418], af: 541 },
  { slug: 'chelsea', espn: '363', league: 'eng.1', ss: 38, fm: 8455, tm: ['fc-chelsea', 631], af: 49 },
  { slug: 'man-united', espn: '360', league: 'eng.1', ss: 35, fm: 10260, tm: ['manchester-united', 985], af: 33 },
  { slug: 'tottenham', espn: '367', league: 'eng.1', ss: 33, fm: 8586, tm: ['tottenham-hotspur', 148], af: 47 },
  { slug: 'newcastle', espn: '361', league: 'eng.1', ss: 39, fm: 10261, tm: ['newcastle-united', 762], af: 34 },
  { slug: 'liverpool', espn: '364', league: 'eng.1', ss: 44, fm: 8650, tm: ['fc-liverpool', 31], af: 40 },
  { slug: 'bayern', espn: '132', league: 'ger.1', ss: 2672, fm: 9823, tm: ['fc-bayern-munchen', 27], af: 157 },
  { slug: 'atletico', espn: '1068', league: 'esp.1', ss: 2836, fm: 9906, tm: ['atletico-madrid', 13], af: 530 },
  { slug: 'lafc', espn: '18966', league: 'usa.1', ss: null, fm: 867280, tm: ['los-angeles-fc', 51828], af: 1616 },
];

const clip = (v, n = 400) => {
  try { const t = typeof v === 'string' ? v : JSON.stringify(v); return t.length > n ? `${t.slice(0, n)}…` : t; } catch { return String(v); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 요청 하나 — 상태 · 걸린 시간 · 본문(JSON 또는 텍스트) */
async function hit(url, { headers = {}, text = false } = {}) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': UA, accept: text ? 'text/html' : 'application/json', ...headers },
      signal: AbortSignal.timeout(15000),
    });
    const body = await res.text();
    let json;
    if (!text) { try { json = JSON.parse(body); } catch { /* JSON 아님 */ } }
    return { ok: res.ok, status: res.status, ms: Date.now() - t0, json, body };
  } catch (e) {
    return { ok: false, status: e instanceof Error ? e.name : 'error', ms: Date.now() - t0 };
  }
}

/** 저장된 일정 파일에서 다음 경기(ESPN 경기 id · 날짜) */
async function nextEspnEvent(slug) {
  try {
    const j = JSON.parse(await fs.readFile(path.join(DATA, `schedule-${slug}.json`), 'utf8'));
    const now = Date.now();
    const ev = (j.events ?? [])
      .filter((e) => Date.parse(e.date) > now - 3 * 3600_000)
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    return ev ? { id: String(ev.id), date: ev.date, slug: ev.league?.slug ?? ev.competitions?.[0]?.league?.slug } : null;
  } catch { return null; }
}

/* ── 1·2·3 ESPN ───────────────────────────────────────── */
async function espnRoster(t) {
  const r = await hit(`${SITE}/apis/site/v2/sports/soccer/${t.league}/teams/${t.espn}/roster`);
  if (!r.json) return { status: r.status };
  const flat = [];
  for (const a of r.json.athletes ?? []) (Array.isArray(a?.items) ? flat.push(...a.items) : flat.push(a));
  const withInj = flat.filter((a) => Array.isArray(a?.injuries) && a.injuries.length);
  const statuses = {};
  for (const a of flat) {
    const st = a?.status?.name ?? a?.status?.type ?? (typeof a?.status === 'string' ? a.status : undefined);
    if (st) statuses[st] = (statuses[st] ?? 0) + 1;
  }
  return {
    status: r.status, roster: flat.length, injured: withInj.length, statuses,
    sample: withInj.slice(0, 3).map((a) => ({ name: a.displayName, injuries: clip(a.injuries, 300) })),
    fields: flat[0] ? Object.keys(flat[0]).sort() : [],
  };
}

const leagueSeen = new Map();
async function espnLeague(lg) {
  if (leagueSeen.has(lg)) return leagueSeen.get(lg);
  const r = await hit(`${SITE}/apis/site/v2/sports/soccer/${lg}/injuries`);
  const list = r.json?.injuries ?? [];
  const out = {
    status: r.status,
    teams: Array.isArray(list) ? list.length : 0,
    entries: Array.isArray(list) ? list.reduce((s, x) => s + (Array.isArray(x?.injuries) ? x.injuries.length : 0), 0) : 0,
    sample: r.json ? clip(list[0] ?? r.json, 400) : clip(r.body, 200),
  };
  leagueSeen.set(lg, out);
  return out;
}

async function espnSummary(t, ev) {
  if (!ev) return { status: '다음 경기 없음' };
  const r = await hit(`${SITE}/apis/site/v2/sports/soccer/${ev.slug ?? t.league}/summary?event=${ev.id}`);
  if (!r.json) return { status: r.status, event: ev.id };
  const keys = Object.keys(r.json);
  const inj = r.json.injuries;
  return {
    status: r.status, event: ev.id, date: ev.date,
    hasInjuries: Array.isArray(inj) && inj.some((x) => (x?.injuries ?? []).length),
    entries: Array.isArray(inj) ? inj.reduce((s, x) => s + (x?.injuries?.length ?? 0), 0) : 0,
    keys, sample: inj ? clip(inj, 400) : undefined,
  };
}

/* ── 4 SofaScore ─────────────────────────────────────── */
const SS = 'https://api.sofascore.com/api/v1';
async function sofascore(t) {
  if (!t.ss) {
    const s = await hit(`${SS}/search/teams?q=${encodeURIComponent('Los Angeles FC')}`);
    t.ss = s.json?.results?.[0]?.entity?.id ?? s.json?.teams?.[0]?.id ?? null;
    if (!t.ss) return { status: `팀 검색 ${s.status}` };
  }
  const n = await hit(`${SS}/team/${t.ss}/events/next/0`);
  const ev = n.json?.events?.[0];
  if (!ev) return { status: `다음 경기 ${n.status}`, team: t.ss };
  const m = await hit(`${SS}/event/${ev.id}/missing-players`);
  const players = m.json?.players ?? [];
  return {
    status: m.status, team: t.ss, event: ev.id,
    match: `${ev.homeTeam?.name} vs ${ev.awayTeam?.name}`,
    missing: players.length,
    types: players.reduce((o, p) => { const k = p?.type ?? p?.reason ?? '?'; o[k] = (o[k] ?? 0) + 1; return o; }, {}),
    sample: clip(players.slice(0, 3), 400),
  };
}

/* ── 5 FotMob ────────────────────────────────────────── */
async function fotmob(t) {
  /* 2026-10-17 첫 회차: /api/teams 는 404 — 주소가 /api/data/... 로 옮겨졌을 수 있어 차례로 시도 */
  let r;
  const tried = [];
  for (const u of [`https://www.fotmob.com/api/data/teams?id=${t.fm}&ccode3=KOR`, `https://www.fotmob.com/api/teams?id=${t.fm}&ccode3=KOR`]) {
    r = await hit(u);
    tried.push(`${u.replace('https://www.fotmob.com', '')} → ${r.status}`);
    if (r.json) break;
  }
  if (!r.json) return { status: r.status, tried };
  const groups = r.json?.squad?.squad ?? r.json?.squad ?? [];
  const members = [];
  for (const g of Array.isArray(groups) ? groups : []) members.push(...(g?.members ?? []));
  const injured = members.filter((m) => m?.injury || m?.injured);
  return {
    status: r.status, squad: members.length, injured: injured.length,
    sample: clip(injured.slice(0, 3).map((m) => ({ name: m.name, injury: m.injury })), 400),
  };
}

/* ── 6 Transfermarkt ─────────────────────────────────── */
async function transfermarkt(t) {
  const [slug, id] = t.tm;
  const r = await hit(`https://www.transfermarkt.com/${slug}/sperrenundverletzungen/verein/${id}`, { text: true });
  if (!r.ok) return { status: r.status };
  /* 선수 링크(…/profil/spieler/…) 이름을 대충 센다 — 구조만 보는 점검이라 정밀하지 않아도 된다 */
  const names = [...new Set([...r.body.matchAll(/href="\/[^"]+\/profil\/spieler\/\d+"[^>]*>([^<]{2,40})</g)].map((m) => m[1].trim()))];
  return { status: r.status, bytes: r.body.length, players: names.length, sample: names.slice(0, 5) };
}

/* ── 7 API-Football ──────────────────────────────────── */
const AF_KEY = process.env.API_FOOTBALL_KEY;
let afStatus = null;
async function apiFootball(t) {
  if (!AF_KEY) return { status: '키 없음 (API_FOOTBALL_KEY)' };
  const h = { 'x-apisports-key': AF_KEY };
  if (!afStatus) {
    const s = await hit('https://v3.football.api-sports.io/status', { headers: h });
    afStatus = clip(s.json?.response ?? s.json ?? s.status, 300);
  }
  const out = {};
  for (const season of [2026, 2025]) {
    const r = await hit(`https://v3.football.api-sports.io/injuries?team=${t.af}&season=${season}`, { headers: h });
    const resp = r.json?.response ?? [];
    out[season] = {
      status: r.status, results: resp.length, errors: clip(r.json?.errors, 200),
      latest: clip(resp.slice(-3).map((x) => ({ p: x.player?.name, type: x.player?.type, reason: x.player?.reason, date: x.fixture?.date })), 300),
    };
    if (resp.length) break;
  }
  return out;
}

/* ── 실행 ───────────────────────────────────────────── */
const result = { at: new Date().toISOString(), teams: {} };
for (const t of TEAMS) {
  const ev = await nextEspnEvent(t.slug);
  const row = {};
  row.espnRoster = await espnRoster(t);
  row.espnLeague = await espnLeague(t.league);
  row.espnSummary = await espnSummary(t, ev);
  row.sofascore = await sofascore(t);
  row.fotmob = await fotmob(t);
  row.transfermarkt = await transfermarkt(t);
  row.apiFootball = await apiFootball(t);
  result.teams[t.slug] = row;
  console.log(`\n=== ${t.slug}`);
  for (const [k, v] of Object.entries(row)) console.log(`  ${k}: ${clip(v, 700)}`);
  await sleep(800);
}
result.apiFootballStatus = afStatus;

await fs.writeFile(OUT, JSON.stringify(result, null, 2));
console.log(`\n결과 JSON: ${OUT}`);

/* 작업 요약 — 소스별 한눈에 */
const cell = (v) => {
  if (!v) return '–';
  const s = v.status;
  const n = v.injured ?? v.entries ?? v.missing ?? v.players ?? (v[2026]?.results ?? v[2025]?.results);
  return `${s}${n !== undefined ? ` · ${n}` : ''}`;
};
const lines = [
  '## 부상 정보 소스 점검',
  '',
  '각 칸: 응답 상태 · 부상(결장) 건수',
  '',
  '| 팀 | ESPN 로스터 | ESPN 리그 | ESPN 경기요약 | SofaScore | FotMob | Transfermarkt | API-Football |',
  '|---|---|---|---|---|---|---|---|',
  ...Object.entries(result.teams).map(([k, r]) =>
    `| ${k} | ${cell(r.espnRoster)} | ${cell(r.espnLeague)} | ${cell(r.espnSummary)} | ${cell(r.sofascore)} | ${cell(r.fotmob)} | ${cell(r.transfermarkt)} | ${cell(r.apiFootball)} |`),
  '',
  `API-Football 계정: ${afStatus ?? '키 없음'}`,
];
if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
console.log('\n' + lines.join('\n'));
