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

/* ── 코리안리거 · Future — 선수 API(playerData) 로 (2026-10-18 점검 3) ──
   위키데이터에는 FotMob ID 가 없어서 FotMob 검색(search/suggest)으로 찾고 소속팀으로 확인한다.
   44명 중 41명이 소속팀 이름으로 맞았고, 손흥민은 "LAFC" ↔ "Los Angeles FC" 라 이름만 맞았다. */

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** 검색어 — ESPN 이름, 두 단어면 순서를 바꾼 것(한국 이름: FotMob 은 "Heung-Min Son") */
export function searchTerms(name) {
  const t = [String(name ?? '').trim()].filter(Boolean);
  const w = t[0]?.split(' ') ?? [];
  if (w.length === 2) t.push(`${w[1]} ${w[0]}`);
  return t;
}

const sameClub = (a, b) => {
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  if (Math.min(x.length, y.length) >= 4 && (x.includes(y) || y.includes(x))) return true;
  const yw = new Set(y.split(' '));
  return x.split(' ').some((w) => w.length > 3 && yw.has(w));
};

/**
 * 검색 결과에서 그 선수 — 1) 소속팀이 맞는 후보, 2) 없으면 이름이 똑같은(순서 무관) 후보가 **하나뿐**일 때만.
 * 동명이인을 지어내지 않는다.
 */
export function pickSearchPlayer(groups, name, club) {
  const cands = (Array.isArray(groups) ? groups : []).flatMap((g) => g?.suggestions ?? []).filter((s) => s?.type === 'player' && s?.id);
  const uniq = [...new Map(cands.map((c) => [String(c.id), c])).values()];
  const byClub = uniq.find((c) => sameClub(c.teamName, club));
  if (byClub) return String(byClub.id);
  const key = (s) => norm(s).split(' ').sort().join(' ');
  const exact = uniq.filter((c) => key(c.name) === key(name));
  return exact.length === 1 ? String(exact[0].id) : null;
}

/** 선수 API → 경기별 평점 [{ utc(ms), rating }] (평점 0 = 평점 없는 경기는 뺀다) */
export function recentRatings(pd) {
  return (pd?.recentMatches ?? [])
    .map((m) => ({ utc: Date.parse(m?.matchDate?.utcTime ?? ''), rating: num(m?.ratingProps?.rating) }))
    .filter((m) => Number.isFinite(m.utc) && m.rating)
    .map((m) => ({ ...m, rating: Math.round(m.rating * 10) / 10 }));
}

/**
 * 선수 API → 시즌 평균 평점.
 * 1) 주 리그 통계(mainLeague.stats) 에 평점 칸이 있으면 그 값
 * 2) 없으면 이번 시즌(seasonStart 이후) 경기 평점 평균 — 3경기 이상일 때만
 */
export function seasonRating(pd, seasonStart) {
  for (const s of pd?.mainLeague?.stats ?? []) {
    const label = `${s?.title ?? ''} ${s?.localizedTitleId ?? ''} ${s?.key ?? ''}`;
    const v = num(s?.value);
    if (/rating/i.test(label) && v && v <= 10) return Math.round(v * 100) / 100;
  }
  const xs = recentRatings(pd).filter((m) => m.utc >= seasonStart).map((m) => m.rating);
  return xs.length >= 3 ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null;
}

/** ESPN 경기 날짜 → 그 경기 평점 (킥오프 3시간 안쪽) */
export function ratingAt(date, rows, tolMs = 3 * 3600_000) {
  const t = Date.parse(date ?? '');
  if (!Number.isFinite(t)) return null;
  let best = null;
  for (const r of rows ?? []) {
    const d = Math.abs(r.utc - t);
    if (d <= tolMs && (!best || d < best.d)) best = { r: r.rating, d };
  }
  return best?.r ?? null;
}
