/**
 * FotMob 평점 (2026-10-18 점검: scripts/probe-ratings.mjs).
 *
 *  · 시즌 평균 — 팀 API 스쿼드의 선수마다 `rating` (부상 정보와 같은 응답이라 요청이 늘지 않는다)
 *  · 경기별   — 경기 상세(matchDetails) 라인업의 `performance.rating` (선발 · 교체 모두)
 *
 * ESPN 경기와 FotMob 경기는 킥오프 시각으로 짝짓는다. 네트워크 없이 도는 순수 함수만 둔다.
 */

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** 팀 API → 평점이 있는 선수 [{ name, id, rating }] (감독 제외) */
export function squadRatings(json) {
  const groups = json?.squad?.squad ?? json?.squad ?? [];
  const out = [];
  for (const g of Array.isArray(groups) ? groups : []) {
    if (/coach/i.test(String(g?.title ?? ''))) continue;
    for (const m of g?.members ?? []) {
      const r = num(m?.rating);
      if (r && m?.name) out.push({ name: m.name, id: m.id, rating: Math.round(r * 100) / 100 });
    }
  }
  return out;
}

/** 팀 API → 끝난 경기 [{ id, utc(ms) }] */
export function finishedFixtures(json) {
  const out = new Map();
  const seen = new Set();
  const walk = (o, d) => {
    if (!o || typeof o !== 'object' || d > 7 || seen.has(o)) return;
    seen.add(o);
    const t = Date.parse(o?.status?.utcTime ?? '');
    if (o.id != null && Number.isFinite(t) && o.status?.finished && !o.status?.cancelled) out.set(String(o.id), t);
    for (const v of Object.values(o)) walk(v, d + 1);
  };
  walk(json, 0);
  return [...out].map(([id, utc]) => ({ id, utc }));
}

/** ESPN 경기 시각 → 같은 경기의 FotMob id (킥오프 3시간 안쪽에서 가장 가까운 것) */
export function pairFixture(espnDate, fixtures, tolMs = 3 * 3600_000) {
  const t = Date.parse(espnDate ?? '');
  if (!Number.isFinite(t)) return null;
  let best = null;
  for (const f of fixtures ?? []) {
    const d = Math.abs(f.utc - t);
    if (d <= tolMs && (!best || d < best.d)) best = { id: f.id, d };
  }
  return best?.id ?? null;
}

/** 경기 상세 → 우리 팀(fm) 선수들의 그 경기 평점 [{ name, id, rating }] — 팀을 못 가리면 빈 배열 */
export function lineupRatings(details, fm) {
  const lu = details?.content?.lineup ?? details?.lineup;
  const side = [lu?.homeTeam, lu?.awayTeam].find((s) => s && String(s.id) === String(fm));
  if (!side) return [];
  return [...(side.starters ?? []), ...(side.subs ?? [])]
    .map((p) => ({ name: p?.name, id: p?.id, rating: num(p?.performance?.rating) }))
    .filter((p) => p.name && p.rating)
    .map((p) => ({ ...p, rating: Math.round(p.rating * 10) / 10 }));
}
