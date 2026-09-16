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
import { mkdir, readFile, writeFile } from 'node:fs/promises';
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

/* ── 포지션 약어 → 큰 분류 ────────────────────────────────
   ⚠️ 예전에는 "약어가 C 로 시작하면 수비수" 같은 난폭한 규칙이었다.
   그래서 CM(중앙 미드필더)·CAM·CF(센터포워드)가 전부 수비수가 됐고,
   벨링엄이 DF, 첼시 스쿼드 대부분이 DF 로 나왔다.
   web/src/lib/squad.ts 의 ROLE_BY_CORE 와 같은 표를 쓴다. */
const POS_BY_CORE = {
  G: 'G', GK: 'G',
  B: 'D', CB: 'D', CD: 'D', D: 'D', WB: 'D', SW: 'D', DEF: 'D',
  DM: 'M', CDM: 'M', DMF: 'M',
  M: 'M', CM: 'M', MF: 'M', MID: 'M', CMF: 'M', WM: 'M',
  AM: 'M', CAM: 'M', AMF: 'M',
  W: 'F', WF: 'F',
  F: 'F', FW: 'F', S: 'F', ST: 'F', CF: 'F', SS: 'F',
};

function posFromAbbr(abbr) {
  const a = String(abbr ?? '').toUpperCase().trim();
  if (!a) return 'M';
  let core = a;
  const suffix = a.match(/-(L|R|C)$/);
  if (suffix) core = a.slice(0, a.length - 2);
  else if (a.length > 1 && (a[0] === 'L' || a[0] === 'R')) core = a.slice(1);
  return POS_BY_CORE[core] ?? POS_BY_CORE[a] ?? 'M';
}

/* ── 득점 상세 (스코어보드 details[]) ──────────────────────
   팀/리그 일정(schedule) 응답에는 애초에 details[]가 없다(다른 엔드포인트
   전용 필드). 그래서 정적 피드만 보는 배포(Worker 프록시 없음)에서는
   "이달의 경기"·"대회별 선수 기록"이 득점자를 하나도 못 보여줬다.

   ⚠️ 처음엔 core API 의 `/plays` 로 받으려 했는데 실측해 보니 한 경기가
   **1,404개** 플레이(패스·터치까지 전부)로 내려온다. `limit=400` 으로는
   경기 앞 3분치만 들어와 골이 아예 안 잡힌다(worker 의 goals 라우트도
   같은 한계를 안고 있다).

   반면 **스코어보드는 그 날짜·그 대회의 모든 경기 득점 상세를 요청 한 번**에
   준다 — `competitions[0].details[]` 안에 scoringPlay/ownGoal/penaltyKick/
   athletesInvolved 가 그대로 들어 있다(2026-09-12 eng.1 로 확인).
   그래서 경기 단위가 아니라 날짜 단위로 한 번씩만 받아서 나눠 붙인다. */
function goalsFromDetailsRaw(details) {
  if (!Array.isArray(details)) return [];
  const minuteOf = (clock) => {
    const dv = String(clock?.displayValue ?? '');
    const m = dv.match(/(\d+)/);
    if (m) return parseInt(m[1], 10);
    const v = Number(clock?.value);
    return Number.isFinite(v) ? Math.floor(v / 60) : 0;
  };
  return details
    .filter((d) => d?.scoringPlay === true && d?.shootout !== true)
    .map((d) => {
      const people = Array.isArray(d?.athletesInvolved) ? d.athletesInvolved : [];
      const minute = minuteOf(d?.clock);
      return {
        minute,
        clock: String(d?.clock?.displayValue ?? `${minute}'`),
        teamId: String(d?.team?.id ?? ''),
        scorer: String(people[0]?.displayName ?? people[0]?.shortName ?? '—'),
        // 스코어보드 details 는 보통 득점자만 준다 — 어시스트는 있으면 받는다
        assist: people[1]?.displayName ? String(people[1].displayName) : undefined,
        ownGoal: d?.ownGoal === true,
        penalty: d?.penaltyKick === true,
      };
    })
    .sort((a, b) => a.minute - b.minute);
}

/** ISO 날짜 → 'YYYYMMDD' (스코어보드 dates 파라미터 형식) */
const ymd = (iso) => String(iso ?? '').slice(0, 10).replace(/-/g, '');

const shiftDay = (yyyymmdd, delta) => {
  const d = new Date(Date.UTC(
    Number(yyyymmdd.slice(0, 4)),
    Number(yyyymmdd.slice(4, 6)) - 1,
    Number(yyyymmdd.slice(6, 8)) + delta,
  ));
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
};

/** (대회, 날짜) 스코어보드 한 번 = 그 날 그 대회 모든 경기의 득점 상세 */
const sbCache = new Map();
async function scoreboardGoals(leagueSlug, yyyymmdd) {
  const key = `${leagueSlug}|${yyyymmdd}`;
  const hit = sbCache.get(key);
  if (hit) return hit;

  const j = await get(`${SITE}/apis/site/v2/sports/soccer/${leagueSlug}/scoreboard?dates=${yyyymmdd}`);
  const map = new Map();
  for (const ev of j?.events ?? []) {
    map.set(String(ev?.id ?? ''), goalsFromDetailsRaw(ev?.competitions?.[0]?.details));
  }
  sbCache.set(key, map);
  await sleep(150);
  return map;
}

/* ── 선수 헤드샷 ──────────────────────────────────────────
   ESPN 은 축구 선수 사진을 **일부 선수에게만** 준다. 그리고 그걸 알려 주는
   응답은 팀 로스터(`/teams/{id}/roster`)의 `headshot.href` 하나뿐이다 —
   경기별 로스터·선수 프로필(`/athletes/{id}`)·검색 응답에는 사진 필드
   자체가 없다. 예전에 그 세 곳만 보고 "축구는 헤드샷이 아예 없다"고 잘못
   결론 내렸었다. 실제로는 갈린다(실측: 353951 있음 / 296410·149945 404).
   그래서 팀 단위로 한 번 받아 두고 선수별 실제 주소를 박아 준다. */
const rosterPhotoCache = new Map();
async function teamPhotos(leagueSlug, teamId) {
  const key = `${leagueSlug}|${teamId}`;
  const hit = rosterPhotoCache.get(key);
  if (hit) return hit;

  const j = await get(`${SITE}/apis/site/v2/sports/soccer/${leagueSlug}/teams/${teamId}/roster`);
  const map = new Map();
  // 응답이 평평한 athletes[] 일 수도, 포지션 그룹(items[]) 으로 묶여 올 수도 있다
  const flat = [];
  for (const a of j?.athletes ?? []) {
    if (Array.isArray(a?.items)) flat.push(...a.items);
    else flat.push(a);
  }
  for (const a of flat) {
    const id = String(a?.id ?? '');
    if (!id) continue;
    map.set(id, {
      photo: a?.headshot?.href ? String(a.headshot.href) : undefined,
      // 시즌 포지션(G/D/M/F) — 경기 요약이 자리 약어를 안 줄 때의 대비책이다
      posAbbr: a?.position?.abbreviation ? String(a.position.abbreviation) : undefined,
    });
  }
  rosterPhotoCache.set(key, map);
  await sleep(150);
  return map;
}

/* ── 위키백과 사진 (ESPN 에 없는 선수 보충) ────────────────
   ESPN 의 축구 헤드샷 보유율이 아주 낮다 — 첼시·레알 로스터를 직접 확인해
   보니 20명 남짓 중 1~3명뿐이고, 주전들도 대부분 404 다. 그래서 ESPN 에
   사진이 없는 선수는 위키백과 대표 이미지로 보충한다.

   ⚠️ 엉뚱한 사람 얼굴이 뜨는 것이 사진이 없는 것보다 나쁘므로 관문을 세 개
   둔다: (1) 문서 설명에 footballer/soccer 가 있어야 하고, (2) 문서 제목이
   선수 이름과 맞아야 하며, (3) SVG 는 버린다(문서에 사진이 없을 때 위키가
   축구공 아이콘을 대표 이미지로 주는 경우가 있다). 셋 중 하나라도 어긋나면
   사진 없이 배지로 둔다. */
const WIKI_UA = 'k-stats-hub/1.0 (https://github.com/ghdqkfvy-sudo/Football_Stats_hub_MS)';
const wikiCache = new Map();

/** 발음기호·문장부호를 걷어낸 비교용 이름 (Vinícius → vinicius) */
const normName = (s) => String(s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

async function wikipediaPhoto(name) {
  const want = normName(name);
  if (!want) return undefined;
  if (wikiCache.has(want)) return wikiCache.get(want);

  let out;
  try {
    const url = 'https://en.wikipedia.org/w/api.php?action=query&format=json'
      + '&generator=search&gsrlimit=3&gsrsearch=' + encodeURIComponent(`${name} footballer`)
      + '&prop=pageimages|description&piprop=thumbnail&pithumbsize=250';
    const res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': WIKI_UA } });
    if (res.ok) {
      const j = await res.json();
      for (const p of Object.values(j?.query?.pages ?? {})) {
        const src = p?.thumbnail?.source;
        if (!src || /\.svg(\?|$)/i.test(src)) continue;
        if (!/footballer|football|soccer/i.test(String(p?.description ?? ''))) continue;
        const title = normName(p?.title);
        const sameName = title === want
          || want.split(' ').filter((t) => t.length > 1).every((t) => title.includes(t));
        if (!sameName) continue;
        out = String(src);
        break;
      }
    }
  } catch { /* 실패해도 배지로 떨어질 뿐이라 조용히 넘어간다 */ }

  wikiCache.set(want, out);
  await sleep(200);
  return out;
}

/** 이전 스냅샷에서 선수별 사진 주소를 이어받는다 (재조회를 줄인다) */
async function prevPhotos(fileName) {
  const map = new Map();
  try {
    const json = JSON.parse(await readFile(join(OUT, fileName), 'utf8'));
    for (const [id, a] of Object.entries(json?.athletes ?? {})) {
      if (a?.photo) map.set(String(id), String(a.photo));
    }
    for (const p of json?.players ?? []) {
      if (p?.photo) map.set(String(p.id), String(p.photo));
    }
  } catch { /* 첫 실행 */ }
  return map;
}

/* ── 선수 시즌 누적 출전 시간 ─────────────────────────────
   경기별 교체 시각(subbedIn/OutAtMinute) 필드명이 검증되지 않아 대부분
   비어 오고, 그러면 출전시간이 "경기수 × 90분"으로 어림된다(web/src/lib/
   squad.ts 참고). ESPN 선수 시즌 통계(/athletes/{id}/statistics)의
   실제 누적값(minutes/timePlayed)은 코리안리거 집계에서 이미 검증된
   값이라, 있으면 그걸로 총 출전시간을 덮어쓴다. */
async function athleteSeasonMinutes(leagueSlug, id) {
  const j = await get(
    `${CORE}/v2/sports/soccer/leagues/${leagueSlug}/seasons/${SEASON}/types/1/athletes/${id}/statistics`,
  );
  const cats = j?.splits?.categories ?? [];
  const val = (name) => {
    for (const c of cats) {
      const hit = (c?.stats ?? []).find((x) => x?.name === name);
      if (hit) return Number(hit.value) || 0;
    }
    return 0;
  };
  const minutes = val('minutes') || val('timePlayed') || 0;
  return minutes > 0 ? minutes : null;
}

/*
 * 이어받기 캐시의 버전.
 *
 * ⚠️ 이 값을 올리면 예전 스냅샷의 __goals 를 전부 버리고 다시 받는다.
 * 실제로 한 번 크게 당했다: core `/plays` 로 받던 시절의 코드가 팀·선수를
 * $ref 로만 주는 응답을 파싱해서 `teamId:""`, `scorer:"—"` 같은 쓰레기를
 * 만들어 놨는데, "이미 __goals 가 있으니 건너뛴다"는 이어받기 규칙 때문에
 * 파서를 고친 뒤에도 그 값이 영원히 살아남았다. 그래서 (1) 소스가 바뀌면
 * 버전을 올리고 (2) 이어받을 때 값이 멀쩡한지도 검사한다.
 */
const GOALS_SOURCE = 'scoreboard-v2';

/** 득점 한 건이 쓸 만한 값인지 — 팀과 득점자가 실제로 들어 있어야 한다 */
const goalLooksValid = (g) =>
  !!g && typeof g === 'object' && String(g.teamId ?? '') !== '' && String(g.scorer ?? '') !== '—';

/** 이전 스냅샷에서 이벤트별 __goals 를 이어받는다 — 종료된 경기의 득점
    기록은 바뀌지 않으므로 한 번 제대로 뜬 경기는 다시 뜨지 않는다. */
async function prevGoalsMap(fileName) {
  const map = new Map();
  try {
    const raw = await readFile(join(OUT, fileName), 'utf8');
    const json = JSON.parse(raw);

    // 다른 소스로 만들어진 파일이면 통째로 버리고 새로 받는다
    if (json?.goalsSource !== GOALS_SOURCE) return map;

    for (const ev of json?.events ?? []) {
      const g = ev?.competitions?.[0]?.__goals;
      // 빈 배열(0-0)은 그대로 인정하되, 값이 있으면 전부 멀쩡해야 이어받는다
      if (Array.isArray(g) && g.every(goalLooksValid)) map.set(String(ev.id), g);
    }
  } catch { /* 첫 실행 — 이어받을 이전 파일이 없다 */ }
  return map;
}

/** 종료된 경기들에 득점 상세를 채운다(이어받거나, 없으면 스코어보드에서). */
async function enrichGoals(events, defaultLeague, prevMap) {
  let fetched = 0;
  let missed = 0;
  for (const ev of events) {
    const c = ev?.competitions?.[0];
    if (!c || c?.status?.type?.completed !== true) continue;
    const id = String(ev.id);
    const cached = prevMap.get(id);
    if (cached) { c.__goals = cached; continue; }

    const lg = ev?.league?.slug ?? ev?.season?.slug ?? defaultLeague;
    const base = ymd(ev?.date);
    if (!lg || !base) continue;

    /* 스코어보드의 날짜 구분은 UTC 와 한 칸 어긋날 수 있다(미국 기준).
       그래서 당일 → 전날 → 다음날 순으로 찾아본다. 날짜별 응답은
       캐시되므로 같은 날짜를 두 번 받지 않는다. */
    let found = false;
    for (const d of [base, shiftDay(base, -1), shiftDay(base, 1)]) {
      const map = await scoreboardGoals(lg, d);
      if (map.has(id)) {
        c.__goals = map.get(id);
        fetched++;
        found = true;
        break;
      }
    }
    if (!found) missed++;
  }
  if (fetched) console.log(`    득점 상세 신규 ${fetched}경기`);
  if (missed) console.log(`    득점 상세 못 찾음 ${missed}경기 (다음 실행에서 재시도)`);
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
async function koreanPlayer(id, nameKo, carriedPhoto) {
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

  /* 사진: ESPN 은 소속팀 로스터에만 갖고 있고 그마저 대부분 비어 있다.
     없으면 위키백과로 보충한다(carried 는 호출하는 쪽에서 넘겨준다). */
  let photo;
  if (league && clubId !== '0') {
    photo = (await teamPhotos(league, clubId)).get(String(id))?.photo;
  }
  if (!photo) photo = carriedPhoto ?? await wikipediaPhoto(String(prof?.displayName ?? nameKo));

  return {
    id, nameKo,
    name: String(prof?.displayName ?? nameKo),
    pos,
    age: Number(prof?.age ?? 0) || 0,
    clubId, club, league, leagueName,
    photo,
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
      const prevMap = await prevGoalsMap(`schedule-${t.slug}.json`);
      await enrichGoals(events, t.league, prevMap);
      await save(`schedule-${t.slug}.json`, {
        events, team: t.id, goalsSource: GOALS_SOURCE, fetchedAt: new Date().toISOString(),
      });
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
      const prevMap = await prevGoalsMap(`league-${lg}.json`);
      await enrichGoals(events, lg, prevMap);
      await save(`league-${lg}.json`, {
        league: lg,
        events,
        standings,
        teams: ids.length,
        goalsSource: GOALS_SOURCE,
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
      const pos = (abbr) => posFromAbbr(abbr);

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
          // 'CD-L' · 'AM-R' 처럼 좌우까지 들어 있는 ESPN 자리 약어
          String(e?.position?.abbreviation ?? '') || undefined,
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
      const photos = await teamPhotos(t.league, t.id);
      const carried = await prevPhotos(`squad-${t.slug}.json`);
      let fromEspn = 0;
      let fromWiki = 0;
      let gotMinutes = 0;
      for (const id of Object.keys(athletes)) {
        // ESPN 사진이 있으면 1순위, 없으면 지난 스냅샷에서 이어받고,
        // 그것도 없으면 위키백과에서 찾아본다.
        const meta = photos.get(id);
        // 경기 요약이 자리 약어를 안 준 팀은 시즌 포지션이라도 남겨 둔다
        if (meta?.posAbbr) athletes[id].posAbbr = meta.posAbbr;
        if (meta?.photo) {
          athletes[id].photo = meta.photo;
          fromEspn++;
        } else {
          const url = carried.get(id) ?? await wikipediaPhoto(athletes[id].name);
          if (url) { athletes[id].photo = url; fromWiki++; }
        }
        const mins = await athleteSeasonMinutes(t.league, id);
        if (mins) { athletes[id].minutesSeason = mins; gotMinutes++; }
        await sleep(150);
      }
      await save(`squad-${t.slug}.json`, {
        team: t.id, lineups, athletes, fetchedAt: new Date().toISOString(),
      });
      console.log(
        `    ${t.slug}: 라인업 ${Object.keys(lineups).length}경기 · 선수 ${Object.keys(athletes).length}명` +
          ` (출전시간 ${gotMinutes}명 · 사진 ESPN ${fromEspn} + 위키 ${fromWiki})`,
      );
    } else {
      console.error(`  ! ${t.slug}: 라인업 0경기 — 기존 파일 유지`);
    }
  }

  /* ── 코리안리거 (slow) ───────────────────────────────── */
  if (wants('slow')) {
    const carried = await prevPhotos('koreans.json');
    const players = [];
    for (const [id, nameKo] of KOREANS) {
      const p = await koreanPlayer(id, nameKo, carried.get(String(id)));
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
