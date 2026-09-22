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
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  athleteRecent, scheduleMeta, seasonStatsUrl, seasonTotals, teamScheduleUrl,
} from './lib/athlete.mjs';
import {
  betterPhoto, kindFromUrl, matchInRoster, photoFromSportsdb, pickSportsdbPlayer,
  rankOf, rateLimiter, urlVerdict,
} from './lib/photos.mjs';

/** 지금 고른 사진의 등급 (없으면 0) */
const rankOfBest = (b) => rankOf(b?.kind);

/**
 * 팀 일정 → eventId 별 경기 메타. 선수마다 다시 받지 않도록 팀 단위로 캐시한다.
 * (코리안리거·Future 의 "최근 경기" 는 eventlog 가 경기 id 만 주므로
 *  날짜·상대·스코어는 이 일정에서 온다)
 */
const clubMetaCache = new Map();
function clubMeta(clubId) {
  const key = String(clubId ?? '');
  if (!key || key === '0') return Promise.resolve(new Map());
  const hit = clubMetaCache.get(key);
  if (hit) return hit;
  const p = (async () => scheduleMeta(await get(teamScheduleUrl(key)), key))();
  clubMetaCache.set(key, p);
  return p;
}

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

/**
 * 스냅샷 코드 버전.
 * 산출물(meta.json 과 각 파일)에 같이 적어 두면 "이 데이터가 어느 코드로
 * 만들어졌는지" 를 배포된 사이트에서 바로 확인할 수 있다. 기능을 바꿀 때마다
 * 올린다 — 코드는 올라갔는데 데이터가 아직 옛날 것인 상황을 구분하기 위함이다.
 */
const CODE_VERSION = 'snap-16';

const SITE = 'https://site.api.espn.com';
const SITE_WEB = 'https://site.web.api.espn.com';

const CORE = 'https://sports.core.api.espn.com';

/* 앱의 web/src/config/targets.ts 와 같은 목록이어야 한다 —
   슬러그가 데이터 파일 이름이 된다(schedule-{slug}.json). */
const TEAMS = [
  { id: '86', slug: 'real-madrid', name: 'Real Madrid', league: 'esp.1', koQuery: '레알 마드리드' },
  { id: '363', slug: 'chelsea', name: 'Chelsea', league: 'eng.1', koQuery: '첼시 FC' },
  { id: '360', slug: 'man-united', name: 'Manchester United', league: 'eng.1', koQuery: '맨체스터 유나이티드' },
  { id: '367', slug: 'tottenham', name: 'Tottenham Hotspur', league: 'eng.1', koQuery: '토트넘 홋스퍼' },
  { id: '361', slug: 'newcastle', name: 'Newcastle United', league: 'eng.1', koQuery: '뉴캐슬 유나이티드' },
  { id: '364', slug: 'liverpool', name: 'Liverpool', league: 'eng.1', koQuery: '리버풀 FC' },
  { id: '451', slug: 'korea', name: 'South Korea', national: true, league: 'fifa.worldq.afc', koQuery: '축구 국가대표팀 손흥민 이강인' },
];
const LEAGUES = ['esp.1', 'eng.1', 'uefa.champions'];

/** 코리안리거 명단 — 앱의 src/config/koreans.ts 와 같은 목록을 쓴다 */
const KOREANS = [
  ['149945', '손흥민'], ['274197', '이강인'], ['157688', '김민재'],
  ['237224', '황희찬'], ['134103', '이재성'], ['276323', '정우영'],
  ['271701', '홍현석'], ['303464', '조규성'], ['280061', '황인범'],
  ['302434', '오현규'], ['256598', '백승호'], ['362208', '배준호'],
  ['302793', '설영우'], ['304793', '옌스 카스트로프'], ['297791', '엄지성'],
  ['297788', '이한범'], ['346774', '이현주'], ['371578', '양민혁'],
  ['350711', '양현준'], ['388617', '김민수'], ['362203', '김지수'],
];

/** 유럽대항전 — 리그 기록과 따로 조회해야 한다 */
const EURO = [
  ['uefa.champions', '챔스'],
  ['uefa.europa', '유로파'],
  ['uefa.europa.conf', '컨퍼런스'],
];

/* 퓨처 리소스 — 앱의 web/src/data/future.ts 와 같은 목록이어야 한다.
   조항 종류는 화면 쪽에만 있으면 되고, 여기서는 기록을 받을 id·리그만 쓴다. */
const FUTURE = [
  // Real Madrid
  ['337970', 'ita.1'], ['380318', 'ita.1'], ['297360', 'ita.1'],
  ['87297', 'eng.1'], ['12172', 'eng.1'], ['213050', 'esp.1'], ['376473', 'ita.1'],
  // Chelsea
  ['314858', 'eng.1'], ['227784', 'ita.1'], ['325555', 'eng.1'],
  ['299911', 'eng.1'], ['231718', 'eng.1'],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 독립적인 요청을 동시에 n 개까지 굴린다.
 *
 * 예전에는 전부 한 줄로 세워 놓고 사이사이 sleep 을 넣었다. ESPN 은
 * 그만큼 조심할 필요가 없는데도, 리그 워크플로우가 7분 넘게 걸리는 이유의
 * 대부분이 이 "기다림" 이었다(요청 자체보다 줄 서 있는 시간이 길었다).
 * 순서가 중요한 곳은 없으므로 결과 배열의 자리만 지켜 주면 된다.
 */
async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      try {
        out[i] = await fn(items[i], i);
      } catch (e) {
        /* 한 건이 터졌다고 나머지를 버리지 않는다 — 스냅샷은 "받은 만큼
           갱신하고 나머지는 다음 회차" 가 원칙이다. */
        console.error(`  ✗ 처리 실패 [${i}] — ${e?.message ?? e}`);
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker),
  );
  return out;
}

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

/*
 * 원자적 쓰기.
 *
 * ⚠️ 예전에는 목적지 파일에 곧바로 썼다. 스냅샷 워크플로는
 * `cancel-in-progress: true` 로 다음 회차에 취소될 수 있는데, 그 순간이
 * writeFile 중간이면 **잘린 JSON** 이 남고 바로 다음 스텝의 git add 가
 * 그걸 커밋한다. 임시 파일에 다 쓴 뒤 이름만 바꾸면 그럴 일이 없다.
 */
async function save(name, data) {
  const dest = join(OUT, name);
  const tmp = `${dest}.tmp`;
  await writeFile(tmp, JSON.stringify(data), 'utf8');
  await rename(tmp, dest);
  console.log(`  ✓ ${name}`);
}

/*
 * 조용한 실패를 막는 장부.
 *
 * ⚠️ 실제로 당했다: Future Resources 가 `future.json` 을 한 번도 만들지
 * 못했는데(gamelog 엔드포인트가 죽어서) 워크플로는 매번 초록색이었다.
 * 화면만 전부 "–" 였다. 그래서 "만들어야 하는데 못 만들었고, 대신 쓸
 * 예전 파일도 없다" 면 워크플로를 빨갛게 만든다.
 */
const problems = [];
const note = (what, why) => { problems.push(`${what} — ${why}`); console.error(`  ! ${what}: ${why}`); };
const fileExists = async (name) => {
  try { await readFile(join(OUT, name), 'utf8'); return true; } catch { return false; }
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
      const cv = Number(d?.clock?.value);
      return {
        minute,
        clock: String(d?.clock?.displayValue ?? `${minute}'`),
        /* core /plays 의 같은 골을 찾아 도움을 붙일 때 쓰는 열쇠.
           두 응답은 같은 시계(초 단위)를 쓰므로 분보다 훨씬 안전하다. */
        clockValue: Number.isFinite(cv) ? cv : undefined,
        teamId: String(d?.team?.id ?? ''),
        scorer: String(people[0]?.displayName ?? people[0]?.shortName ?? '—'),
        scorerId: people[0]?.id ? String(people[0].id) : undefined,
        // 스코어보드 details 는 보통 득점자만 준다 — 어시스트는 있으면 받는다
        assist: people[1]?.displayName ? String(people[1].displayName) : undefined,
        ownGoal: d?.ownGoal === true,
        penalty: d?.penaltyKick === true,
      };
    })
    .sort((a, b) => a.minute - b.minute);
}

/**
 * 순위 계산에 필요한 만큼만 남긴 경기 하나.
 *
 * ⚠️ 왜 필요한가: 일정 탭은 히어로의 "4위 · 3승1무0패" 한 줄을 그리려고
 * `league-eng.1.json` 을 받는데 그게 **3.2MB** 다(380경기 전체 + 선수별
 * 기록). 앱이 기본으로 여는 탭에서 그걸 내려받을 이유가 없다.
 * 같은 계산(web/src/lib/league.ts 의 buildTable)을 그대로 돌릴 수 있는
 * 최소 필드만 담으면 70KB 대로 떨어진다.
 */
function slimEvent(ev) {
  const c = ev?.competitions?.[0];
  if (!c) return null;
  const cs = Array.isArray(c.competitors) ? c.competitors : [];
  const team = (x) => ({
    team: {
      id: String(x?.team?.id ?? ''),
      displayName: String(x?.team?.displayName ?? x?.team?.name ?? ''),
      shortDisplayName: String(x?.team?.shortDisplayName ?? ''),
      abbreviation: String(x?.team?.abbreviation ?? ''),
    },
    homeAway: x?.homeAway,
    score: { displayValue: String(x?.score?.displayValue ?? x?.score ?? '') },
  });
  return {
    id: String(ev.id),
    date: String(ev.date ?? ''),
    league: { slug: String(ev?.league?.slug ?? ev?.season?.slug ?? '') },
    competitions: [{
      status: { type: { completed: c?.status?.type?.completed === true, state: c?.status?.type?.state } },
      competitors: cs.map(team),
    }],
  };
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
/* 캐시에 **결과가 아니라 약속(Promise)** 을 담는다 — 동시에 같은 날짜를
   물어봐도 요청은 한 번만 나간다. */
const sbCache = new Map();

/* 대회별 라운드 달력 — 스코어보드 응답이 덤으로 준다.
   `leagues[0].calendar[0].entries` 가 [{label:'Third Round', startDate, endDate}, …]
   형태로 그 대회의 **모든 라운드**를 순서대로 알려 준다(eng.league_cup 실측:
   Preliminary → First → Second → Third → Fourth → Quarterfinals → Semifinals → Final).
   컵 대진표를 우리가 지어내지 않고 이 목록 그대로 그린다. */
const roundCal = new Map();

function scoreboardGoals(leagueSlug, yyyymmdd) {
  const key = `${leagueSlug}|${yyyymmdd}`;
  let hit = sbCache.get(key);
  if (hit) return hit;

  hit = (async () => {
    const j = await get(`${SITE}/apis/site/v2/sports/soccer/${leagueSlug}/scoreboard?dates=${yyyymmdd}`);
    const entries = j?.leagues?.[0]?.calendar?.[0]?.entries;
    if (Array.isArray(entries) && entries.length && !roundCal.has(leagueSlug)) {
      roundCal.set(
        leagueSlug,
        entries
          .map((e) => ({
            label: String(e?.label ?? '').trim(),
            start: String(e?.startDate ?? ''),
            end: String(e?.endDate ?? ''),
          }))
          .filter((e) => e.label && e.start && e.end),
      );
    }
    const map = new Map();
    for (const ev of j?.events ?? []) {
      map.set(String(ev?.id ?? ''), goalsFromDetailsRaw(ev?.competitions?.[0]?.details));
    }
    return map;
  })();
  sbCache.set(key, hit);
  return hit;
}

/** 이 대회의 라운드 달력을 확보한다 (이미 있으면 요청하지 않는다) */
async function ensureRounds(leagueSlug, anyIsoDate) {
  if (roundCal.has(leagueSlug)) return;
  const d = ymd(anyIsoDate);
  if (d) await scoreboardGoals(leagueSlug, d);
}


/* ── 경기별 선수 기록 (요약 rosters — 득점·도움) ────────────
   대회 순위표의 "도움" 을 채우려면 골마다 누가 도왔는지가 필요한데,
   스코어보드 details 는 득점자만 준다. 대신 **요약 응답의 rosters 에는
   양 팀 선수별 totalGoals / goalAssists 가 그대로 들어 있다**
   (2026-09-12 Hull-Chelsea 로 확인: rosters 2개, 팀 363/306).
   순위표는 "누가 몇 골·몇 도움" 만 있으면 되므로 이걸 모으면 된다.
   경기당 요청 1회이고, 끝난 경기는 기록이 안 바뀌므로 이어받는다. */
const STATS_SOURCE = 'summary-roster-v1';

function playerStatsFrom(sum) {
  const out = [];
  for (const r of sum?.rosters ?? []) {
    const teamId = String(r?.team?.id ?? '');
    if (!teamId) continue;
    for (const e of r?.roster ?? []) {
      const name = String(e?.athlete?.displayName ?? '').trim();
      if (!name) continue;
      const val = (n) => {
        const hit = (e?.stats ?? []).find((x) => x?.name === n);
        const v = Number(hit?.value ?? hit?.displayValue);
        return Number.isFinite(v) ? v : 0;
      };
      const g = val('totalGoals');
      const a = val('goalAssists');
      const id = String(e?.athlete?.id ?? '');
      if (g > 0 || a > 0) out.push({ id, teamId, name, g, a });
    }
  }
  return out;
}

/** 이전 스냅샷에서 경기별 선수 기록을 이어받는다 */
async function prevStatsMap(fileName) {
  const map = new Map();
  try {
    const json = JSON.parse(await readFile(join(OUT, fileName), 'utf8'));
    if (json?.statsSource !== STATS_SOURCE) return map;
    for (const ev of json?.events ?? []) {
      const st = ev?.competitions?.[0]?.__stats;
      if (Array.isArray(st)) map.set(String(ev.id), st);
    }
  } catch { /* 첫 실행 */ }
  return map;
}

/** 종료된 경기에 선수별 득점·도움을 채운다 */
async function enrichPlayerStats(events, defaultLeague, prevMap, budget = 120, withWindows = false) {
  // 1) 이어받을 건 바로 붙이고, 실제로 받아야 할 경기만 추린다
  const todo = [];
  for (const ev of events) {
    const c = ev?.competitions?.[0];
    if (!c || c?.status?.type?.completed !== true) continue;
    const cached = prevMap.get(String(ev.id));
    if (cached) { c.__stats = cached; continue; }
    if (todo.length >= budget) break;   // 한 번에 다 받지 않고 회차를 나눠 채운다
    todo.push(ev);
  }
  if (!todo.length) return;

  // 2) 서로 관계없는 요청이라 줄 세울 이유가 없다 — 동시에 굴린다
  let fetched = 0;
  await pool(todo, 5, async (ev) => {
    const c = ev.competitions[0];
    const id = String(ev.id);
    const lg = ev?.league?.slug ?? ev?.season?.slug ?? defaultLeague;
    const sum = await get(`${SITE_WEB}/apis/site/v2/sports/soccer/${lg}/summary?event=${id}`);
    if (!sum?.rosters) return;
    const stats = playerStatsFrom(sum);
    /* 출전 구간(몇 분부터 몇 분까지)은 도움을 **추론**할 때만 쓴다.
       지금은 골↔도움을 core /plays 가 직접 알려 주므로(enrichAssists),
       팀 일정에서만, 그것도 추론 대비책으로만 받는다. 리그 전체 파일에는
       필요 없다 — 경기마다 요청이 2건 넘게 늘어나 가장 비싼 구간이었다. */
    if (withWindows && stats.some((x) => x.a > 0)) {
      const teams = [...new Set(stats.map((x) => x.teamId))];
      const infos = await Promise.all(teams.map((tid) => coreLineupInfo(lg, id, tid)));
      teams.forEach((tid, k) => {
        const info = infos[k];
        if (!info?.size) return;
        for (const x of stats) {
          if (x.teamId !== tid) continue;
          const it = info.get(x.id);
          if (!it) continue;
          x.in = it.starter ? 0 : (it.inMin ?? null);
          x.out = it.outMin ?? null;
        }
      });
    }
    c.__stats = stats;
    fetched++;
  });
  if (fetched) console.log(`    선수 기록 신규 ${fetched}경기`);
}

/* ── 자리 약어 보강 (core 경기 로스터) ──────────────────────
   요약 로스터에 position.abbreviation 이 아예 없는 대회가 있다(첼시가
   그랬다). 그때는 core 경기 로스터가 position 을 $ref 로 주는데, 그 id 를
   따라가면 'CD-L' 같은 상세 약어가 나온다(positions/4=CD-L, 8=LB, 14=AM,
   32=AM-L, 33=AM-R, 19=F 로 실측 확인). 위치 표는 대회당 수십 개뿐이라
   한 번 받아 캐시하면 된다. */
const posAbbrCache = new Map();
function positionAbbr(leagueSlug, posId) {
  const key = `${leagueSlug}|${posId}`;
  if (posAbbrCache.has(key)) return posAbbrCache.get(key);
  const p = (async () => {
    const j = await get(`${CORE}/v2/sports/soccer/leagues/${leagueSlug}/positions/${posId}`);
    return j?.abbreviation ? String(j.abbreviation) : undefined;
  })();
  posAbbrCache.set(key, p);
  return p;
}

/* core 경기 로스터 한 번이면 자리 약어와 **교체 시각**을 같이 얻는다.
   실측 구조:
     "subbedIn":  {"didSub": false}
     "subbedOut": {"didSub": true, "clock": {"value": 5143, "displayValue": "86'"}}
   요약(summary) 쪽 로스터는 subbedIn/subbedOut 이 그냥 불리언이라 시각이 없다.
   그래서 실제 출전 시간은 이 경로로만 알 수 있다. */
const clockMin = (o) => {
  if (o?.didSub !== true) return undefined;
  const dv = String(o?.clock?.displayValue ?? '');
  const m = dv.match(/(\d+)/);
  if (m) return parseInt(m[1], 10);
  const v = Number(o?.clock?.value);
  return Number.isFinite(v) ? Math.round(v / 60) : undefined;
};

async function coreLineupInfo(leagueSlug, eventId, teamId) {
  const j = await get(
    `${CORE}/v2/sports/soccer/leagues/${leagueSlug}/events/${eventId}/competitions/${eventId}/competitors/${teamId}/roster`,
  );
  const out = new Map();
  for (const e of j?.entries ?? []) {
    const id = String(e?.playerId ?? '');
    if (!id) continue;
    const posId = String(e?.position?.$ref ?? '').match(/positions\/(\d+)/)?.[1];
    const abbr = posId ? await positionAbbr(leagueSlug, posId) : undefined;
    out.set(id, {
      abbr,
      starter: e?.starter === true,
      inMin: clockMin(e?.subbedIn),
      outMin: clockMin(e?.subbedOut),
      // 교체로도 안 들어갔고 선발도 아니면 그 경기는 아예 안 뛴 것이다
      played: e?.starter === true || e?.subbedIn?.didSub === true,
    });
  }
  return out;
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
      age: Number(a?.age) || undefined,
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

/* ── TheSportsDB 헤드샷 ──────────────────────────────────
 * ESPN 은 축구 선수 사진을 거의 안 준다(음바페조차 없다). TheSportsDB 는
 * 배경을 딴 컷아웃(strCutout)과 인물 사진(strThumb)을 무료로 준다 —
 * 2026-09-17 음바페로 확인:
 *   strCutout .../player/cutout/cxrmkm1788114306.png
 *   strThumb  .../player/thumb/v08cj31778816426.jpg
 *
 * 컷아웃이 없거나 404 인 선수가 많아 HEAD 로 확인하고, 실패하면 썸네일로
 * 내려간다. 이름 검색이라 동명이인이 섞일 수 있어 **축구 선수만** 받는다.
 */
const TSDB = 'https://www.thesportsdb.com/api/v1/json/3';
const tsdbCache = new Map();

/**
 * 이 주소에 파일이 실제로 있는가.
 *
 * ⚠️ 예전에는 `res.ok` 가 아니면 주소를 버렸다. 그런데 CDN 은 HEAD 를
 * 405/403 으로 막기도 하고 러너에서 네트워크가 한 번 튀기도 한다 —
 * 그때마다 **완벽한 컷아웃 주소를 버리고** 위키 경기 사진으로 내려갔다.
 * 파일이 없다는 확실한 신호(404/410)일 때만 버린다.
 */
async function urlOk(url) {
  if (!url) return false;
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return urlVerdict(res.status) === 'keep';
  } catch {
    return true;   // 확인 못 했다 ≠ 없다
  }
}

/*
 * ⚠️ 무료 키(`3`)에는 요청 한도가 있다. 예전에는 선수 6명씩 동시에
 * 160번을 몰아쳤고, 그래서 **처음 처리한 레알 마드리드만 사진이 붙고
 * 그 뒤 다섯 팀은 전부 실패**했다(배포된 파일로 확인:
 * real-madrid 25건 / chelsea 6건 / 나머지 0건).
 * 그래서 이 소스만은 한 줄로 세워 간격을 두고 부른다. 계속 막히면
 * 이번 회차는 포기하고 지난 회차 값을 이어받는다 — 회차를 거듭하며
 * 채워지므로 한 번에 다 못 받아도 결국 다 붙는다.
 */
const tsdbLimit = rateLimiter({ minIntervalMs: 1100, breakAfter: 8 });

/** 한도를 존중하며 TheSportsDB 를 한 번 부른다 (막히면 undefined) */
function tsdbGet(path) {
  return tsdbLimit.run(async () => {
    const res = await fetch(`${TSDB}/${path}`, {
      headers: { accept: 'application/json', 'user-agent': 'k-stats-hub-snapshot/1.0' },
    }).catch(() => null);
    if (!res || !res.ok) return { ok: false, value: undefined };   // 429 도 여기로
    return { ok: true, value: await res.json().catch(() => null) };
  });
}

/* ── TheSportsDB 팀 로스터 ────────────────────────────────
 * 이름으로 한 명씩 찾는 것보다 **팀 단위로 한 번 받는 쪽**이 훨씬 낫다.
 *
 *  · 동명이인 위험이 없다 — 팀이 확정된 목록 안에서 찾으므로.
 *    (리스 제임스 자리에 셰필드 웬즈데이 선수 얼굴이 박힌 사고가 이 때문)
 *  · 표기 차이에 강하다 — ESPN "João Pedro" 를 이름 검색은 못 찾지만
 *    첼시 로스터에는 컷아웃까지 있는 João Pedro 가 그대로 들어 있다.
 *  · 요청이 팀당 2번뿐이라 한도에 걸릴 일이 거의 없다.
 *
 * 무료 키는 로스터를 10명 남짓으로 잘라 주므로 전부는 못 덮는다 —
 * 나머지는 이름 검색(소속팀 일치 필수)으로 내려간다.
 */
const tsdbRosterCache = new Map();
function sportsdbRoster(clubName) {
  const key = normName(clubName);
  if (!key) return Promise.resolve([]);
  const hit = tsdbRosterCache.get(key);
  if (hit) return hit;

  const p = (async () => {
    const t = await tsdbGet(`searchteams.php?t=${encodeURIComponent(clubName)}`);
    const id = String(t?.teams?.[0]?.idTeam ?? '');
    if (!id) return [];
    const r = await tsdbGet(`lookup_all_players.php?id=${id}`);
    const list = Array.isArray(r?.player) ? r.player : [];
    if (list.length) console.log(`    TheSportsDB 로스터 ${clubName}: ${list.length}명`);
    return list;
  })();
  tsdbRosterCache.set(key, p);
  return p;
}

/** @returns {Promise<{url:string, kind:'cutout'|'thumb'}|undefined>} */
function sportsdbPhoto(name, club) {
  const key = `${normName(name)}|${normName(club)}`;
  if (!normName(name)) return Promise.resolve(undefined);
  if (tsdbCache.has(key)) return tsdbCache.get(key);

  const p = (async () => {
    /* 1순위 — 팀 로스터. 팀이 확정돼 있어 동명이인 위험이 없다. */
    const hit = matchInRoster(await sportsdbRoster(club), name, normName)
      /* 2순위 — 이름 검색. 소속팀이 맞는 후보만 받는다(엉뚱한 얼굴 방지). */
      ?? pickSportsdbPlayer(
        (await tsdbGet(`searchplayers.php?p=${encodeURIComponent(name)}`))?.player,
        club, normName,
      );
    if (!hit) return undefined;

    const cand = photoFromSportsdb(hit);
    if (!cand) return undefined;
    if (await urlOk(cand.url)) return cand;
    /* 컷아웃이 404 면 썸네일이라도 */
    const thumb = String(hit?.strThumb ?? '');
    if (cand.kind === 'cutout' && thumb && await urlOk(thumb)) return { url: thumb, kind: 'thumb' };
    return undefined;
  })();
  tsdbCache.set(key, p);
  return p;
}

/* ── ESPN 헤드샷 ─────────────────────────────────────────
 * ESPN 은 축구 선수 사진을 **일부에게만** 준다. 2026-09-16 에 다시 확인했다:
 *  · 팀 로스터(/teams/{id}/roster) 의 headshot.href — 있는 선수만 나온다
 *  · core 선수 객체 / 선수 프로필(common/v3) / 검색(search/v2) — 사진 필드 없음
 *  · ESPN 웹의 선수 페이지(음바페) 자체에도 사진이 없음
 * 즉 "더 뒤지면 나온다" 가 아니라 원본에 없다.
 *
 * 다만 있는 선수의 주소는 예외 없이 이 관용 형식이었다
 * (213248 뒴프리스 · 304871 에메하 · 353951 하토).
 * 로스터가 안 알려 준 선수도 실제로는 파일이 있을 수 있으므로,
 * **HEAD 로 한 번 찔러 보고 있으면** 위키백과보다 먼저 쓴다.
 */
const ESPN_HS = (id) => `https://a.espncdn.com/i/headshots/soccer/players/full/${id}.png`;
const hsCache = new Map();
function espnHeadshot(id) {
  const key = String(id);
  if (hsCache.has(key)) return hsCache.get(key);
  const p = (async () => {
    try {
      const res = await fetch(ESPN_HS(key), { method: 'HEAD' });
      return res.ok ? ESPN_HS(key) : undefined;
    } catch {
      return undefined;
    }
  })();
  hsCache.set(key, p);
  return p;
}

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

/**
 * 이전 스냅샷에서 선수별 사진을 이어받는다.
 *
 * 주소만이 아니라 **출처 등급**(photoKind)도 같이 들고 온다. 등급이 없으면
 * 주소로 되짚는다. 이게 있어야 "위키 경기 사진이 한 번 박히면 영원히
 * 남는" 문제를 끊을 수 있다 — 나중에 컷아웃을 받으면 올라간다.
 */
async function prevPhotos(fileName) {
  const map = new Map();
  const put = (id, url, kind) => {
    if (!url) return;
    map.set(String(id), { url: String(url), kind: kind ?? kindFromUrl(url) });
  };
  try {
    const json = JSON.parse(await readFile(join(OUT, fileName), 'utf8'));
    for (const [id, a] of Object.entries(json?.athletes ?? {})) put(id, a?.photo, a?.photoKind);
    for (const p of json?.players ?? []) put(p?.id, p?.photo, p?.photoKind);
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
const GOALS_SOURCE = 'scoreboard-v3';

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

    const assistsOk = json?.assistsSource === ASSISTS_SOURCE;
    for (const ev of json?.events ?? []) {
      const c = ev?.competitions?.[0];
      const g = c?.__goals;
      // 빈 배열(0-0)은 그대로 인정하되, 값이 있으면 전부 멀쩡해야 이어받는다
      if (Array.isArray(g) && g.every(goalLooksValid)) {
        map.set(String(ev.id), { goals: g, assists: assistsOk && c.__assists === true });
      }
    }
  } catch { /* 첫 실행 — 이어받을 이전 파일이 없다 */ }
  return map;
}

/** 종료된 경기들에 득점 상세를 채운다(이어받거나, 없으면 스코어보드에서). */
async function enrichGoals(events, defaultLeague, prevMap) {
  /* 스코어보드는 (대회, 날짜) 단위라 여러 경기가 같은 응답을 나눠 쓴다.
     아래 루프가 순서대로 물어보면 날짜 수만큼 왕복을 기다리게 되므로,
     필요한 날짜를 먼저 모아 동시에 받아 캐시를 채워 둔다. */
  const warm = new Map();
  for (const ev of events) {
    const c = ev?.competitions?.[0];
    if (!c || c?.status?.type?.completed !== true) continue;
    if (prevMap.get(String(ev.id))) continue;
    const lg = ev?.league?.slug ?? ev?.season?.slug ?? defaultLeague;
    const d = ymd(ev?.date);
    if (lg && d) warm.set(`${lg}|${d}`, [lg, d]);
  }
  if (warm.size) await pool([...warm.values()], 6, ([lg, d]) => scoreboardGoals(lg, d));

  let fetched = 0;
  let missed = 0;
  for (const ev of events) {
    const c = ev?.competitions?.[0];
    if (!c || c?.status?.type?.completed !== true) continue;
    const id = String(ev.id);
    const cached = prevMap.get(id);
    if (cached) {
      c.__goals = cached.goals;
      if (cached.assists) c.__assists = true;
      continue;
    }

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

/* ── 골마다 도움 (core /plays) ─────────────────────────────
 * 오랫동안 "ESPN 은 이 골의 도움을 안 준다" 고 적어 두고 시간으로 추론했다.
 * **틀렸다.** core `/plays` 의 득점 play 는 participants 를 두 개 준다:
 *
 *   "participants": [
 *     { "order": 1, "type": "scorer",   "athlete": { "$ref": ".../athletes/291281?..." } },
 *     { "order": 2, "type": "assister", "athlete": { "$ref": ".../athletes/252107?..." } }
 *   ]
 *   "text": "Goal! Real Madrid 3, Rayo Vallecano 0. Jude Bellingham (Real Madrid)
 *            right footed shot from the centre of the box... Assisted by Vinícius Júnior."
 *
 * (2026-09-12 esp.1 401882880 35' 벨링엄 골로 실측. eng.league_cup 401908127
 *  에서도 같은 엔드포인트가 살아 있다 — count 1570.)
 *
 * 선수 이름은 $ref 안에 없지만 `text` 의 "Assisted by …" 에 그대로 있고,
 * id 는 $ref URL 에서 뽑을 수 있다. 그래서 추론이 아니라 **API 가 준 값**
 * 으로 골↔도움을 잇는다 — 대회·팀을 가리지 않고, 상대 팀 골까지.
 *
 * 값이 비싸다(경기당 1,400~1,600 play, 1,000개씩 2페이지). 그래서
 *  · 팀 일정 파일에만 적용한다(리그 전체 380경기에는 쓰지 않는다)
 *  · 끝난 경기는 한 번만 받고 `__assists` 표시를 이어받는다
 *  · 한 회차에 받을 경기 수를 제한해 여러 번에 걸쳐 채운다
 */
const ASSISTS_SOURCE = 'core-plays-v1';

/* "Assisted by Vinícius Júnior." / "… with a cross." / "… following a fast break."
   앞쪽 이름만 떼어 낸다. 이름에 마침표가 든 선수(J. 같은 이니셜)는 없다고
   봐도 되지만, 혹시 몰라 수식어 접속사도 함께 끊는다. */
const ASSIST_RE = /Assisted by\s+([^.]+?)(?:\s+with\s|\s+following\s|\s+after\s|\s+from\s|\.|$)/;

async function corePlayAssists(leagueSlug, eventId) {
  const out = [];
  let page = 1;
  let pageCount = 1;
  let ok = false;               // 응답을 한 번이라도 제대로 받았는가
  while (page <= pageCount && page <= 4) {
    const j = await get(
      `${CORE}/v2/sports/soccer/leagues/${leagueSlug}/events/${eventId}/competitions/${eventId}/plays?limit=1000&page=${page}`,
    );
    if (!j) break;
    ok = true;
    pageCount = Number(j.pageCount) || 1;
    for (const p of j.items ?? []) {
      if (p?.scoringPlay !== true) continue;
      // 승부차기는 득점 기록이 아니다 (연장은 4피리어드까지)
      if (Number(p?.period?.number) > 4) continue;
      const parts = Array.isArray(p.participants) ? p.participants : [];
      const a = parts.find((x) => String(x?.type ?? '').toLowerCase() === 'assister');
      if (!a) continue;
      const id = String(a?.athlete?.$ref ?? '').match(/athletes\/(\d+)/)?.[1];
      const name = (String(p?.text ?? '').match(ASSIST_RE)?.[1] ?? '').trim();
      if (!name && !id) continue;
      const sc = parts.find((x) => String(x?.type ?? '').toLowerCase() === 'scorer');
      const cv = Number(p?.clock?.value);
      out.push({
        clockValue: Number.isFinite(cv) ? cv : undefined,
        minute: parseInt(String(p?.clock?.displayValue ?? '').match(/(\d+)/)?.[1] ?? '0', 10),
        scorerId: String(sc?.athlete?.$ref ?? '').match(/athletes\/(\d+)/)?.[1],
        assist: name || undefined,
        assistId: id,
      });
    }
    page++;
    await sleep(120);
  }
  // 한 페이지도 못 받았으면 "도움 없음" 이 아니라 "모름" 이다 — 구분해서 돌려준다
  return ok ? out : null;
}

/** 종료 경기의 __goals 에 도움을 붙인다 */
async function enrichAssists(events, defaultLeague, budget = 12) {
  const todo = [];
  for (const ev of events) {
    const c = ev?.competitions?.[0];
    if (!c || c?.status?.type?.completed !== true) continue;
    if (c.__assists === true) continue;           // 이미 한 번 받아 본 경기

    const goals = Array.isArray(c.__goals) ? c.__goals : [];
    // PK·자책골에는 도움이 없다 — 그것만 남았으면 받을 이유가 없다
    const need = goals.some((g) => !g.ownGoal && !g.penalty && !g.assist);
    if (!need) { c.__assists = true; continue; }
    if (todo.length >= budget) break;
    todo.push(ev);
  }
  if (!todo.length) return;

  let fetched = 0;
  let none = 0;
  // 응답이 커서(경기당 1,400~1,600 play) 동시 3개까지만
  await pool(todo, 3, async (ev) => {
    const c = ev.competitions[0];
    const goals = Array.isArray(c.__goals) ? c.__goals : [];
    const lg = ev?.league?.slug ?? ev?.season?.slug ?? defaultLeague;
    if (!lg) return;

    const list = await corePlayAssists(lg, String(ev.id));
    fetched++;
    // 응답 자체를 못 받았으면 표시하지 않는다 — 다음 회차에 다시 시도한다
    if (list === null) return;
    let hits = 0;
    for (const a of list) {
      /* 시계 초값이 있으면 그것으로, 없으면 분+득점자 id 로 같은 골을 찾는다 */
      let g = a.clockValue !== undefined
        ? goals.find((x) => Number(x.clockValue) === a.clockValue)
        : undefined;
      if (!g && a.scorerId) g = goals.find((x) => x.scorerId === a.scorerId && Math.abs(x.minute - a.minute) <= 1);
      if (!g) g = goals.find((x) => x.minute === a.minute && !x.assist);
      if (!g || g.assist) continue;
      g.assist = a.assist;
      g.assistId = a.assistId;
      hits++;
    }
    c.__assists = true;
    if (!hits) none++;
  });
  if (fetched) console.log(`    도움 매칭 신규 ${fetched}경기 (매칭 0건 ${none})`);
}

/* ── 다음 경기 미리보기 (폼 + 상대전적) ─────────────────
 * "다음 경기" 화면에서 정작 궁금한 건 두 가지다 —
 * 두 팀이 요즘 어떤가(최근 5경기), 그리고 서로 만나면 어땠나(상대전적).
 *
 * 최근 5경기는 만들 필요가 없다. 경기 요약이 `lastFiveGames` 로
 * **양 팀 것을 한 번에** 준다(아직 안 치른 경기의 요약에도 들어 있다).
 * 상대전적은 우리 팀의 이번 시즌 일정 + 지난 시즌 일정에서 추린다.
 */
function compactGame(ev, teamId) {
  const c = ev?.competitions?.[0];
  const cs = c?.competitors ?? [];
  const h = cs.find((x) => x?.homeAway === 'home');
  const a = cs.find((x) => x?.homeAway === 'away');
  if (!h || !a) return null;
  const num = (v) => {
    const n = Number(v?.score?.displayValue ?? v?.score);
    return Number.isFinite(n) ? n : undefined;
  };
  return {
    id: String(ev.id),
    date: String(ev.date ?? ''),
    competition: String(ev?.league?.slug ?? ev?.season?.slug ?? ''),
    homeId: String(h?.team?.id ?? ''),
    awayId: String(a?.team?.id ?? ''),
    homeAbbr: String(h?.team?.abbreviation ?? ''),
    awayAbbr: String(a?.team?.abbreviation ?? ''),
    homeScore: num(h),
    awayScore: num(a),
    done: c?.status?.type?.completed === true,
    teamId,
  };
}

/**
 * 지난 시즌(들) 일정 — 상대전적에만 쓴다.
 *
 * 클럽은 한 시즌이면 충분하다(리그에서 해마다 두 번씩 만난다). 국가대표는
 * 한 상대를 몇 년에 한 번 만나므로 지난 시즌만 보면 거의 항상 0경기다 —
 * 그래서 여러 해를 거슬러 올라가 **역대 전적**으로 본다.
 */
async function prevSeasonGames(teamId, seasons = 1) {
  const years = Array.from({ length: seasons }, (_, i) => SEASON - 1 - i);
  const lists = await pool(years, 4, async (y) => {
    const j = await get(
      `${SITE_WEB}/apis/site/v2/sports/soccer/all/teams/${teamId}/schedule?season=${y}`,
    );
    return (j?.events ?? []).map((ev) => compactGame(ev, teamId)).filter((g) => g && g.done);
  });
  return lists.flat().filter(Boolean);
}

async function nextMatchPreview(events, teamId, national = false) {
  const upcoming = events
    .filter((e) => e?.competitions?.[0]?.status?.type?.completed !== true)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))[0];
  if (!upcoming) return undefined;

  const c = upcoming.competitions[0];
  const opp = (c?.competitors ?? []).find((x) => String(x?.team?.id ?? '') !== teamId);
  const oppId = String(opp?.team?.id ?? '');
  const lg = upcoming?.league?.slug ?? upcoming?.season?.slug ?? '';

  const [sum, older] = await Promise.all([
    lg ? get(`${SITE_WEB}/apis/site/v2/sports/soccer/${lg}/summary?event=${upcoming.id}`) : null,
    /* 클럽은 지난 두 시즌 + 이번 시즌 = 최근 세 시즌.
       한 시즌만 보면 리그에서 두 번 만난 기록뿐이라 "요즘 이 상대에게
       어떤가" 를 읽기에 표본이 너무 얇았다. */
    prevSeasonGames(teamId, national ? 12 : 2),
  ]);

  /* lastFiveGames 는 [{team:{id}, events:[…]}, …] 형태다 — 팀별로 나눠 담는다 */
  const lastFive = {};
  for (const blk of sum?.lastFiveGames ?? []) {
    const tid = String(blk?.team?.id ?? '');
    if (!tid) continue;
    lastFive[tid] = (blk?.events ?? []).map((g) => ({
      date: String(g?.gameDate ?? ''),
      score: String(g?.score ?? ''),
      result: String(g?.gameResult ?? '').toUpperCase().slice(0, 1),   // W / L / D
      atVs: String(g?.atVs ?? ''),
      opponent: String(g?.opponent?.abbreviation ?? g?.opponent?.displayName ?? ''),
      opponentId: String(g?.opponent?.id ?? ''),
      opponentName: String(g?.opponent?.displayName ?? ''),
      opponentLogo: String(g?.opponentLogo ?? g?.opponent?.logo ?? ''),
      competition: String(g?.competitionName ?? ''),
    }));
  }

  // 상대전적: 이번 시즌(이미 손에 있는 일정) + 지난 시즌
  const thisSeason = events
    .map((ev) => compactGame(ev, teamId))
    .filter((g) => g && g.done);
  const h2h = [...older, ...thisSeason]
    .filter((g) => g.homeId === oppId || g.awayId === oppId)
    .sort((a, b) => b.date.localeCompare(a.date));

  return {
    eventId: String(upcoming.id),
    opponentId: oppId,
    lastFive,
    h2h,
    /* 화면이 "최근 두 시즌" 과 "역대" 를 구분해 적을 수 있게 */
    h2hScope: national ? 'all' : 'recent',
    h2hSeasons: national ? 13 : 3,
  };
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
/** 대회 참가팀 id 집합 — "나가는 팀인지" 를 판단하는 유일한 근거 */
const teamsInCache = new Map();
function teamsIn(slug) {
  if (teamsInCache.has(slug)) return teamsInCache.get(slug);
  const p = (async () => {
    const j = await get(`${SITE}/apis/site/v2/sports/soccer/${slug}/teams`);
    const list = j?.sports?.[0]?.leagues?.[0]?.teams ?? [];
    return new Set(list.map((t) => String(t?.team?.id ?? '')).filter(Boolean));
  })();
  teamsInCache.set(slug, p);
  return p;
}

/** 대회 슬러그 → 어두운 배경용 리그 앰블럼 주소 (core 리그 객체가 준다) */
const leagueLogoCache = new Map();
function leagueLogoOf(slug) {
  if (!slug) return Promise.resolve(undefined);
  if (leagueLogoCache.has(slug)) return leagueLogoCache.get(slug);
  const p = (async () => {
    const j = await get(`${CORE}/v2/sports/soccer/leagues/${slug}`);
    const logos = Array.isArray(j?.logos) ? j.logos : [];
    const dark = logos.find((l) => (l?.rel ?? []).includes('dark'));
    const href = dark?.href ?? logos[0]?.href;
    return href ? String(href) : undefined;
  })();
  leagueLogoCache.set(slug, p);
  return p;
}

async function koreanPlayer(id, nameKo, carriedPhoto) {
  const prof = await get(`${CORE}/v2/sports/soccer/athletes/${id}`);
  if (!prof) return null;

  /* ⚠️ core 선수 응답에는 `team` 키가 없다 — `defaultTeam` / `defaultLeague` 다.
     예전 코드가 `prof.team.$ref` 를 보다가 전부 빈 값이 됐고, 그래서 리그를
     못 구해 대회 기록 조회를 통째로 건너뛰었다(손흥민 stats: []).
     실측: defaultTeam=.../soccer/teams/18966, defaultLeague=.../leagues/usa.1 */
  const teamRef = prof?.defaultTeam?.$ref ?? prof?.team?.$ref;
  const team = teamRef ? await get(teamRef) : null;
  const clubId = String(team?.id ?? '0');
  const club = String(team?.displayName ?? team?.name ?? '');

  const league =
    String(prof?.defaultLeague?.$ref ?? '').match(/leagues\/([\w.]+)/)?.[1] ??
    String(teamRef ?? '').match(/leagues\/([\w.]+)/)?.[1] ??
    '';
  const leagueName = String(team?.groups?.name ?? '') || league;
  if (!league) console.error(`  ! ${nameKo}(${id}) 소속 리그를 못 찾음 — 대회 기록 건너뜀`);

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
    if (s) { stats.push(s); continue; }
    /* 기록이 없다고 줄을 빼면 "이 선수는 유럽대항전에 안 나간다" 와
       "나가는 팀인데 아직 출전이 없다" 가 구분되지 않는다.
       소속 클럽이 그 대회 참가팀이면 0경기로 남겨 둔다. */
    if (clubId !== '0' && (await teamsIn(lg)).has(clubId)) {
      stats.push({
        competition: lg, label,
        apps: 0, starts: 0, minutes: 0, goals: 0, assists: 0, yellow: 0, red: 0,
      });
    }
  }

  /*
   * 최근 3경기.
   *
   * ⚠️ 예전에는 `common/v3/.../athletes/{id}/gamelog` 을 썼다. 그 엔드포인트는
   * **죽었다** — 지금은 어떤 리그·선수로 불러도 HTTP 500 {"code":2400} 이다
   * (2026-09-17 확인, ?season 을 붙여도 같다). 그래서 21명 전원 최근 경기가
   * 0건이었고 호버 패널이 통째로 비어 있었다.
   * core eventlog 로 옮겼다 — 모든 리그에서 살아 있고, 경기별 statistics 가
   * 출전 여부·출전 시간·골·도움을 한 번에 준다(scripts/lib/athlete.mjs).
   */
  const recent = league
    ? await athleteRecent({
      get, league, season: SEASON, athleteId: String(id),
      meta: await clubMeta(clubId), take: 3,
    })
    : [];
  if (league && !recent.length) note(`${nameKo}(${id}) 최근 경기`, 'eventlog 에서 출전 경기를 못 찾음');

  /* 사진은 등급으로 고른다 (컷아웃 > 썸네일 > ESPN > 위키).
     지난 회차 값도 후보다 — 그래야 한도에 걸린 회차에 사진이 사라지지 않고,
     예전에 박힌 위키 경기 사진이 컷아웃으로 올라간다. */
  const enName = String(prof?.displayName ?? nameKo);
  let best = betterPhoto(carriedPhoto ?? null, await sportsdbPhoto(enName, club));
  if (rankOfBest(best) < 2 && league && clubId !== '0') {
    const rosterPhoto = (await teamPhotos(league, clubId)).get(String(id))?.photo;
    if (rosterPhoto) best = betterPhoto(best, { url: rosterPhoto, kind: 'espn' });
  }
  if (rankOfBest(best) < 2) {
    const direct = await espnHeadshot(id);
    if (direct) best = betterPhoto(best, { url: direct, kind: 'espn' });
  }
  if (!best) {
    const wiki = await wikipediaPhoto(enName);
    if (wiki) best = { url: wiki, kind: 'wiki' };
  }
  const photo = best?.url;
  const photoKind = best?.kind;

  /* 대회 앰블럼도 API 에서 가져온다 — 리그 로고 id 를 코드에 적어 두면
     새 리그(그리스·덴마크·벨기에…)로 이적할 때마다 표가 비어 버린다.
     core 리그 객체가 logos[] 를 주고, rel:['full','dark'] 가 어두운 배경용이다. */
  const leagueLogo = await leagueLogoOf(league);
  for (const st of stats) st.logo = await leagueLogoOf(st.competition);

  return {
    id, nameKo,
    name: String(prof?.displayName ?? nameKo),
    pos,
    age: Number(prof?.age ?? 0) || 0,
    clubId, club, league, leagueName, leagueLogo,
    photo, photoKind,
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
      /* 골↔도움은 core /plays 가 실제로 알려 준다(participants type=assister).
         경기당 페이지가 커서 회차를 나눠 채운다 — 끝난 경기는 한 번이면 끝. */
      await enrichAssists(events, t.league, 10);
      await enrichPlayerStats(events, t.league, await prevStatsMap(`schedule-${t.slug}.json`), 40, true);

      /* 이 팀이 나가는 대회의 라운드 목록을 확보한다.
         컵은 순위표가 없어서 표를 만들 수가 없고, 대신 "몇 라운드부터 나와서
         어디까지 갔는지" 를 그리려면 그 대회의 라운드 순서가 필요하다.
         ESPN 스코어보드가 calendar 로 그대로 준다. */
      const comps = new Map();
      for (const ev of events) {
        const lg = ev?.league?.slug ?? ev?.season?.slug;
        if (lg && !comps.has(lg)) comps.set(lg, ev?.date);
      }
      await pool([...comps.entries()], 4, ([lg, d]) => ensureRounds(lg, d));
      const rounds = {};
      for (const lg of comps.keys()) if (roundCal.has(lg)) rounds[lg] = roundCal.get(lg);

      const preview = await nextMatchPreview(events, t.id, t.national === true);

      await save(`schedule-${t.slug}.json`, {
        events, team: t.id, rounds, preview,
        goalsSource: GOALS_SOURCE, statsSource: STATS_SOURCE, assistsSource: ASSISTS_SOURCE,
        fetchedAt: new Date().toISOString(),
      });
    } else {
      console.error(`  ! ${t.slug}: 이벤트 0건 — 기존 파일 유지`);
    }
    await sleep(400);
  }

  if (wants('slow')) for (const lg of LEAGUES) {
    // soccer 순위는 반드시 /apis/v2/ 경로 (site/v2 는 빈 객체를 반환한다)
    const standings = await get(`${SITE}/apis/v2/sports/soccer/${lg}/standings`);
    if (!standings) note(`${lg} 순위표`, 'ESPN standings 응답 없음');
    /* ⚠️ 이 파일은 앱이 읽지 않는다 — league-{lg}.json 과 table-{lg}.json 이
       standings 를 이미 품고 있다. 그래도 계속 쓴다: 10분마다 도는 봇이
       (아직 옛 코드로) 이 파일을 다시 만드는 동안 지우면 리베이스가 매번
       충돌한다. 제거는 새 코드가 배포된 뒤 별도 커밋에서 한다. */
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

    /* 20팀 × 2요청. 한 팀씩 줄 세우면 팀 수만큼 왕복을 기다린다 —
       리그 워크플로우가 길어지던 가장 큰 이유였다. 서로 무관한 요청이라
       동시에 굴리고, 합치는 순서만 팀 목록 순서로 고정한다. */
    const perTeam = await pool(ids, 6, async (id) => {
      const base = `${SITE_WEB}/apis/site/v2/sports/soccer/${lg}/teams/${id}/schedule`;
      return Promise.all([get(base), get(`${base}?fixture=true`)]);
    });

    const seen = new Set();
    const events = [];
    for (const pair of perTeam) {
      for (const src of pair ?? []) {
        for (const ev of src?.events ?? []) {
          const eid = String(ev?.id ?? '');
          if (eid && !seen.has(eid)) { seen.add(eid); events.push(ev); }
        }
      }
    }
    events.sort((a, b) => String(a.date).localeCompare(String(b.date)));

    if (events.length) {
      const prevMap = await prevGoalsMap(`league-${lg}.json`);
      await enrichGoals(events, lg, prevMap);
      /* 리그 파일은 순위표·대회별 공격포인트에 쓰인다 — 선수별 골·도움
         합계만 있으면 되고, 출전 구간(withWindows)은 필요 없다.
         true 로 두면 도움이 있는 경기마다 요청이 2건 넘게 더 붙는다. */
      await enrichPlayerStats(events, lg, await prevStatsMap(`league-${lg}.json`), 120, false);
      const now = new Date().toISOString();
      await save(`league-${lg}.json`, {
        league: lg,
        events,
        standings,
        teams: ids.length,
        goalsSource: GOALS_SOURCE,
        statsSource: STATS_SOURCE,
        fetchedAt: now,
      });
      /* 순위·승무패만 필요한 화면(일정 탭 히어로)을 위한 경량본.
         같은 buildTable 을 돌릴 수 있게 모양을 맞춰 둔다. */
      await save(`table-${lg}.json`, {
        league: lg,
        events: events.map(slimEvent).filter(Boolean),
        standings,
        teams: ids.length,
        fetchedAt: now,
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
    /* 최근 16경기만 모은다. 단 **클럽 친선경기는 제외**한다 —
       프리시즌 친선전은 포메이션·라인업을 실험하는 자리라 그대로 섞이면
       "가장 많이 쓴 포메이션" 이 왜곡된다(첼시가 4-4-2/3-4-3 친선전 때문에
       실제 주 포메이션이 아닌 값으로 잡혔다). 국가대표 친선전은 실제
       A매치라 그대로 둔다. */
    const done = (sched?.events ?? [])
      .filter((e) => e?.competitions?.[0]?.status?.type?.completed)
      .filter((e) => (e?.league?.slug ?? e?.season?.slug) !== 'club.friendly')
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 16);

    const lineups = {};
    const athletes = {};
    /* 경기 16건이 서로 무관하다 — 한 건씩 기다리면 팀마다 16번의 왕복이
       그대로 시간이 된다(팀이 늘어날수록 선형으로 늘어난다). */
    await pool(done, 4, async (ev) => {
      const lg = ev?.league?.slug ?? ev?.season?.slug ?? t.league;
      const sum = await get(`${SITE_WEB}/apis/site/v2/sports/soccer/${lg}/summary?event=${ev.id}`);
      const mine = (sum?.rosters ?? []).find((r) => String(r?.team?.id ?? '') === t.id);
      if (!mine?.roster?.length) return;

      const stat = (e, name) => {
        const hit = (e?.stats ?? []).find((x) => x?.name === name);
        const v = Number(hit?.value ?? hit?.displayValue);
        return Number.isFinite(v) ? v : 0;
      };
      const pos = (abbr) => posFromAbbr(abbr);

      const entries = [];
      for (const e of mine.roster) {
        const id = String(e?.athlete?.id ?? '');
        if (!id) continue;                       // eslint-disable-line no-continue
        /* 교체 시각은 여기(요약)에 없다 — subbedIn/subbedOut 이 불리언뿐이다.
           실제 시각은 아래에서 core 로스터로 채운다. */
        entries.push([
          id,
          Number(e?.formationPlace ?? 0) || 0,
          e?.starter === true,
          null,
          null,
          stat(e, 'totalGoals'),
          stat(e, 'goalAssists'),
          // 'CD-L' · 'AM-R' 처럼 좌우까지 들어 있는 ESPN 자리 약어
          String(e?.position?.abbreviation ?? '') || undefined,
          // 경고·퇴장 (요약 로스터가 선수별로 준다)
          stat(e, 'yellowCards'),
          stat(e, 'redCards'),
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
        /* core 경기 로스터로 (1) 실제 교체 시각과 (2) 자리 약어를 채운다.
           요약 쪽에는 교체 시각이 아예 없고, 대회에 따라 자리 약어도 없다
           (첼시가 그 경우였다 — 그래서 배치가 통째로 틀어졌다). */
        const info = await coreLineupInfo(lg, ev.id, t.id);
        const hasMinutes = info.size > 0;
        if (info.size) {
          let subs = 0;
          for (const x of entries) {
            const it = info.get(x[0]);
            if (!it) continue;
            x[3] = it.inMin ?? null;
            x[4] = it.outMin ?? null;
            if (it.inMin != null || it.outMin != null) subs++;
            if (!x[7] && it.abbr) {
              x[7] = it.abbr;
              if (athletes[x[0]]) athletes[x[0]].pos = posFromAbbr(it.abbr);
            }
          }
          if (!subs) console.log(`    ${t.slug} ${ev.id}: 교체 시각 0건`);
        }
        lineups[String(ev.id)] = {
          teamId: t.id,
          formation: String(mine?.formation ?? ''),
          entries,
          hasStats: true,
          hasMinutes,
        };
      }
    });

    if (Object.keys(lineups).length) {
      const photos = await teamPhotos(t.league, t.id);
      const carried = await prevPhotos(`squad-${t.slug}.json`);
      let fromEspn = 0;
      let fromTsdb = 0;
      let fromWiki = 0;
      let gotMinutes = 0;
      /* 선수 한 명당 (사진 + 시즌 출전시간) 이라 30명이면 왕복 60번이다.
         여기도 줄 세울 이유가 없다. */
      await pool(Object.keys(athletes), 6, async (id) => {
        const meta = photos.get(id);
        // 경기 요약이 자리 약어를 안 준 팀은 시즌 포지션이라도 남겨 둔다
        if (meta?.posAbbr) athletes[id].posAbbr = meta.posAbbr;
        if (meta?.age) athletes[id].age = meta.age;

        /*
         * 사진은 **등급으로** 고른다 — 컷아웃 > 썸네일 > ESPN > 위키.
         * 지난 회차 값을 후보에 같이 넣어 두는 것이 핵심이다:
         *  · TheSportsDB 가 한도에 걸린 회차에도 지난 컷아웃을 유지하고
         *  · 예전에 위키 사진이 박혔던 선수는 컷아웃이 잡히는 회차에 올라간다
         * (예전 코드는 "직접 받은 게 있으면 그걸, 없으면 이어받기" 라서
         *  한 번 박힌 위키 경기 사진이 영원히 남았다.)
         */
        const [tsdb, espn, mins] = await Promise.all([
          sportsdbPhoto(athletes[id].name, t.name),
          meta?.photo
            ? Promise.resolve({ url: meta.photo, kind: 'espn' })
            : espnHeadshot(id).then((u) => (u ? { url: u, kind: 'espn' } : undefined)),
          athleteSeasonMinutes(t.league, id),
        ]);

        let best = betterPhoto(carried.get(id) ?? null, tsdb);
        best = betterPhoto(best, espn);
        if (!best) {
          const wiki = await wikipediaPhoto(athletes[id].name);
          if (wiki) best = { url: wiki, kind: 'wiki' };
        }
        if (best) {
          athletes[id].photo = best.url;
          athletes[id].photoKind = best.kind;
          if (best.kind === 'cutout' || best.kind === 'thumb') fromTsdb++;
          else if (best.kind === 'espn') fromEspn++;
          else fromWiki++;
        }
        if (mins) { athletes[id].minutesSeason = mins; gotMinutes++; }
      });
      await save(`squad-${t.slug}.json`, {
        team: t.id, lineups, athletes,
        codeVersion: CODE_VERSION,
        fetchedAt: new Date().toISOString(),
      });
      console.log(
        `    ${t.slug}: 라인업 ${Object.keys(lineups).length}경기 · 선수 ${Object.keys(athletes).length}명` +
          ` (출전시간 ${gotMinutes}명 · 사진 SportsDB ${fromTsdb} + ESPN ${fromEspn} + 위키 ${fromWiki})` +
          (tsdbLimit.broken ? ' · ⚠ SportsDB 한도 — 다음 회차에 이어 채움' : ''),
      );
    } else {
      console.error(`  ! ${t.slug}: 라인업 0경기 — 기존 파일 유지`);
    }
  }

  /* ── 퓨처 리소스 (slow) ───────────────────────────────
     조항 선수들의 시즌 기록. 앱은 프록시가 없으면 이 파일을 읽는데,
     지금까지 아무도 만들지 않아 카드가 전부 "–" 로 비어 있었다. */
  if (wants('slow')) {
    /*
     * ⚠️ 이 블록은 **한 번도 파일을 만든 적이 없었다.** 원인은 위 코리안리거와
     * 같다 — `common/v3/.../athletes/{id}/gamelog` 이 죽어서(HTTP 500
     * {"code":2400}) `rows` 가 늘 비었고, `if (!rows.length) return` 으로
     * 전원 탈락했다. 그래서 `/data/future.json` 이 404 였고, 프록시가 없는
     * 배포에서는 Future Resources 카드가 전부 "–" 였다.
     *
     * 시즌 합계는 core 시즌 통계에서, 최근 경기는 eventlog 에서 받는다.
     * 덤으로 출전수가 정확해진다 — 예전 `apps = rows.length` 는 **명단에만
     * 든 경기까지** 세서 과대 집계였다(코리안리거에서 이미 고친 문제인데
     * 이 경로에는 반영되지 않았다).
     */
    const players = {};
    await pool(FUTURE, 3, async ([id, lg]) => {
      /* 현 소속팀 — 선수가 옮겨도 화면이 따라가게 core 프로필에서 받는다 */
      const prof = await get(`${CORE}/v2/sports/soccer/athletes/${id}`);
      const teamRef = prof?.defaultTeam?.$ref ?? prof?.team?.$ref;
      const team = teamRef ? await get(teamRef) : null;
      const clubId = String(team?.id ?? '0');

      /* 지금 뛰는 리그는 프로필이 알려 준다 — 큐레이션 파일의 리그가
         낡아도(이적) 화면이 따라간다. 없으면 적어 둔 값을 쓴다. */
      const league =
        String(prof?.defaultLeague?.$ref ?? '').match(/leagues\/([\w.]+)/)?.[1] ?? lg;

      const totals = seasonTotals(await get(seasonStatsUrl(league, SEASON, id)));
      const recent = await athleteRecent({
        get, league, season: SEASON, athleteId: String(id),
        meta: await clubMeta(clubId), take: 3,
      });

      if (!totals.apps && !recent.length) return;   // 이번 시즌 기록이 아직 없다

      players[id] = {
        club: team?.displayName ? String(team.displayName) : undefined,
        league,
        apps: totals.apps,
        starts: totals.starts,
        goals: totals.goals,
        assists: totals.assists,
        minutes: totals.minutes,
        recent: recent.map((r) => ({
          date: r.date,
          opponent: r.opponent,
          score: r.score || undefined,
          goals: r.goals,
          assists: r.assists,
        })),
      };
    });
    if (Object.keys(players).length) {
      await save('future.json', { players, season: SEASON, fetchedAt: new Date().toISOString() });
      console.log(`    퓨처 리소스 ${Object.keys(players).length}/${FUTURE.length}명`);
    } else if (await fileExists('future.json')) {
      note('퓨처 리소스', '0명 — 기존 파일 유지');
    } else {
      note('퓨처 리소스', '0명이고 기존 파일도 없음 — 화면이 빈칸이 된다');
    }
  }

  /* ── 코리안리거 (slow) ───────────────────────────────── */
  if (wants('slow')) {
    const carried = await prevPhotos('koreans.json');
    /* 선수 18명이 서로 무관하다 — 한 명씩 기다릴 이유가 없다.
       순서는 명단 순서 그대로 유지한다(화면 정렬은 앱이 따로 한다). */
    const got = await pool(KOREANS, 4, ([id, nameKo]) =>
      koreanPlayer(id, nameKo, carried.get(String(id))));
    const players = got.filter(Boolean);
    if (players.length) {
      await save('koreans.json', { players, season: SEASON, fetchedAt: new Date().toISOString() });
      console.log(`    코리안리거 ${players.length}명`);
    } else if (await fileExists('koreans.json')) {
      note('코리안리거', '0명 — 기존 파일 유지');
    } else {
      note('코리안리거', '0명이고 기존 파일도 없음');
    }
  }

  await save(ONLY === 'slow' ? 'meta-slow.json' : 'meta.json', {
    generatedAt: new Date().toISOString(),
    only: ONLY,
    codeVersion: CODE_VERSION,
  });

  if (problems.length) {
    console.error(`\n⚠ 문제 ${problems.length}건`);
    for (const p of problems) console.error(`  · ${p}`);
    /* 산출물이 아예 없는 경우만 실패로 본다 — 한 선수가 빠진 것으로
       워크플로를 빨갛게 만들면 아무도 안 보게 된다. */
    const fatal = problems.filter((p) => p.includes('기존 파일도 없음') || p.includes('빈칸'));
    if (fatal.length) {
      console.error('\n✗ 필수 산출물이 없다 — 실패로 처리한다');
      process.exitCode = 1;
    }
  }
  console.log('완료');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
