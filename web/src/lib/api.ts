/**
 * 데이터 접근 레이어.
 *
 * 브라우저는 ESPN 을 직접 호출하지 않는다.
 *  1) CORS 보장이 없다 (비공식 API 라 응답 헤더가 언제든 바뀐다)
 *  2) 사용자 IP 가 그대로 노출돼 차단 위험이 있다
 *  3) 클라이언트에서는 공유 캐시를 못 만들어 호출량이 사용자 수에 비례한다
 *
 * 그래서 Cloudflare Worker 프록시(`/api/v1/*`)를 거치고, 그것도 없으면
 * GitHub Actions 가 떠 둔 정적 피드(`/data/*.json`)를 읽는다.
 *
 * ⚠️ **번들 하드코딩 폴백은 없다.** 박아 둔 값은 박아 넣은 날짜에 멈추고,
 * 화면은 멀쩡해 보이면서 순위와 일정만 조용히 틀려진다. 데이터가 없으면
 * 없다고 말한다(`source: 'none'`).
 */
import type { Match, StandingTable } from './types';
import { matchesFromSchedule, goalsFromPlays, standingsFrom } from './normalize';
import { load, proxy, feed, HAS_PROXY, type Loaded, type Source } from './feed';
import type {
  AthleteInfo, Article, KoreanPlayer, Lineup, LineupEntry,
} from '../types/feedTypes';

export { HAS_PROXY };
export type { Loaded, Source };

import { SLUG_BY_TEAM_ID } from '../config/targets';

/** 스냅샷 파일 이름에 쓰는 팀 슬러그 — 타깃 정의에서 나온다 */
const TEAM_SLUG = SLUG_BY_TEAM_ID;

/* ── 일정 ───────────────────────────────────────────── */

export async function loadSchedule(teamId: string): Promise<Loaded<Match[]>> {
  const slug = TEAM_SLUG[teamId];
  return load<Match[]>({
    proxyPath: `/api/v1/schedule/${teamId}`,
    feedFile: slug ? `schedule-${slug}.json` : undefined,
    pick: (json) => matchesFromSchedule(json),
    fallback: [],
  });
}

/**
 * 종료 경기의 득점자/어시스트.
 *
 * details[] 는 경기에 따라 비어서 온다. 어시스트는 core API 의 /plays 에만
 * 확실히 존재하며 골과 별도 이벤트로 들어오므로 시계값으로 조인해야 한다.
 * 종료된 경기의 기록은 변하지 않으므로 Worker 에서 영구 캐시한다.
 */
export async function loadGoals(league: string, eventId: string): Promise<Match['goals'] | null> {
  try {
    const json = await proxy(`/api/v1/goals/${encodeURIComponent(league)}/${eventId}`);
    const goals = goalsFromPlays(json?.items);
    if (goals.length) return goals;
  } catch { /* 피드로 */ }
  return null;
}

/* ── 대회 (순위표 + 전 경기) ─────────────────────────── */

export interface LeagueData {
  table?: StandingTable;
  matches: Match[];
}

export async function loadLeague(slug: string, name: string): Promise<Loaded<LeagueData>> {
  return load<LeagueData>({
    proxyPath: `/api/v1/league/${encodeURIComponent(slug)}`,
    feedFile: `league-${slug}.json`,
    pick: (json) => ({
      matches: matchesFromSchedule(json),
      table: json?.standings ? standingsFrom(json.standings, slug, name)[0] : undefined,
    }),
    empty: (v) => !v.matches.length && !v.table,
    fallback: { matches: [] },
  });
}

/* ── 라인업 · 선수 ──────────────────────────────────── */

const minuteOf = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? parseInt(v, 10) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : undefined;
};

/** rosters[].roster[].stats 는 [{name, value}] 형태다 */
function statOf(e: any, name: string): number | undefined {
  const list = e?.stats;
  if (!Array.isArray(list)) return undefined;
  const hit = list.find((s: any) => String(s?.name) === name);
  const v = Number(hit?.value ?? hit?.displayValue);
  return Number.isFinite(v) ? v : undefined;
}

const POS_OF = (abbr: string): AthleteInfo['pos'] => {
  const a = abbr.toUpperCase();
  if (a.startsWith('G')) return 'G';
  if (a.startsWith('D') || a.includes('B') || a.startsWith('C')) return 'D';
  if (a.startsWith('F') || a.startsWith('S') || a.startsWith('W')) return 'F';
  return 'M';
};

/**
 * 라인업 정규화.
 *
 * 1순위는 site 요약(`summary?event=`)의 `rosters[]` 다. 여기에는
 * `formationPlace`·`starter` 와 **선수별 골·도움**이 athleteId 와 함께
 * 들어 있어서, 이름 매칭 없이 한 번에 집계할 수 있다.
 * core 의 competitor roster 응답(`entries[]`)도 계속 받아 준다.
 */
export function lineupFrom(
  json: any,
  teamId: string,
): { lineup: Lineup; athletes: Record<string, AthleteInfo> } | null {
  const athletes: Record<string, AthleteInfo> = {};

  const rosters: any[] = Array.isArray(json?.rosters) ? json.rosters : [];
  const mine = rosters.find((r) => String(r?.team?.id ?? r?.teamId ?? '') === teamId);
  if (mine && Array.isArray(mine.roster)) {
    const entries: LineupEntry[] = [];
    for (const e of mine.roster) {
      const id = String(e?.athlete?.id ?? e?.playerId ?? '');
      if (!id) continue;
      entries.push([
        id,
        Number(e?.formationPlace ?? 0) || 0,
        e?.starter === true,
        minuteOf(e?.subbedInAtMinute ?? e?.subbedIn?.minute),
        minuteOf(e?.subbedOutAtMinute ?? e?.subbedOut?.minute),
        statOf(e, 'totalGoals') ?? 0,
        statOf(e, 'goalAssists') ?? 0,
        // 'CD-L' · 'AM-R' 처럼 좌우까지 들어 있는 ESPN 자리 약어 — 베스트 11 배치 근거
        String(e?.position?.abbreviation ?? '') || undefined,
      ]);
      // 같은 응답에 이름·등번호·포지션이 들어 있어 따로 조회할 필요가 없다
      const name = String(e?.athlete?.displayName ?? '').trim();
      if (name) {
        athletes[id] = {
          name,
          jersey: Number(e?.jersey ?? e?.athlete?.jersey ?? 0) || 0,
          pos: POS_OF(String(e?.position?.abbreviation ?? e?.athlete?.position?.abbreviation ?? 'M')),
        };
      }
    }
    if (entries.length) {
      return {
        lineup: {
          teamId,
          formation: String(mine?.formation ?? json?.formation?.summary ?? ''),
          entries,
          hasStats: true,
        },
        athletes,
      };
    }
  }

  // core competitor roster 형태 — 골·도움은 없다
  const entries: LineupEntry[] = [];
  for (const e of json?.entries ?? []) {
    const id = String(e?.playerId ?? e?.athlete?.$ref?.match(/athletes\/(\d+)/)?.[1] ?? '');
    if (!id) continue;
    entries.push([
      id,
      Number(e?.formationPlace ?? 0) || 0,
      e?.starter === true,
      minuteOf(e?.subbedInAtMinute ?? e?.subbedIn?.minute),
      minuteOf(e?.subbedOutAtMinute ?? e?.subbedOut?.minute),
    ]);
  }
  if (!entries.length) return null;
  return {
    lineup: { teamId, formation: String(json?.formation?.summary ?? ''), entries },
    athletes,
  };
}

export interface SquadData {
  lineups: Record<string, Lineup>;
  athletes: Record<string, AthleteInfo>;
}

/**
 * 경기별 라인업 + 선수 프로필.
 * 프록시가 있으면 경기마다 직접 받고, 없으면 미리 떠 둔 `squad-{slug}.json` 을 읽는다.
 */
export async function loadSquad(
  teamId: string,
  matches: Match[],
): Promise<Loaded<SquadData>> {
  const empty = (v: SquadData) => !Object.keys(v.lineups).length;
  const fallback: SquadData = { lineups: {}, athletes: {} };

  if (HAS_PROXY) {
    const finished = matches
      .filter((m) => m.status === 'finished')
      .sort((a, b) => b.kickoffUtc.localeCompare(a.kickoffUtc))
      .slice(0, 14);

    if (finished.length) {
      const results = await Promise.allSettled(
        finished.map(async (m) => {
          /* 요약(rosters) 을 먼저 본다. 골·도움이 같이 들어 있어
             도움이 0 으로 비는 문제가 없다. 비면 core roster 로 내려간다. */
          try {
            const j = await proxy(
              `/api/v1/matchroster/${encodeURIComponent(m.competition)}/${m.id}/${teamId}`,
            );
            const r = lineupFrom(j, teamId);
            if (r) return { id: m.id, ...r };
          } catch { /* 아래로 */ }
          const j = await proxy(
            `/api/v1/lineup/${encodeURIComponent(m.competition)}/${m.id}/${teamId}`,
          );
          const r = lineupFrom(j, teamId);
          if (!r) throw new Error('no lineup');
          return { id: m.id, ...r };
        }),
      );

      const out: SquadData = { lineups: {}, athletes: {} };
      for (const r of results) {
        if (r.status !== 'fulfilled') continue;
        out.lineups[r.value.id] = r.value.lineup;
        Object.assign(out.athletes, r.value.athletes);
      }
      if (!empty(out)) {
        return { data: out, source: 'live', fetchedAt: new Date().toISOString() };
      }
    }
  }

  const slug = TEAM_SLUG[teamId];
  return load<SquadData>({
    feedFile: slug ? `squad-${slug}.json` : undefined,
    pick: (json) => ({
      lineups: (json?.lineups ?? {}) as Record<string, Lineup>,
      athletes: (json?.athletes ?? {}) as Record<string, AthleteInfo>,
    }),
    empty,
    fallback,
  });
}

/* ── 코리안리거 ──────────────────────────────────────── */

export async function loadKoreans(): Promise<Loaded<KoreanPlayer[]>> {
  return load<KoreanPlayer[]>({
    feedFile: 'koreans.json',
    pick: (json) => (Array.isArray(json?.players) ? (json.players as KoreanPlayer[]) : []),
    fallback: [],
  });
}

/* ── 뉴스 ────────────────────────────────────────────── */

function articlesFrom(json: any): Article[] {
  const list: any[] = Array.isArray(json?.articles) ? json.articles : [];
  return list
    .map((x): Article | null => {
      const href = String(x?.links?.web?.href ?? x?.href ?? '');
      const headline = String(x?.headline ?? '').trim();
      if (!href || !headline) return null;
      const img = Array.isArray(x?.images) ? x.images[0] : undefined;
      return {
        id: href,
        headline,
        description: String(x?.description ?? '').trim(),
        published: String(x?.published ?? x?.lastModified ?? ''),
        type: String(x?.type ?? 'Story'),
        byline: x?.byline ? String(x.byline) : undefined,
        href,
        image: img?.url ? String(img.url) : x?.image ? String(x.image) : undefined,
        source: x?.source === 'ko' ? 'ko' : 'espn',
        publisher: x?.publisher ? String(x.publisher) : undefined,
      };
    })
    .filter((x): x is Article => !!x);
}

const dedupe = (rows: Article[]): Article[] => {
  const seen = new Set<string>();
  const out = rows.filter((x) => (seen.has(x.href) ? false : (seen.add(x.href), true)));
  out.sort((a, b) => b.published.localeCompare(a.published));
  return out;
};

/**
 * 팀 뉴스 — ESPN 영문 피드와 한국어 구글 뉴스를 합친다.
 * 한쪽이 실패해도 나머지는 그대로 보여 준다. 뉴스는 전부-아니면-전무가
 * 아니어도 쓸모가 있다.
 */
export async function loadNews(
  league: string,
  teamId: string,
  koQuery?: string,
): Promise<Loaded<Article[]>> {
  if (HAS_PROXY) {
    const [en, ko] = await Promise.allSettled([
      proxy(`/api/v1/news/${encodeURIComponent(league)}?team=${encodeURIComponent(teamId)}`),
      koQuery ? proxy(`/api/v1/newsko?q=${encodeURIComponent(koQuery)}`) : Promise.reject(),
    ]);
    const merged = dedupe([
      ...(en.status === 'fulfilled' ? articlesFrom(en.value) : []),
      ...(ko.status === 'fulfilled' ? articlesFrom(ko.value) : []),
    ]);
    if (merged.length) {
      return { data: merged, source: 'live', fetchedAt: new Date().toISOString() };
    }
  }

  const slug = TEAM_SLUG[teamId];
  return load<Article[]>({
    feedFile: slug ? `news-${slug}.json` : undefined,
    pick: (json) => dedupe(articlesFrom(json)),
    fallback: [],
  });
}

/* ── Future Resources (임대·바이백·셀온) ───────────────── */

export interface FutureStat {
  club?: string;
  apps: number;
  goals: number;
  assists: number;
  recent: { date: string; opponent: string; score?: string; goals: number; assists: number }[];
}

/** gamelog 응답은 라벨 배열 + 경기별 값 배열이라 이름으로 인덱스를 찾아야 한다 */
function gamelogStats(j: any): FutureStat | null {
  const names: string[] = (j?.names ?? j?.labels ?? []).map((x: any) => String(x));
  const idx = (want: string[]) => names.findIndex((n) => want.includes(n));
  const iG = idx(['totalGoals', 'goals', 'G']);
  const iA = idx(['goalAssists', 'assists', 'A']);

  const events: Record<string, any> = j?.events ?? {};
  const rows: FutureStat['recent'] = [];
  let goals = 0, assists = 0, apps = 0;

  for (const season of j?.seasonTypes ?? []) {
    for (const cat of season?.categories ?? []) {
      for (const ev of cat?.events ?? []) {
        const stats: string[] = ev?.stats ?? [];
        const g = Number(stats[iG] ?? 0) || 0;
        const a = Number(stats[iA] ?? 0) || 0;
        const meta = events[String(ev?.eventId ?? '')] ?? {};
        apps += 1;
        goals += g;
        assists += a;
        rows.push({
          date: String(meta?.gameDate ?? ''),
          opponent: String(meta?.opponent?.displayName ?? meta?.opponent?.abbreviation ?? ''),
          score: meta?.score ? String(meta.score) : undefined,
          goals: g,
          assists: a,
        });
      }
    }
  }
  if (!apps) return null;
  rows.sort((x, y) => y.date.localeCompare(x.date));
  return {
    club: j?.team?.displayName ? String(j.team.displayName) : undefined,
    apps, goals, assists,
    recent: rows.slice(0, 3),
  };
}

/**
 * 조항 선수 한 명의 현재 기록.
 * 조항 자체(바이백·셀온)는 어떤 API 에도 없어 큐레이션 파일에서 오고,
 * "지금 어디서 어떻게 하고 있는지" 만 여기서 붙인다.
 */
export async function loadFutureStat(league: string, athleteId: string): Promise<FutureStat | null> {
  try {
    return gamelogStats(await proxy(`/api/v1/gamelog/${encodeURIComponent(league)}/${athleteId}`));
  } catch { /* 피드로 */ }
  try {
    const j = await feed('future.json');
    const hit = (j?.players ?? {})[athleteId];
    return hit ? (hit as FutureStat) : null;
  } catch {
    return null;
  }
}
