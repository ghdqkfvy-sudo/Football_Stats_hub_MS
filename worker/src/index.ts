/**
 * MS Stats Hub — Cloudflare Worker 프록시
 *
 * 역할
 *  1) 브라우저와 ESPN 사이에 서서 CORS를 보장한다.
 *  2) 계층별 TTL로 캐싱해 ESPN 실호출을 최소화한다(차단 위험·지연 감소).
 *  3) 여러 업스트림 호출을 하나의 응답으로 합쳐 클라이언트 왕복을 줄인다.
 *
 * 무료 플랜 기준 10만 요청/일. 정적 스냅샷(Pages)이 기본 경로이고
 * 이 Worker는 경기 중 실시간 갱신과 온디맨드 상세 조회를 맡는다.
 */

const SITE = 'https://site.api.espn.com';
const SITE_WEB = 'https://site.web.api.espn.com';
const CORE = 'https://sports.core.api.espn.com';

/** 응답 성격별 캐시 수명(초) */
const TTL = {
  live: 30,          // 진행 중 경기
  schedule: 600,     // 일정
  standings: 600,    // 순위
  season: 21600,     // 선수 시즌 스탯 (6시간)
  immutable: 604800, // 종료 경기의 득점 기록 — 변하지 않음 (7일)
} as const;

/** 유럽 시즌은 8월 시작 — ESPN 의 season 파라미터와 같은 규칙 */
const seasonYear = (d = new Date()) =>
  (d.getUTCMonth() + 1 >= 8 ? d.getUTCFullYear() : d.getUTCFullYear() - 1);

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-max-age': '86400',
};

const json = (data: unknown, ttl: number) =>
  new Response(JSON.stringify(data), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `public, max-age=${Math.min(ttl, 60)}, s-maxage=${ttl}`,
      ...CORS,
    },
  });

const fail = (status: number, message: string) =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...CORS },
  });

/**
 * ESPN 호출. site.api 가 간헐적으로 권한 오류를 내는 사례가 보고돼 있어
 * site.web.api 로 자동 폴백한다.
 */
async function espn(url: string): Promise<any> {
  const attempt = async (u: string) => {
    const res = await fetch(u, {
      headers: { accept: 'application/json', 'user-agent': 'k-stats-hub/1.0' },
      cf: { cacheTtl: 60, cacheEverything: true },
    });
    if (!res.ok) throw new Error(`${res.status} ${u}`);
    return res.json();
  };
  try {
    return await attempt(url);
  } catch (e) {
    if (url.startsWith(SITE)) return attempt(url.replace(SITE, SITE_WEB));
    throw e;
  }
}

/**
 * 대회 단위 묶음: 참가팀 명단 + 모든 팀의 경기 + ESPN 순위표.
 *
 * ESPN standings 가 시즌 초반에 몇 라운드씩 뒤처지므로(챔스 2026-27은
 * 1차전 후에도 전원 0경기) 클라이언트가 경기 결과로 표를 다시 만들 수 있게
 * 리그의 모든 경기를 함께 내려준다. 홈/원정 아코디언도 이 데이터로 그린다.
 *
 * ⚠️ 무료 플랜의 서브리퀘스트 한도는 호출당 50건이다. 그래서 팀별로
 *    'schedule' 한 번만 부른다(예정 경기는 일정 탭의 팀 스케줄에서 이미 온다).
 *    36팀 대회 기준 36 + 2 = 38건으로 한도 안에 들어간다.
 */
async function league(slug: string) {
  const [teamsRes, standings] = await Promise.allSettled([
    espn(`${SITE}/apis/site/v2/sports/soccer/${slug}/teams`),
    espn(`${SITE}/apis/v2/sports/soccer/${slug}/standings`),
  ]);

  const teams: any[] =
    teamsRes.status === 'fulfilled'
      ? (teamsRes.value?.sports?.[0]?.leagues?.[0]?.teams ?? []).map((x: any) => x?.team).filter(Boolean)
      : [];

  const ids = teams.map((t) => String(t.id)).filter(Boolean).slice(0, 46);
  const schedules = await Promise.allSettled(
    ids.map((id) => espn(`${SITE_WEB}/apis/site/v2/sports/soccer/all/teams/${id}/schedule`)),
  );

  const seen = new Set<string>();
  const events: any[] = [];
  for (const r of schedules) {
    if (r.status !== 'fulfilled') continue;
    for (const ev of r.value?.events ?? []) {
      const id = String(ev?.id ?? '');
      const evSlug = String(ev?.league?.slug ?? ev?.competitions?.[0]?.league?.slug ?? '');
      if (id && evSlug === slug && !seen.has(id)) {
        seen.add(id);
        events.push(ev);
      }
    }
  }
  events.sort((a, b) => String(a.date).localeCompare(String(b.date)));

  return {
    slug,
    teams,
    events,
    standings: standings.status === 'fulfilled' ? standings.value : null,
    fetchedAt: new Date().toISOString(),
  };
}

/** 팀의 지난 경기 + 예정 경기를 한 번에 합쳐 준다. */
async function schedule(teamId: string) {
  const base = `${SITE_WEB}/apis/site/v2/sports/soccer/all/teams/${teamId}/schedule`;
  const [past, future] = await Promise.allSettled([espn(base), espn(`${base}?fixture=true`)]);

  const events: any[] = [];
  const seen = new Set<string>();
  for (const r of [past, future]) {
    if (r.status !== 'fulfilled') continue;
    for (const ev of r.value?.events ?? []) {
      const id = String(ev?.id ?? '');
      if (id && !seen.has(id)) {
        seen.add(id);
        events.push(ev);
      }
    }
  }
  if (!events.length) throw new Error('no events');
  events.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return { events, team: teamId, fetchedAt: new Date().toISOString() };
}

export default {
  async fetch(req: Request, _env: unknown, ctx: ExecutionContext): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (req.method !== 'GET') return fail(405, 'GET only');

    const url = new URL(req.url);
    const seg = url.pathname.split('/').filter(Boolean); // ['api','v1',...]
    if (seg[0] !== 'api' || seg[1] !== 'v1') return fail(404, 'not found');

    // 엣지 캐시 조회
    const cache = caches.default;
    const hit = await cache.match(req);
    if (hit) return hit;

    try {
      let res: Response;
      const [, , kind, a, b] = seg;

      switch (kind) {
        case 'schedule': {
          if (!a) return fail(400, 'team id required');
          res = json(await schedule(a), TTL.schedule);
          break;
        }
        case 'league': {
          if (!a) return fail(400, 'league slug required');
          res = json(await league(a), TTL.standings);
          break;
        }
        case 'standings': {
          if (!a) return fail(400, 'league required');
          // ⚠️ soccer 순위는 /apis/v2/ 경로여야 한다. /apis/site/v2/ 는 빈 객체를 준다.
          res = json(await espn(`${SITE}/apis/v2/sports/soccer/${a}/standings`), TTL.standings);
          break;
        }
        case 'goals': {
          if (!a || !b) return fail(400, 'league and event required');
          // 어시스트는 core API /plays 에만 있다(골과 별도 이벤트).
          const ev = await espn(
            `${CORE}/v2/sports/soccer/leagues/${a}/events/${b}/competitions/${b}/plays?limit=400`,
          );
          res = json(ev, TTL.immutable);
          break;
        }
        case 'summary': {
          if (!a || !b) return fail(400, 'league and event required');
          res = json(
            await espn(`${SITE}/apis/site/v2/sports/soccer/${a}/summary?event=${b}`),
            TTL.immutable,
          );
          break;
        }
        case 'matchroster': {
          /* /api/v1/matchroster/:league/:eventId/:teamId
             site 요약의 rosters[] 만 잘라서 돌려준다. 여기에는
             formationPlace·starter 와 **선수별 골(totalGoals)·도움(goalAssists)** 이
             athleteId 와 함께 들어 있어, 이름 매칭 없이 시즌 집계를 만들 수 있다.
             요약 전체는 뉴스·배당까지 붙어 무겁기 때문에 여기서 줄인다. */
          const teamId = seg[5];
          if (!a || !b || !teamId) return fail(400, 'league, event and team required');
          const full: any = await espn(
            `${SITE}/apis/site/v2/sports/soccer/${a}/summary?event=${b}`,
          );
          const rosters = Array.isArray(full?.rosters)
            ? full.rosters.filter((r: any) => String(r?.team?.id ?? '') === teamId)
            : [];
          res = json({ rosters }, TTL.immutable);
          break;
        }
        case 'lineup': {
          // /api/v1/lineup/:league/:eventId/:teamId
          // core 응답에 formation.summary 와 선수별 formationPlace 가 들어 있다.
          // 종료 경기의 라인업은 변하지 않으므로 영구 캐시한다.
          const teamId = seg[5];
          if (!a || !b || !teamId) return fail(400, 'league, event and team required');
          res = json(
            await espn(
              `${CORE}/v2/sports/soccer/leagues/${a}/events/${b}/competitions/${b}/competitors/${teamId}/roster`,
            ),
            TTL.immutable,
          );
          break;
        }
        case 'athletes': {
          // /api/v1/athletes/:league?ids=1,2,3 — 선수 프로필을 한 번에 해석해 준다.
          // core 는 athlete 를 $ref 로만 주기 때문에 클라이언트가 N번 왕복하지 않도록
          // 여기서 모아서 풀고 캐시한다.
          if (!a) return fail(400, 'league required');
          const ids = (url.searchParams.get('ids') ?? '')
            .split(',').map((x) => x.trim()).filter(Boolean).slice(0, 40);
          if (!ids.length) return fail(400, 'ids required');
          const season = url.searchParams.get('season') ?? String(new Date().getUTCFullYear());
          const profiles = await Promise.allSettled(
            ids.map((id) => espn(`${CORE}/v2/sports/soccer/leagues/${a}/seasons/${season}/athletes/${id}`)),
          );
          const out: Record<string, unknown> = {};
          profiles.forEach((r, i) => {
            if (r.status !== 'fulfilled' || !r.value) return;
            const v = r.value as any;
            out[ids[i]] = {
              id: ids[i],
              name: v.displayName ?? v.fullName ?? '',
              jersey: Number(v.jersey ?? 0),
              pos: String(v.position?.abbreviation ?? '').charAt(0) || 'M',
            };
          });
          res = json({ athletes: out }, TTL.season);
          break;
        }
        case 'roster': {
          if (!a || !b) return fail(400, 'league and team required');
          res = json(
            await espn(`${SITE}/apis/site/v2/sports/soccer/${a}/teams/${b}/roster`),
            TTL.season,
          );
          break;
        }
        case 'athlete': {
          // /api/v1/athlete/:league/:athleteId?season=2026
          if (!a || !b) return fail(400, 'league and athlete required');
          const season = url.searchParams.get('season') ?? String(new Date().getUTCFullYear());
          res = json(
            await espn(
              `${CORE}/v2/sports/soccer/leagues/${a}/seasons/${season}/types/1/athletes/${b}/statistics`,
            ),
            TTL.season,
          );
          break;
        }
        case 'scoreboard': {
          if (!a) return fail(400, 'league required');
          const dates = url.searchParams.get('dates');
          res = json(
            await espn(
              `${SITE}/apis/site/v2/sports/soccer/${a}/scoreboard${dates ? `?dates=${dates}` : ''}`,
            ),
            TTL.live,
          );
          break;
        }
        case 'news': {
          if (!a) return fail(400, 'league required');
          const team = url.searchParams.get('team');
          res = json(
            await espn(
              `${SITE}/apis/site/v2/sports/soccer/${a}/news${team ? `?team=${team}` : ''}`,
            ),
            TTL.schedule,
          );
          break;
        }
        case 'playerlog': {
          /* /api/v1/playerlog/:league/:athleteId?season=2026
             선수 한 명의 시즌 합계 + 실제로 뛴 최근 경기.

             ⚠️ 예전 `gamelog` 라우트는 `common/v3/.../athletes/{id}/gamelog` 을
             그대로 중계했다. 그 upstream 은 **죽었다** — 어떤 리그·선수로
             불러도 HTTP 500 {"code":2400} 이다(2026-09-17 확인). 그래서
             Future Resources 카드가 프록시를 켜 놔도 빈칸이었다.
             살아 있는 경로는 core 의 eventlog 다. 응답 모양은 앱의
             FutureStat 과 같게 맞춰서 돌려준다. */
          if (!a || !b) return fail(400, 'league and athlete required');
          const season = url.searchParams.get('season') ?? String(seasonYear());

          const flat = (j: any): Record<string, number> => {
            const out: Record<string, number> = {};
            for (const c of j?.splits?.categories ?? []) {
              for (const s of c?.stats ?? []) {
                const v = Number(s?.value);
                if (s?.name) out[String(s.name)] = Number.isFinite(v) ? v : 0;
              }
            }
            return out;
          };

          const [seasonStats, log] = await Promise.allSettled([
            espn(`${CORE}/v2/sports/soccer/leagues/${a}/seasons/${season}/types/1/athletes/${b}/statistics`),
            espn(`${CORE}/v2/sports/soccer/leagues/${a}/seasons/${season}/athletes/${b}/eventlog?limit=100`),
          ]);
          const tot = seasonStats.status === 'fulfilled' ? flat(seasonStats.value) : {};

          /* 최근 경기 — `played` 는 **명단에 든 것까지** true 라서
             경기별 statistics 의 appearances/minutes 로 실제 출전을 가른다. */
          const items: any[] =
            log.status === 'fulfilled' ? (log.value?.events?.items ?? []) : [];
          const recent: unknown[] = [];
          for (const it of [...items].reverse()) {
            if (recent.length >= 3) break;
            if (it?.played !== true) continue;
            const eventId = String(it?.event?.$ref ?? '').match(/events\/(\d+)/)?.[1];
            const teamId = String(it?.teamId ?? '');
            if (!eventId || !teamId) continue;
            const s = await espn(
              `${CORE}/v2/sports/soccer/leagues/${a}/events/${eventId}/competitions/${eventId}`
              + `/competitors/${teamId}/roster/${b}/statistics/0`,
            ).catch(() => null);
            const f = flat(s);
            if (!((f.appearances ?? 0) >= 1 || (f.minutes ?? 0) > 0)) continue;
            const ev: any = await espn(`${CORE}/v2/sports/soccer/leagues/${a}/events/${eventId}`)
              .catch(() => null);
            const cs: any[] = ev?.competitions?.[0]?.competitors ?? [];
            const opp = cs.find((x: any) => String(x?.id ?? x?.team?.id ?? '') !== teamId);
            recent.push({
              date: String(ev?.date ?? ''),
              opponent: String(opp?.team?.displayName ?? ev?.shortName ?? ''),
              goals: f.totalGoals ?? 0,
              assists: f.goalAssists ?? 0,
            });
          }

          res = json({
            league: a,
            apps: tot.appearances ?? 0,
            goals: tot.totalGoals ?? 0,
            assists: tot.goalAssists ?? 0,
            minutes: tot.minutes ?? 0,
            recent,
          }, TTL.schedule);
          break;
        }
        case 'find': {
          /* /api/v1/find?q=Nico Paz — 선수 ID·현 소속을 다시 찾을 때 쓴다.
             큐레이션 파일의 ID 가 낡았을 때 손으로 고칠 근거가 된다. */
          const q = (url.searchParams.get('q') ?? '').trim();
          if (!q) return fail(400, 'q required');
          res = json(
            await espn(`${SITE_WEB}/apis/search/v2?query=${encodeURIComponent(q)}&limit=8&type=player`),
            TTL.season,
          );
          break;
        }
        case 'newsko': {
          /* /api/v1/newsko?q=레알%20마드리드
             한국어 기사는 무료·무키 소스가 사실상 구글 뉴스 RSS 뿐이다.
             XML 을 그대로 내려보내면 클라이언트에서 파싱해야 하고 CORS 도
             걸리므로, 여기서 JSON 으로 바꿔 돌려준다.
             구글 뉴스 item 형식:
               <title>기사 제목 - 매체명</title>
               <link>…</link><pubDate>…</pubDate>
               <source url="…">매체명</source>
          */
          const q = (url.searchParams.get('q') ?? '').trim();
          if (!q) return fail(400, 'q required');
          const rss = await fetch(
            `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=ko&gl=KR&ceid=KR:ko`,
            { headers: { 'user-agent': 'Mozilla/5.0 (compatible; k-stats-hub/1.0)' }, cf: { cacheTtl: 600 } },
          );
          if (!rss.ok) return fail(502, `google news ${rss.status}`);
          const xml = await rss.text();

          const unescapeXml = (v: string) =>
            v.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
             .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
             .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
             .replace(/&amp;/g, '&')
             .replace(/<[^>]+>/g, '')
             .trim();
          const tag = (block: string, name: string) =>
            unescapeXml(block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1] ?? '');

          const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
            .slice(0, 24)
            .map((m) => {
              const b = m[1];
              const rawTitle = tag(b, 'title');
              const publisher = tag(b, 'source');
              // 구글은 제목 끝에 " - 매체명" 을 붙인다. 중복이라 떼어 낸다.
              const headline =
                publisher && rawTitle.endsWith(` - ${publisher}`)
                  ? rawTitle.slice(0, -(publisher.length + 3))
                  : rawTitle;
              const link = tag(b, 'link');
              const pub = tag(b, 'pubDate');
              const iso = pub ? new Date(pub).toISOString() : '';
              return {
                id: link || headline,
                headline,
                description: unescapeXml(tag(b, 'description')).slice(0, 220),
                published: iso,
                type: 'Story',
                href: link,
                source: 'ko',
                publisher,
              };
            })
            .filter((x) => x.headline && x.href);

          res = json({ articles: items }, TTL.schedule);
          break;
        }
        default:
          return fail(404, `unknown route: ${kind}`);
      }

      ctx.waitUntil(cache.put(req, res.clone()));
      return res;
    } catch (e) {
      return fail(502, e instanceof Error ? e.message : 'upstream error');
    }
  },
};
