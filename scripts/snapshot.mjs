#!/usr/bin/env node
/**
 * GitHub Actions 에서 주기적으로 실행되어 ESPN 데이터를 JSON으로 떠 둔다.
 *
 * 이 스냅샷을 Cloudflare Pages(정적 CDN)가 서빙하므로, 앱 사용자가
 * 아무리 늘어도 ESPN 호출량은 이 스크립트의 실행 횟수에 고정된다.
 * 실시간성이 필요한 순간(경기 진행 중)에만 앱이 Worker 프록시를 쓴다.
 *
 * ⚠️ **앱에는 경기 데이터가 하나도 박혀 있지 않다.** 화면에 보이는 모든
 * 숫자는 이 스크립트가 만든 JSON 이거나 Worker 프록시의 실시간 응답이다.
 * 그래서 이 스크립트가 만드는 파일 목록이 곧 앱이 아는 세상의 전부다.
 *
 *   meta.json              언제 떴는지
 *   schedule-{slug}.json   우리 팀 일정 (일정 탭·다음 경기)
 *   league-{slug}.json     리그 전 팀 경기 + 순위 (순위 탭)
 *   squad-{slug}.json      경기별 라인업 + 선수별 골·도움 (선수 스탯 탭)
 *   koreans.json           코리안리거 소속·기록·최근 경기
 *   news-{slug}.json       ESPN 영문 + 한국어 구글 뉴스
 *   future.json            조항 선수들의 현재 기록 (조항 문구는 앱의 큐레이션 파일)
 *
 * 사용: node scripts/snapshot.mjs [출력디렉터리] [--only=fast|slow|all]
 *
 * 두 갈래로 나눠 둔 이유:
 *  · fast — 팀 일정·뉴스. 가볍고 경기 중에는 자주 떠야 한다 → 10분
 *  · slow — 리그 전 팀(리그당 20팀 × 2요청)·스쿼드·코리안리거 → 1시간
 * 한 워크플로에서 다 돌리면 10분마다 수백 요청이 나가 ESPN 에 과하다.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const args = process.argv.slice(2);
const OUT = args.find((a) => !a.startsWith('--')) ?? 'web/public/data';
const ONLY = (args.find((a) => a.startsWith('--only='))?.split('=')[1] ?? 'all');
const wants = (kind) => ONLY === 'all' || ONLY === kind;

/** 유럽 시즌은 8월 시작 — 오늘로부터 시즌 시작 연도를 구한다 */
const seasonYear = (d = new Date()) => {
  const y = d.getUTCFullYear();
  return d.getUTCMonth() + 1 >= 8 ? y : y - 1;
};
const SEASON = seasonYear();

const SITE = 'https://site.api.espn.com';
const SITE_WEB = 'https://site.web.api.espn.com';

const CORE = 'https://sports.core.api.espn.com';

const TEAMS = [
  { id: '86', slug: 'real-madrid', league: 'esp.1', koQuery: '레알 마드리드' },
  { id: '363', slug: 'chelsea', league: 'eng.1', koQuery: '첼시 FC' },
  { id: '451', slug: 'korea', league: 'fifa.worldq.afc', koQuery: '축구 국가대표팀 손흥민 이강인' },
];
const LEAGUES = ['esp.1', 'eng.1', 'uefa.champions'];

/** 코리안리거 명단 — 앱의 src/config/koreans.ts 와 같은 목록을 쓴다 */
const KOREANS = [
  ['149945', '손흥민'], ['274197', '이강인'], ['157688', '김민재'],
  ['297985', '이재성'], ['310166', '정우영'], ['346613', '홍현석'],
  ['302132', '황인범'], ['235297', '황희찬'], ['311486', '오현규'],
  ['256598', '백승호'], ['362208', '배준호'], ['303016', '조규성'],
  ['321923', '이한범'], ['347512', '이현주'], ['393410', '양민혁'],
  ['354283', '양현준'], ['403147', '김민수'], ['298402', '김지수'],
];

/** 유럽대항전 — 리그 기록과 따로 조회해야 한다 */
const EURO = [
  ['uefa.champions', '챔스'],
  ['uefa.europa', '유로파'],
  ['uefa.europa.conf', '컨퍼런스'],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': 'k-stats-hub-snapshot/1.0' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i === tries - 1) {
        console.error(`  ✗ ${url} — ${e.message}`);
        return null;
      }
      await sleep(800 * (i + 1));
    }
  }
}

async function save(name, data) {
  await writeFile(join(OUT, name), JSON.stringify(data), 'utf8');
  console.log(`  ✓ ${name}`);
}

/* ── 한국어 뉴스 ──────────────────────────────────────
   무료·무키로 한국어 축구 기사를 얻는 길은 사실상 구글 뉴스 RSS 뿐이다.
   XML 은 여기서 JSON 으로 바꿔 둔다 — 브라우저가 파싱할 일이 없게. */
async function googleNewsKo(q) {
  if (!q) return [];
  try {
    const res = await fetch(
      `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=ko&gl=KR&ceid=KR:ko`,
      { headers: { 'user-agent': 'Mozilla/5.0 (compatible; k-stats-hub/1.0)' } },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();

    const clean = (v) =>
      String(v ?? '')
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/<[^>]+>/g, '')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&')
        .trim();
    const tag = (block, name) =>
      clean(block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1]);

    return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 20).map((m) => {
      const b = m[1];
      const raw = tag(b, 'title');
      const publisher = tag(b, 'source');
      // 구글은 제목 끝에 " - 매체명" 을 붙인다. <source> 와 중복이라 떼어 낸다.
      const headline = publisher && raw.endsWith(` - ${publisher}`)
        ? raw.slice(0, -(publisher.length + 3))
        : raw;
      const href = tag(b, 'link');
      const pub = tag(b, 'pubDate');
      return {
        id: href || headline,
        headline,
        description: tag(b, 'description').slice(0, 220),
        published: pub ? new Date(pub).toISOString() : '',
        type: 'Story',
        href,
        source: 'ko',
        publisher,
      };
    }).filter((x) => x.headline && x.href);
  } catch (e) {
    console.error(`  ! 구글 뉴스(${q}) — ${e.message}`);
    return [];
  }
}

/* ── 코리안리거 한 명 ─────────────────────────────────
   core 는 athlete 를 $ref 로만 주므로 프로필 → 소속팀 → 대회별 기록 순으로
   따라가야 한다. 리그와 유럽대항전을 합쳐 주는 엔드포인트는 없다. */
async function koreanPlayer(id, nameKo) {
  const prof = await get(`${CORE}/v2/sports/soccer/athletes/${id}`);
  if (!prof) return null;

  const teamRef = prof?.team?.$ref;
  const team = teamRef ? await get(teamRef) : null;
  const clubId = String(team?.id ?? '0');
  const club = String(team?.displayName ?? team?.name ?? '');

  // 소속 리그 slug 는 팀 응답의 $ref 경로에서 읽는다
  const league = String(teamRef ?? '').match(/leagues\/([\w.]+)\//)?.[1] ?? '';
  const leagueName = String(team?.groups?.name ?? '') || league;

  const posAbbr = String(prof?.position?.abbreviation ?? 'M').toUpperCase();
  const pos = posAbbr.startsWith('G') ? 'G'
    : posAbbr.startsWith('D') || posAbbr.includes('B') ? 'D'
    : posAbbr.startsWith('F') || posAbbr.startsWith('S') || posAbbr.startsWith('W') ? 'F' : 'M';

  const pull = async (lg, label) => {
    const j = await get(
      `${CORE}/v2/sports/soccer/leagues/${lg}/seasons/${SEASON}/types/1/athletes/${id}/statistics`,
    );
    const cats = j?.splits?.categories ?? [];
    const val = (name) => {
      for (const c of cats) {
        const hit = (c?.stats ?? []).find((x) => x?.name === name);
        if (hit) return Number(hit.value) || 0;
      }
      return 0;
    };
    const apps = val('appearances');
    if (!apps) return null;
    return {
      competition: lg, label,
      apps,
      starts: val('starts') || val('subIns') ? apps - val('subIns') : apps,
      minutes: val('minutes') || val('timePlayed') || 0,
      goals: val('totalGoals'),
      assists: val('goalAssists'),
      yellow: val('yellowCards'),
      red: val('redCards'),
    };
  };

  const stats = [];
  if (league) {
    const s = await pull(league, '리그');
    if (s) stats.push(s);
    await sleep(150);
  }
  for (const [lg, label] of EURO) {
    const s = await pull(lg, label);
    if (s) stats.push(s);
    await sleep(150);
  }

  // 최근 3경기 — 소속 리그 gamelog 에서
  const recent = [];
  if (league) {
    const gl = await get(`${SITE_WEB}/apis/common/v3/sports/soccer/${league}/athletes/${id}/gamelog`);
    const names = (gl?.names ?? gl?.labels ?? []).map(String);
    const iG = names.findIndex((n) => ['totalGoals', 'goals', 'G'].includes(n));
    const iA = names.findIndex((n) => ['goalAssists', 'assists', 'A'].includes(n));
    const events = gl?.events ?? {};
    const rows = [];
    for (const st of gl?.seasonTypes ?? []) {
      for (const c of st?.categories ?? []) {
        for (const ev of c?.events ?? []) {
          const meta = events[String(ev?.eventId ?? '')] ?? {};
          rows.push({
            competition: league,
            result: String(meta?.gameResult ?? 'D').toUpperCase().slice(0, 1) || 'D',
            opponentId: String(meta?.opponent?.id ?? '0'),
            opponent: String(meta?.opponent?.displayName ?? ''),
            score: String(meta?.score ?? ''),
            started: false,
            minutes: 0,
            goals: Number(ev?.stats?.[iG] ?? 0) || 0,
            assists: Number(ev?.stats?.[iA] ?? 0) || 0,
            date: String(meta?.gameDate ?? ''),
          });
        }
      }
    }
    rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    recent.push(...rows.slice(0, 3));
  }

  return {
    id, nameKo,
    name: String(prof?.displayName ?? nameKo),
    pos,
    age: Number(prof?.age ?? 0) || 0,
    clubId, club, league, leagueName,
    stats, recent,
  };
}

async function main() {
  await mkdir(OUT, { recursive: true });
  console.log(`스냅샷 시작 → ${OUT}`);

  if (wants('fast')) for (const t of TEAMS) {
    const base = `${SITE_WEB}/apis/site/v2/sports/soccer/all/teams/${t.id}/schedule`;
    const [past, future] = await Promise.all([get(base), get(`${base}?fixture=true`)]);

    const seen = new Set();
    const events = [];
    for (const src of [past, future]) {
      for (const ev of src?.events ?? []) {
        const id = String(ev?.id ?? '');
        if (id && !seen.has(id)) { seen.add(id); events.push(ev); }
      }
    }
    events.sort((a, b) => String(a.date).localeCompare(String(b.date)));

    if (events.length) {
      await save(`schedule-${t.slug}.json`, { events, team: t.id, fetchedAt: new Date().toISOString() });
    } else {
      console.error(`  ! ${t.slug}: 이벤트 0건 — 기존 파일 유지`);
    }
    await sleep(400);
  }

  if (wants('slow')) for (const lg of LEAGUES) {
    // soccer 순위는 반드시 /apis/v2/ 경로 (site/v2 는 빈 객체를 반환한다)
    const standings = await get(`${SITE}/apis/v2/sports/soccer/${lg}/standings`);
    if (standings) await save(`standings-${lg}.json`, standings);
    await sleep(400);

    /* 순위표만으로는 부족하다.
       ESPN 의 standings 응답은 실제 경기보다 몇 라운드씩 늦게 따라온다
       (라운드 6 이 끝난 날에도 "2경기 소화" 로 내려온 적이 있다).
       그래서 앱은 경기 결과로 표를 다시 계산한다(web/src/lib/league.ts).
       그러려면 그 리그 **모든 팀**의 경기가 필요하다.

       ⚠️ scoreboard?dates=A-B 로 한 번에 받으면 응답이 조용히 잘린다.
       (라리가 50경기 중 43경기만 들어와 순위가 틀어진 적이 있다)
       팀별 schedule 을 합치는 방식만 쓴다. */
    const teamList = await get(`${SITE}/apis/site/v2/sports/soccer/${lg}/teams`);
    const ids = (teamList?.sports?.[0]?.leagues?.[0]?.teams ?? [])
      .map((t) => String(t?.team?.id ?? ''))
      .filter(Boolean);

    if (!ids.length) {
      console.error(`  ! ${lg}: 팀 목록 0건 — league 파일 유지`);
      continue;
    }

    const seen = new Set();
    const events = [];
    for (const id of ids) {
      const base = `${SITE_WEB}/apis/site/v2/sports/soccer/${lg}/teams/${id}/schedule`;
      const [past, future] = await Promise.all([get(base), get(`${base}?fixture=true`)]);
      for (const src of [past, future]) {
        for (const ev of src?.events ?? []) {
          const eid = String(ev?.id ?? '');
          if (eid && !seen.has(eid)) { seen.add(eid); events.push(ev); }
        }
      }
      await sleep(180);
    }
    events.sort((a, b) => String(a.date).localeCompare(String(b.date)));

    if (events.length) {
      await save(`league-${lg}.json`, {
        league: lg,
        events,
        standings,
        teams: ids.length,
        fetchedAt: new Date().toISOString(),
      });
      const done = events.filter((e) => e?.competitions?.[0]?.status?.type?.completed).length;
      console.log(`    ${lg}: ${ids.length}팀 · ${events.length}경기 (종료 ${done})`);
    } else {
      console.error(`  ! ${lg}: 이벤트 0건 — 기존 league 파일 유지`);
    }
  }

  /* ── 뉴스 (fast) ──────────────────────────────────────
     ESPN 영문 피드와 한국어 구글 뉴스를 합쳐 하나의 articles 배열로 만든다.
     앱은 두 소스를 구분해서 보여 주므로 source 를 붙여 둔다. */
  if (wants('fast')) for (const t of TEAMS) {
    const en = await get(
      `${SITE}/apis/site/v2/sports/soccer/${t.league}/news?team=${t.id}&limit=20`,
    );
    const articles = (en?.articles ?? []).map((a) => ({
      id: a?.links?.web?.href ?? '',
      headline: a?.headline ?? '',
      description: a?.description ?? '',
      published: a?.published ?? a?.lastModified ?? '',
      type: a?.type ?? 'Story',
      byline: a?.byline ?? undefined,
      href: a?.links?.web?.href ?? '',
      image: a?.images?.[0]?.url ?? undefined,
      source: 'espn',
    })).filter((a) => a.href && a.headline);

    const ko = await googleNewsKo(t.koQuery);
    const all = [...articles, ...ko]
      .filter((a, i, arr) => arr.findIndex((x) => x.href === a.href) === i)
      .sort((a, b) => String(b.published).localeCompare(String(a.published)));

    if (all.length) {
      await save(`news-${t.slug}.json`, { articles: all, team: t.id, fetchedAt: new Date().toISOString() });
    } else {
      console.error(`  ! ${t.slug}: 뉴스 0건 — 기존 파일 유지`);
    }
    await sleep(300);
  }

  /* ── 스쿼드 (slow) ────────────────────────────────────
     경기별 로스터에는 formationPlace·starter 와 **선수별 골·도움**이
     athleteId 와 함께 들어 있다. 이름 매칭 없이 시즌 집계를 만들 수 있는
     유일한 경로다(예전에 이름으로 맞추다 도움이 통째로 0 이 됐다). */
  if (wants('slow')) for (const t of TEAMS) {
    const sched = await get(`${SITE_WEB}/apis/site/v2/sports/soccer/all/teams/${t.id}/schedule`);
    const done = (sched?.events ?? [])
      .filter((e) => e?.competitions?.[0]?.status?.type?.completed)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 16);

    const lineups = {};
    const athletes = {};
    for (const ev of done) {
      const lg = ev?.league?.slug ?? ev?.season?.slug ?? t.league;
      const sum = await get(`${SITE_WEB}/apis/site/v2/sports/soccer/${lg}/summary?event=${ev.id}`);
      const mine = (sum?.rosters ?? []).find((r) => String(r?.team?.id ?? '') === t.id);
      if (!mine?.roster?.length) continue;

      const stat = (e, name) => {
        const hit = (e?.stats ?? []).find((x) => x?.name === name);
        const v = Number(hit?.value ?? hit?.displayValue);
        return Number.isFinite(v) ? v : 0;
      };
      const pos = (abbr = 'M') => {
        const a = String(abbr).toUpperCase();
        if (a.startsWith('G')) return 'G';
        if (a.startsWith('D') || a.includes('B') || a.startsWith('C')) return 'D';
        if (a.startsWith('F') || a.startsWith('S') || a.startsWith('W')) return 'F';
        return 'M';
      };

      const entries = [];
      for (const e of mine.roster) {
        const id = String(e?.athlete?.id ?? '');
        if (!id) continue;
        entries.push([
          id,
          Number(e?.formationPlace ?? 0) || 0,
          e?.starter === true,
          e?.subbedInAtMinute ?? undefined,
          e?.subbedOutAtMinute ?? undefined,
          stat(e, 'totalGoals'),
          stat(e, 'goalAssists'),
        ]);
        const name = String(e?.athlete?.displayName ?? '').trim();
        if (name) {
          athletes[id] = {
            name,
            jersey: Number(e?.jersey ?? 0) || 0,
            pos: pos(e?.position?.abbreviation),
          };
        }
      }
      if (entries.length) {
        lineups[String(ev.id)] = {
          teamId: t.id,
          formation: String(mine?.formation ?? ''),
          entries,
          hasStats: true,
        };
      }
      await sleep(220);
    }

    if (Object.keys(lineups).length) {
      await save(`squad-${t.slug}.json`, {
        team: t.id, lineups, athletes, fetchedAt: new Date().toISOString(),
      });
      console.log(`    ${t.slug}: 라인업 ${Object.keys(lineups).length}경기 · 선수 ${Object.keys(athletes).length}명`);
    } else {
      console.error(`  ! ${t.slug}: 라인업 0경기 — 기존 파일 유지`);
    }
  }

  /* ── 코리안리거 (slow) ───────────────────────────────── */
  if (wants('slow')) {
    const players = [];
    for (const [id, nameKo] of KOREANS) {
      const p = await koreanPlayer(id, nameKo);
      if (p) players.push(p);
      await sleep(250);
    }
    if (players.length) {
      await save('koreans.json', { players, season: SEASON, fetchedAt: new Date().toISOString() });
      console.log(`    코리안리거 ${players.length}명`);
    } else {
      console.error('  ! 코리안리거 0명 — 기존 파일 유지');
    }
  }

  await save(ONLY === 'slow' ? 'meta-slow.json' : 'meta.json', {
    generatedAt: new Date().toISOString(),
    only: ONLY,
  });
  console.log('완료');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
