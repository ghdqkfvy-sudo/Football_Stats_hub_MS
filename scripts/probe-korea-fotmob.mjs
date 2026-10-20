#!/usr/bin/env node
/**
 * 점검 — 대한민국 대표팀의 FotMob 팀 id 와 경기 상세 라인업 (2026-10-20). **로그만 남긴다.**
 *
 * 오늘의 경기(라이브)에 대표팀을 넣으려면 FotMob 팀 id 가 필요하다(scripts/lib/live.mjs LIVE_TEAMS).
 *  1. search/suggest 로 "South Korea" · "Korea Republic" 팀 후보
 *  2. 후보마다 팀 API — 이름 · 나라 · 최근/다음 경기
 *  3. 가장 최근 끝난 경기의 matchDetails — 라인업(선발 · 좌표 · 평점)이 있는지
 */
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
async function json(url) {
  const res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': UA }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const ids = new Map();
for (const term of ['South Korea', 'Korea Republic', 'Korea']) {
  try {
    const s = await json(`https://www.fotmob.com/api/data/search/suggest?term=${encodeURIComponent(term)}&lang=en`);
    const walk = (o, d = 0) => {
      if (!o || typeof o !== 'object' || d > 6) return;
      if (Array.isArray(o)) { o.forEach((x) => walk(x, d + 1)); return; }
      if ((o.type === 'team' || o.teamId || o.isNational != null) && (o.id || o.teamId)) {
        const id = String(o.id ?? o.teamId);
        if (!ids.has(id)) ids.set(id, o);
      }
      Object.values(o).forEach((v) => walk(v, d + 1));
    };
    walk(s);
  } catch (e) { console.log(`검색 ${term}: ${e.message}`); }
}
console.log('팀 후보:', [...ids].map(([id, o]) => `${id} ${o.name ?? o.title ?? ''} ${o.countryCode ?? o.ccode ?? ''}`).join(' | '));

for (const [id, o] of ids) {
  if (!/korea/i.test(String(o.name ?? o.title ?? ''))) continue;
  try {
    const t = await json(`https://www.fotmob.com/api/data/teams?id=${id}&ccode3=KOR`);
    const det = t?.details ?? {};
    const fx = t?.fixtures?.allFixtures?.fixtures ?? [];
    const done = fx.filter((f) => f?.status?.finished).slice(-3);
    const next = fx.filter((f) => !f?.status?.finished).slice(0, 3);
    console.log(`\n=== ${id} ${det.name ?? o.name} · country=${det.country ?? ''} · 대표팀? ${det.isNationalTeam ?? det.type ?? ''}`);
    for (const f of [...done, ...next]) console.log(`  ${f.id} ${f.status?.utcTime} ${f.home?.name} ${f.status?.scoreStr ?? ''} ${f.away?.name} (${f.tournament?.name ?? ''}) ${f.status?.finished ? '끝' : ''}`);
    const last = done[done.length - 1];
    if (last) {
      const md = await json(`https://www.fotmob.com/api/data/matchDetails?matchId=${last.id}`);
      const lu = md?.content?.lineup ?? {};
      for (const k of ['homeTeam', 'awayTeam']) {
        const s = lu[k] ?? {};
        const st = s.starters ?? [];
        console.log(`  라인업 ${k}: ${s.name} ${s.formation ?? ''} 선발 ${st.length} · 좌표 ${st.filter((p) => p.verticalLayout).length} · 평점 ${st.filter((p) => p.performance?.rating).length} · 교체 ${(s.subs ?? []).length}`);
      }
      console.log(`  경기장: ${md?.content?.matchFacts?.infoBox?.Stadium?.name ?? '(없음)'}`);
    }
  } catch (e) { console.log(`팀 ${id}: ${e.message}`); }
}
