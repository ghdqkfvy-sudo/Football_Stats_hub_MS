/**
 * 데이터 진입점 — 앱이 값을 얻는 유일한 경로.
 *
 * 원칙: **번들에 경기 데이터를 박아 두지 않는다.**
 * 하드코딩된 값은 박아 넣은 날짜에 영원히 멈춘다. 순위가 라운드 3 에서
 * 안 움직이고, "다음 경기" 가 이미 끝난 경기를 가리키는 사고가 실제로 났다.
 *
 * 두 갈래만 있다.
 *
 *   1) Worker 프록시 (`VITE_API_BASE`)
 *      지금 이 순간의 ESPN. 경기 중에는 이 경로가 필요하다.
 *
 *   2) 정적 피드 (`/data/*.json`)
 *      GitHub Actions 가 `scripts/snapshot.mjs` 로 떠서 커밋하고
 *      Cloudflare Pages 가 CDN 으로 서빙한다. 팀 일정은 10분,
 *      리그·스쿼드·뉴스는 1시간 주기.
 *
 * 둘 다 없으면 데이터가 없는 것이다. 예전 값을 대신 보여 주지 않는다 —
 * 틀린 값을 조용히 보여 주는 쪽이 비어 있는 화면보다 훨씬 나쁘다.
 */

export type Source = 'live' | 'feed' | 'none';

export interface Loaded<T> {
  data: T;
  source: Source;
  /** 이 데이터가 언제 것인지 (ISO). 화면에 그대로 노출한다. */
  fetchedAt: string;
  error?: string;
}

const BASE = String(import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '');
export const HAS_PROXY = BASE.length > 0;

const FEED = `${import.meta.env.BASE_URL ?? '/'}data`.replace(/([^:])\/{2,}/g, '$1/');

const TIMEOUT_MS = 9000;

async function fetchJson(url: string): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** 프록시 호출. 프록시가 설정돼 있지 않으면 곧장 실패한다. */
export async function proxy(path: string): Promise<any> {
  if (!HAS_PROXY) throw new Error('no-proxy');
  return fetchJson(`${BASE}${path}`);
}

const feedCache = new Map<string, Promise<any>>();

/**
 * 단일 파일 프리뷰 빌드에만 존재하는 인라인 피드.
 * `npm run snapshot` 이 떠 온 JSON 을 빌드 시점에 넣어 둔 것이라
 * 손으로 적은 값이 아니고, 화면에는 언제 뜬 것인지가 함께 표시된다.
 * 일반 빌드에서는 비어 있다.
 */
declare const __INLINE_FEED__: Record<string, any> | undefined;
const INLINE: Record<string, any> =
  typeof __INLINE_FEED__ === 'undefined' ? {} : (__INLINE_FEED__ ?? {});

/** 정적 피드 파일. 같은 파일을 여러 탭이 동시에 찾아도 한 번만 받는다. */
export function feed(name: string): Promise<any> {
  const hit = feedCache.get(name);
  if (hit) return hit;
  const p = fetchJson(`${FEED}/${name}`).catch((e) => {
    if (INLINE[name]) return INLINE[name];
    throw e;
  });
  feedCache.set(name, p);
  p.catch(() => feedCache.delete(name));
  return p;
}

let metaAt: Promise<string> | null = null;

/** 정적 피드가 언제 떠진 것인지 */
export function feedTime(): Promise<string> {
  if (!metaAt) {
    metaAt = feed('meta.json')
      .then((j) => String(j?.generatedAt ?? ''))
      .catch(() => '');
  }
  return metaAt;
}

/**
 * 프록시 → 정적 피드 순으로 시도한다.
 * `pick` 은 응답에서 쓸 값을 꺼내고, 값이 비면 던져서 다음 단계로 넘긴다.
 */
export async function load<T>(
  opts: {
    proxyPath?: string;
    feedFile?: string;
    pick: (json: any) => T;
    /** 값이 "비었는지" 판정 — 비면 다음 단계로 넘어간다 */
    empty?: (value: T) => boolean;
    fallback: T;
  },
): Promise<Loaded<T>> {
  const isEmpty = opts.empty ?? ((v: T) => Array.isArray(v) && v.length === 0);
  let firstError = '';

  if (opts.proxyPath) {
    try {
      const v = opts.pick(await proxy(opts.proxyPath));
      if (!isEmpty(v)) return { data: v, source: 'live', fetchedAt: new Date().toISOString() };
    } catch (e) {
      firstError = e instanceof Error ? e.message : String(e);
    }
  }

  if (opts.feedFile) {
    try {
      const json = await feed(opts.feedFile);
      const v = opts.pick(json);
      if (!isEmpty(v)) {
        return {
          data: v,
          source: 'feed',
          fetchedAt: String(json?.fetchedAt ?? '') || (await feedTime()),
        };
      }
    } catch (e) {
      if (!firstError) firstError = e instanceof Error ? e.message : String(e);
    }
  }

  return { data: opts.fallback, source: 'none', fetchedAt: '', error: firstError || 'empty' };
}
