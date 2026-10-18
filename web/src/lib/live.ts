import { useEffect, useState } from 'react';
import type { LiveMatch } from '../types/feedTypes';
import { FEED, fetchJson } from './feed';

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
