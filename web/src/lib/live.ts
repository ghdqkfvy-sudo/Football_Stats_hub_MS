import { useEffect, useState } from 'react';
import type { LiveMatch } from '../types/feedTypes';
import { FEED, fetchJson } from './feed';
import { tintOf } from '../config/crestTint';

/**
 * 오늘의 경기 파일(live-{slug}.json) — 경기 중 워크플로가 1분마다 고치고 5분마다 배포한다.
 * 앱은 경기 중 1분, 킥오프 전 2분, 그 밖에는 10분마다 다시 받는다.
 */
export function useLive(slug: string | null): LiveMatch | null {
  const [live, setLive] = useState<LiveMatch | null>(null);
  useEffect(() => {
    if (!slug) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      let next: LiveMatch | null = null;
      try { next = (await fetchJson(`${FEED}/live-${slug}.json`)) as LiveMatch; } catch { next = null; }
      if (!alive) return;
      setLive((cur) => (next && next.slug === slug ? next : cur?.slug === slug ? cur : null));
      /* 경기 중 1분 · 킥오프 전 2분 · 그 밖에는 10분(켜 둔 채 다음 경기 날이 와도 탭이 생기게) */
      const wait = next?.phase === 'live' ? 60_000 : next?.phase === 'pre' ? 120_000 : 600_000;
      timer = setTimeout(tick, wait);
    };
    tick();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [slug]);
  return live?.slug === slug ? live : null;
}

/**
 * 여러 팀의 오늘의 경기 파일을 한꺼번에 — Summary 가 쓴다.
 * 누구든 경기 중이면 1분, 킥오프 전이면 2분, 아니면 10분마다 다시 받는다.
 */
export function useLives(slugs: readonly string[]): Record<string, LiveMatch> {
  const [lives, setLives] = useState<Record<string, LiveMatch>>({});
  const key = slugs.join(',');
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const list = key ? key.split(',') : [];
    const tick = async () => {
      const got = await Promise.all(list.map((s) => fetchJson(`${FEED}/live-${s}.json`).then((j) => j as LiveMatch).catch(() => null)));
      if (!alive) return;
      const next: Record<string, LiveMatch> = {};
      got.forEach((l, i) => { if (l && l.slug === list[i]) next[list[i]] = l; });
      setLives(next);
      const any = Object.values(next);
      const wait = any.some((l) => l.phase === 'live') ? 60_000 : any.some((l) => l.phase === 'pre') ? 120_000 : 600_000;
      timer = setTimeout(tick, wait);
    };
    tick();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [key]);
  return lives;
}

/** 탭을 보여 줄 경기인가 — 킥오프 2시간 전부터 킥오프 18시간 뒤까지(경기 끝난 그날 밤까지) */
export function isTodayLive(live: LiveMatch | null, now = Date.now()): boolean {
  if (!live) return false;
  const t = Date.parse(live.kickoffUtc);
  if (!Number.isFinite(t)) return false;
  return now >= t - 2 * 3600_000 && now <= t + 18 * 3600_000;
}

/** 교체로 지금 경기장에 있는 선수 — 선발 → (나갔으면) 들어온 선수 → … (교체의 교체까지) */
export function onPitch<T extends { id: string; name: string }>(
  starter: T,
  subs: { inId: string; outId: string; in: string; out: string }[],
  bench: T[],
): { now: T; chain: T[] } {
  const chain: T[] = [];
  let cur = starter;
  for (let i = 0; i < 5; i++) {
    const s = subs.find((x) => x.outId === cur.id || (!x.outId && x.out === cur.name));
    const nxt = s && bench.find((b) => b.id === s.inId || b.name === s.in);
    if (!nxt) break;
    chain.push(cur);
    cur = nxt;
  }
  return { now: cur, chain };
}

/** 밝기 0~1 (#RRGGBB) */
const lum = (hex: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
};
/**
 * 득점 강조에 쓸 팀 색 — FotMob 팀 색 중 어두운 배경에서 보이는 것(너무 하얗거나 까만 것은 건너뜀),
 * 없으면 엠블럼 대체 색표(crestTint), 그것도 없으면 화면 강조색.
 */
export function teamColor(live: LiveMatch, k: 'home' | 'away', espnId?: string): string {
  for (const c of live.colors?.[k] ?? []) { const l = lum(c); if (l != null && l > 0.12 && l < 0.85) return c; }
  const t = espnId ? tintOf(espnId)[0] : null;
  return t && lum(t) != null && lum(t)! > 0.12 && lum(t)! < 0.85 ? t : 'var(--accent)';
}
