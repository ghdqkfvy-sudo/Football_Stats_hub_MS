import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import './styles/global.css';
/* 좁은 화면 전용 덮어쓰기 — global.css 뒤에 와야 이긴다 */
import './styles/mobile.css';
/* 전환 애니메이션 — 모든 규칙이 reduced-motion 에서 꺼진다 */
import './styles/motion.css';
/* 스크롤 막대(MiniBar)의 데스크톱 모양 — mobile.css 의 폰 모양 위에 얹는다 */
import './styles/topbar.css';
import { OUR_TEAM_IDS, TARGETS, getTarget, subtitleParts, type TargetId } from './config/targets';
import type { Match } from './lib/types';
import { HAS_PROXY, loadSchedule, type Source } from './lib/api';
import { invalidateFeeds } from './lib/feed';
import { mergeMatches, pollDelay } from './lib/refresh';
import { ScheduleTab } from './tabs/ScheduleTab';
import { StandingsTab } from './tabs/StandingsTab';
import { PlayersTab } from './tabs/PlayersTab';
import { KoreansTab } from './tabs/KoreansTab';
import { NewsTab } from './tabs/NewsTab';
import { FutureTab } from './tabs/FutureTab';
import { PaletteProvider } from './lib/palette';
import { seasonOptions } from './lib/kst';
import { ChipCrest, Crest, CrestGlowScope } from './components/Crest';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SummaryTab } from './tabs/SummaryTab';
import { dirOf, type SwapDir } from './components/Swap';
import { futureFor } from './data/future';
import { formatRoute, parseRoute, rememberRoute, startHash } from './lib/route';
import { MiniBar } from './components/MiniBar';
import { BgArt } from './components/BgArt';
import { RefreshSheet } from './components/RefreshSheet';
import { useLongPress } from './lib/motion';
import { useIsMobile } from './lib/useMedia';
import bgSummary from './assets/bg-summary.webp';

type TabId = 'schedule' | 'standings' | 'players' | 'future' | 'news' | 'koreans';

/* short: 폰에서 탭 5개가 한 줄에 다 들어가도록 쓰는 짧은 이름(styles/mobile.css).
   넓은 화면에서는 label 만 보인다. */
const CLUB_TABS: { id: TabId; label: string; short?: string }[] = [
  { id: 'schedule', label: '일정' },
  { id: 'standings', label: '팀 순위', short: '순위' },
  { id: 'players', label: '선수 스탯', short: '선수' },
  { id: 'future', label: 'Future Resources', short: 'Future' },
  { id: 'news', label: '뉴스' },
];

const NATIONAL_TABS: { id: TabId; label: string; short?: string }[] = [
  { id: 'koreans', label: '코리안리거' },
  { id: 'schedule', label: '경기 일정' },
  { id: 'news', label: '뉴스' },
];

/* 시즌은 오늘 날짜(KST)에서 계산한다 — 박아 두면 해가 바뀌는 순간 과거를 가리킨다 */
const SEASONS = seasonOptions();
const NO_MATCHES: Match[] = [];

/* 첫 화면 — 주소가 있으면 그 화면, 없으면 마지막으로 본 화면(lib/route.ts) */
const START = parseRoute(startHash());

/**
 * 데이터가 언제 것인지 배지에 그대로 적는다.
 * 순위가 안 맞아 보일 때 "언제 뜬 값인지" 가 제일 먼저 필요한 정보다.
 */
function ago(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

export default function App() {
  /**
   * 어느 화면인가 — 요약이거나, 팀 하나거나.
   *
   * Summary 는 팀에 속하지 않는 화면이라 팀 탭 목록에 넣을 수 없다.
   * 팀 스위처 왼쪽의 칩으로 두고, 앱에 들어오면 여기서 시작한다.
   */
  /* 첫 화면은 주소(#/chelsea/standings)가 말해 준다 — lib/route.ts */
  /* 숨은 "지금 갱신" — 갱신 시각 배지를 길게 누르면 열린다 */
  const [refreshOpen, setRefreshOpen] = useState(false);
  const closeRefresh = useCallback(() => setRefreshOpen(false), []);
  const refreshPress = useLongPress(() => setRefreshOpen(true));

  const [view, setView] = useState<'summary' | 'team'>(() =>
    (TARGETS.some((t) => t.id === START.targetId) ? 'team' : 'summary'));
  const [targetId, setTargetId] = useState<TargetId>(() => {
    const id = START.targetId;
    return (TARGETS.some((t) => t.id === id) ? id : 'real-madrid') as TargetId;
  });
  const target = getTarget(targetId);
  const summary = view === 'summary';

  /*
   * 메인 영역 전환의 방향(styles/motion.css).
   * 탭은 순서가 있으니 오른쪽 탭으로 가면 오른쪽에서, 왼쪽 탭이면 왼쪽에서
   * 들어온다. 팀·Summary 전환은 "다른 화면" 이라 아래에서 떠오른다.
   */
  const [motion, setMotion] = useState<SwapDir>('fade');

  /* 다른 화면으로 넘어가면 맨 위에서 시작한다 — Summary 맨 아래 "팀 바로가기" 를
     누르면 예전에는 새 팀 화면의 한가운데(같은 스크롤 깊이)에 떨어졌다 */
  const toTop = () => {
    if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  };

  /** 팀을 고르면 그 팀 화면으로 넘어간다 */
  const openSummary = useCallback(() => {
    if (view === 'summary') return;
    setMotion('rise');
    setView('summary');
    toTop();
  }, [view]);
  /*
   * ⚠️ 예전에는 시즌을 고르는 단추가 두 개 있었다. 그런데 그 값은 헤더
   * 글자에만 쓰여서, 다음 시즌을 눌러도 라벨만 바뀌고 일정·순위는 그대로였다
   * — 사용자를 속이는 UI 다. 시즌별 조회는 아직 없으므로, 지금 시즌을
   * 그냥 적는다. (스냅샷·앱 모두 오늘 날짜로 시즌을 계산한다 — lib/kst.ts)
   */
  const season = SEASONS[0].label;

  /* 조항 선수가 한 명도 없는 팀(리버풀)에는 Future 탭을 두지 않는다 —
     눌러 봐야 "등록되어 있지 않습니다" 뿐이다 */
  const tabs = useMemo(
    () => (target.kind === 'club'
      ? CLUB_TABS.filter((t) => t.id !== 'future' || futureFor(target.espnTeamId).length > 0)
      : NATIONAL_TABS),
    [target.kind, target.espnTeamId],
  );
  /* 고른 탭이 이 팀에 없으면(클럽 → 대한민국) 첫 탭을 보여 준다 — 상태를 고치는
     이펙트 대신 계산으로. 클럽으로 돌아오면 고른 탭이 그대로 살아 있다. */
  const [tabPick, setTab] = useState<TabId>(() => (START.tab as TabId | null) ?? tabs[0].id);
  const tab = tabs.some((t) => t.id === tabPick) ? tabPick : tabs[0].id;

  /*
   * 일정 탭에서 바로 띄울 경기 — Summary 의 매치데이 히어로를 누르면 그 팀 일정 탭으로
   * 넘어가 **그 경기**가 히어로·캘린더에 선택된 채로 열린다. 일정 탭이 받아 쓰면 지운다.
   */
  const [focusMatch, setFocusMatch] = useState<{ team: TargetId; id: string } | null>(null);
  const clearFocusMatch = useCallback(() => setFocusMatch(null), []);

  /** 팀을 고르면 그 팀 화면으로 넘어간다. focus 가 있으면 일정 탭의 그 경기로 */
  const openTeam = useCallback((id: TargetId, focus?: { matchId: string }) => {
    if (focus) {
      setFocusMatch({ team: id, id: focus.matchId });
      setTab('schedule');
    } else if (id === targetId && view === 'team') {
      return;
    }
    setMotion('rise');
    setTargetId(id);
    setView('team');
    toTop();
  }, [targetId, view]);
  const goTab = useCallback((id: TabId) => {
    if (id === tab) return;
    setMotion(dirOf(tabs.findIndex((t) => t.id === tab), tabs.findIndex((t) => t.id === id)));
    setTab(id);
  }, [tabs, tab]);

  /* 헤더 탭 밑줄 — 고른 탭 아래로 미끄러진다(motion.css .tabs__ink) */
  const tabsRef = useRef<HTMLElement>(null);
  const [ink, setInk] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const nav = tabsRef.current;
    if (!nav) { setInk(null); return; }
    const place = () => {
      const on = nav.querySelector<HTMLElement>('.tab[aria-selected="true"]');
      if (!on) return;
      /* 탭 글자 폭만큼(양옆 여백 제외) — 예전 ::after 와 같은 길이 */
      const pad = on.offsetWidth > 60 ? 10 : on.offsetWidth * 0.14;
      setInk({ x: on.offsetLeft + pad - nav.scrollLeft, w: on.offsetWidth - pad * 2 });
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(nav);
    nav.addEventListener('scroll', place, { passive: true });
    return () => { ro.disconnect(); nav.removeEventListener('scroll', place); };
  }, [tab, tabs, summary]);

  /*
   * 화면 상태 → 주소. 사용자가 옮겨 다닐 때마다 기록을 하나씩 쌓아
   * 폰의 뒤로 가기가 직전 화면으로 돌아가게 한다(첫 진입은 바꿔치기만).
   * 뒤로/앞으로 가기로 온 변화는 이미 주소가 맞으므로 다시 쌓지 않는다.
   */
  useEffect(() => {
    const want = formatRoute(summary ? null : targetId, summary ? null : tab);
    rememberRoute(want);
    if (location.hash !== want) {
      if (!location.hash || location.hash === '#') history.replaceState(null, '', want);
      else history.pushState(null, '', want);
    }
    const label = tabs.find((t) => t.id === tab)?.label;
    document.title = summary ? 'MS Stats Hub' : `${target.name} · ${label} — MS Stats Hub`;
  }, [summary, targetId, tab, tabs, target.name]);

  /* 주소 → 화면 상태 (뒤로/앞으로 가기, 링크로 연 해시가 바뀔 때) */
  useEffect(() => {
    const onPop = () => {
      const r = parseRoute();
      setMotion('fade');
      if (r.targetId && TARGETS.some((t) => t.id === r.targetId)) {
        setTargetId(r.targetId as TargetId);
        setView('team');
        if (r.tab) setTab(r.tab as TabId);
      } else {
        setView('summary');
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  /* 마지막으로 일정을 받은 시각 (아래 자동 갱신) */
  const lastLoad = useRef(0);
  /*
   * 일정은 **어느 팀 것인지** 와 함께 들고 있는다. 화면에 쓰는 matches·loading 은
   * 거기서 계산한다 — 팀을 바꾸는 순간 이전 팀 일정은 저절로 안 보이고(다음 경기가
   * 잘못 잡히지 않는다), 이펙트 안에서 상태를 비우고 켜는 단계가 필요 없다.
   */
  const [sched, setSched] = useState<{ team: string; matches: Match[] }>({ team: '', matches: [] });
  const [source, setSource] = useState<Source>('none');
  const [fetchedAt, setFetchedAt] = useState<string>('');
  const loading = sched.team !== target.espnTeamId;
  const matches = loading ? NO_MATCHES : sched.matches;

  useEffect(() => {
    let alive = true;
    const team = target.espnTeamId;
    lastLoad.current = Date.now();
    loadSchedule(team).then((r) => {
      if (!alive) return;
      setSched({ team, matches: r.data });
      setSource(r.source);
      setFetchedAt(r.fetchedAt);
    });
    return () => {
      alive = false;
    };
  }, [target.espnTeamId]);

  /*
   * 켜 둔 채로 시간이 지나도 화면이 맞게 — 다시 받는 두 경우.
   *  1) 경기 시간대(진행 중, 킥오프 ±)에는 주기적으로 (lib/refresh.ts)
   *  2) 다른 앱에 갔다가 돌아왔을 때 (1분 넘게 지났으면)
   * 득점 기록은 이어 붙여 깜빡이지 않게 한다(mergeMatches).
   * 받아 둔 피드도 잊어서, 다음에 여는 탭(순위·선수)이 새 값을 받는다.
   */
  const refresh = useCallback(() => {
    lastLoad.current = Date.now();
    invalidateFeeds();
    const team = target.espnTeamId;
    loadSchedule(team).then((r) => {
      if (r.source === 'none') return;   // 실패 — 그대로 둔다
      /* 그새 팀이 바뀌었으면 버린다 */
      setSched((s) => (s.team === team ? { team, matches: mergeMatches(s.matches, r.data) } : s));
      setSource(r.source);
      setFetchedAt(r.fetchedAt);
    });
  }, [target.espnTeamId]);

  const delay = pollDelay(matches, HAS_PROXY);
  useEffect(() => {
    if (delay === null) return;
    const id = setInterval(() => { if (!document.hidden) refresh(); }, delay);
    return () => clearInterval(id);
  }, [delay, refresh]);

  useEffect(() => {
    const onVis = () => {
      if (!document.hidden && Date.now() - lastLoad.current > 60_000) refresh();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [refresh]);

  const onGoalsLoaded = useCallback((id: string, goals: Match['goals']) => {
    setSched((s) => ({ ...s, matches: s.matches.map((m) => (m.id === id ? { ...m, goals, goalsLoaded: true } : m)) }));
  }, []);

  /* 클럽 스위처가 오른쪽 끝까지 스크롤됐는지 — 흐림(마스크)을 끄는 기준 */
  const switchRef = useRef<HTMLDivElement>(null);
  /*
   * 좁은 화면에서는 클럽 줄과 국가대표 줄을 한 줄 가로 스크롤로 합친다
   * (styles/mobile.css). 그러면 리버풀·대한민국처럼 오른쪽 끝 팀을 고르면
   * 그 칩이 화면 밖에 있게 된다 — 고른 칩을 가운데로 데려온다.
   * 넓은 화면에서는 줄이 넘치지 않으므로 아무 일도 하지 않는다.
   * 페이지 전체를 움직이는 scrollIntoView 대신 이 줄만 가로로 민다.
   */
  const rowRef = useRef<HTMLDivElement>(null);
  const [switchEnd, setSwitchEnd] = useState(true);
  const syncSwitchEnd = useCallback(() => {
    const el = switchRef.current;
    if (!el) return;
    setSwitchEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
  }, []);
  useLayoutEffect(() => {
    syncSwitchEnd();
    const el = switchRef.current;
    if (!el) return;
    const ro = new ResizeObserver(syncSwitchEnd);
    ro.observe(el);
    return () => ro.disconnect();
  }, [syncSwitchEnd, targetId]);

  /* 고른 칩을 스위처 줄 가운데로 (줄이 넘칠 때만 = 좁은 화면) */
  useEffect(() => {
    const row = rowRef.current;
    if (!row || row.scrollWidth <= row.clientWidth + 1) return;
    const pill = row.querySelector<HTMLElement>('.pill[aria-pressed="true"]');
    if (!pill) return;
    const offset = pill.getBoundingClientRect().left - row.getBoundingClientRect().left;
    row.scrollLeft += offset - (row.clientWidth - pill.offsetWidth) / 2;
  }, [targetId, summary]);

  /*
   * 폰: 헤더가 화면 위로 완전히 사라지면 48px 미니 막대를 띄운다
   * (components/MiniBar). 헤더 자체를 sticky 로 줄이면 높이가 바뀌는 순간
   * 본문이 튀어 스크롤 위치가 흔들린다 — 그래서 별도의 고정 막대를 겹친다.
   */
  const mobile = useIsMobile();
  const hdrRef = useRef<HTMLElement>(null);
  const [hdrOut, setHdrOut] = useState(false);
  useEffect(() => {
    const el = hdrRef.current;
    if (!el) { setHdrOut(false); return; }
    const io = new IntersectionObserver(([e]) => setHdrOut(!e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  /* 엠블럼 윤곽 범위 — Summary 는 우리 일곱 팀, 팀 탭은 그 팀만 (components/Crest) */
  const glowScope = useMemo<ReadonlySet<string>>(
    () => (summary ? OUR_TEAM_IDS : new Set([target.espnTeamId])),
    [summary, target.espnTeamId],
  );

  const themeVars = useMemo(
    () =>
      ({
        ['--brand']: target.theme.brand,
        ['--accent']: target.theme.accent,
        ['--secondary']: target.theme.secondary,
        ['--on-accent']: target.theme.onAccent,
        ['--opp']: target.theme.opponent ?? '#FFFFFF',
        ['--glow']: target.theme.glow,
      }) as React.CSSProperties,
    [target],
  );

  return (
    <PaletteProvider target={target}>
    <CrestGlowScope.Provider value={glowScope}>
    <div className="theme-root" style={themeVars}>
      {/* 팀 배경 아트워크 — 팀을 바꾸면 크로스페이드(components/BgArt).
          요약 화면은 팀이 없으므로 공용 아트워크, 사진이 없는 팀은 팀 컬러 그라디언트. */}
      <BgArt
        kind={summary ? 'summary' : target.bgKind}
        layer={summary ? { key: 'summary', src: bgSummary } : { key: target.id, src: target.bg }}
      />

      <header className="hdr" ref={hdrRef}>
        <div className="shell hdr__inner">
          <div className="hdr__id">
            {summary ? (
              <span className="hdr__crest hdr__crest--sum" aria-hidden="true">★</span>
            ) : (
              <Crest
                team={{
                  id: target.espnTeamId,
                  name: target.name,
                  shortName: target.name,
                  abbr: target.abbr,
                  logo: target.crest,
                }}
                size={52}
                className="hdr__crest"
              />
            )}
            <div>
              <h1 className="hdr__name">{summary ? 'Summary' : target.nameEn}</h1>
              {/* 조각마다 <span> 을 둬서 좁은 화면에서 **조각 사이에서만**
                  줄이 꺾이게 한다. 한 줄 문자열이면 "Premier Lea / gue" 처럼
                  아무 데서나 끊긴다. 가운뎃점은 CSS 가 그린다. */}
              <div className="hdr__sub">
                {/* 폰에서는 숨긴다 — 부제가 두 줄로 꺾였다(styles/header.css) */}
                <span className="hdr__brand">MS STATS HUB</span>
                {(summary ? [{ full: '전체 요약', short: '전체 요약' }] : subtitleParts(target)).map((part) => (
                  <span key={part.full}>
                    {part.short === part.full ? part.full : (
                      <>
                        <span className="m-full">{part.full}</span>
                        <span className="m-short">{part.short}</span>
                      </>
                    )}
                  </span>
                ))}
                <span className="num">{season}</span>
              </div>
            </div>
          </div>

          <div className="hdr__row">
            {/* 두 스위처를 감싸는 껍데기 — 넓은 화면에서는 display: contents 라
                상자가 없는 것과 같다(레이아웃이 그대로). 좁은 화면에서만 이
                껍데기가 한 줄 가로 스크롤러가 된다(styles/mobile.css).
                출처 배지를 스크롤러 **바깥**에 두려고 따로 감싼다 — 안에 두면
                가장자리 흐림(mask)에 배지까지 같이 지워진다. */}
            <div className="hdr__switches" ref={rowRef}>
              <div
                className="switch"
                data-scroll
                /* 오른쪽 끝을 흐리게 해 "더 있다" 를 알리는데, 끝까지 스크롤한
                   뒤에도 흐림이 남으면 마지막 칩(뉴캐슬)이 잘려 보인다.
                   끝에 닿으면 data-end 로 흐림을 걷는다. */
                data-end={switchEnd || undefined}
                ref={switchRef}
                onScroll={syncSwitchEnd}
              >
                <button
                  className="pill pill--sum"
                  aria-pressed={summary}
                  onClick={openSummary}
                  aria-label="Summary"
                >
                  {/* 폰에서는 글자를 숨기고 ★ 만 남긴다(styles/mobile.css) */}
                  {/* 하나로 감싸야 한다 — 알약은 flex(gap 7px)라 ★ 와 글자가 따로
                      놓이면 그 사이에 gap 이 끼어 넓은 화면에서 2px 넓어진다 */}
                  <span>★<span className="pill__name"> SUMMARY</span></span>
                </button>
                <span className="switch__label">CLUB</span>
                {TARGETS.filter((t) => t.kind === 'club').map((t) => (
                  <button
                    key={t.id}
                    className="pill"
                    aria-pressed={!summary && t.id === targetId}
                    onClick={() => openTeam(t.id)}
                    aria-label={t.name}
                  >
                    <ChipCrest src={t.crest} teamId={t.espnTeamId} abbr={t.abbr} dark={t.darkCrest} />
                    <span className="pill__name">{t.name}</span>
                  </button>
                ))}
              </div>
              <div className="switch" style={{ marginLeft: 6 }}>
                <span className="switch__label">NATIONAL</span>
                {TARGETS.filter((t) => t.kind === 'national').map((t) => (
                  <button
                    key={t.id}
                    className="pill"
                    aria-pressed={!summary && t.id === targetId}
                    onClick={() => openTeam(t.id)}
                    aria-label={t.name}
                  >
                    {/* 국기 이모지(🇰🇷)는 윈도우에서 'KR' 두 글자로 떨어진다 —
                        태극 문양 이미지를 직접 넣어 어디서나 같게 보이게 한다. */}
                    <ChipCrest src={t.crest} teamId={t.espnTeamId} abbr={t.abbr} />
                    <span className="pill__name">{t.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <span className="hdr__spacer" />

            {/* 길게 누르면 숨은 "지금 갱신" 시트(RefreshSheet) — 평소엔 아무 표시도 없다 */}
            <span
              className="srcbadge"
              data-src={source}
              {...refreshPress}
              title={
                fetchedAt
                  ? `데이터 기준 ${new Date(fetchedAt).toLocaleString('ko-KR')}`
                  : ''
              }
            >
              <span className="srcbadge__dot" />
              <span className="srcbadge__label">
                {source === 'live' ? '실시간' : source === 'feed' ? '자동 갱신' : '데이터 없음'}
              </span>
              {source !== 'live' && fetchedAt && (
                <em className="srcbadge__at num">{ago(fetchedAt)}</em>
              )}
            </span>
          </div>

          {/* 요약 화면에는 팀별 탭이 없다 — 한 화면에 다 들어 있다 */}
          {!summary && (
            <nav
              className="tabs"
              role="tablist"
              ref={tabsRef}
              data-ink={ink ? true : undefined}
              /* 탭 목록 표준 키보드 — ←/→ 로 옆 탭, Home/End 로 처음·끝.
                 Tab 키는 고른 탭 하나에만 멈추고(나머지 tabIndex -1) 본문으로 넘어간다. */
              onKeyDown={(e) => {
                const i = tabs.findIndex((t) => t.id === tab);
                const to = e.key === 'ArrowRight' ? (i + 1) % tabs.length
                  : e.key === 'ArrowLeft' ? (i - 1 + tabs.length) % tabs.length
                    : e.key === 'Home' ? 0
                      : e.key === 'End' ? tabs.length - 1 : -1;
                if (to < 0) return;
                e.preventDefault();
                goTab(tabs[to].id);
                requestAnimationFrame(() =>
                  tabsRef.current?.querySelectorAll<HTMLElement>('.tab')[to]?.focus());
              }}
            >
              {tabs.map((t) => (
                <button
                  key={t.id}
                  className="tab"
                  role="tab"
                  aria-selected={t.id === tab}
                  tabIndex={t.id === tab ? 0 : -1}
                  onClick={() => goTab(t.id)}
                >
                  {t.short ? (
                    <>
                      <span className="tab__full">{t.label}</span>
                      <span className="tab__short">{t.short}</span>
                    </>
                  ) : (
                    t.label
                  )}
                </button>
              ))}
              {ink && (
                <span
                  className="tabs__ink"
                  aria-hidden="true"
                  style={{ width: ink.w, transform: `translateX(${ink.x}px)` }}
                />
              )}
            </nav>
          )}
        </div>
      </header>

      {/* 헤더가 화면 위로 사라지면 위에 붙는 막대 — 폰·데스크톱 공통(styles/topbar.css) */}
      <MiniBar
        show={hdrOut}
        summary={summary}
        crest={target.crest}
        darkCrest={!!target.darkCrest}
        teamId={target.espnTeamId}
        abbr={target.abbr}
        name={summary ? 'Summary' : target.name}
        tabs={tabs}
        tab={tab}
        onTab={(id) => goTab(id as TabId)}
        teams={mobile ? undefined : TARGETS.map((t) => ({ id: t.id, name: t.name, crest: t.crest, darkCrest: t.darkCrest, teamId: t.espnTeamId, abbr: t.abbr }))}
        activeTeamId={summary ? null : targetId}
        onTeam={(id) => openTeam(id as TargetId)}
        onSummary={openSummary}
      />

      <main className="shell">
        {/* key: 팀을 바꾸면 선택 날짜·펼친 행 상태와 함께 오류 상태도 초기화된다 */}
        <ErrorBoundary
          key={summary ? 'summary' : `${target.id}-${tab}`}
          label={summary ? '요약' : tabs.find((t) => t.id === tab)?.label}
        >
          {/* key 가 ErrorBoundary 와 같아 탭·팀이 바뀔 때만 새로 그려진다 → 전환이 한 번 돈다 */}
          <div className="view" data-dir={motion}>
          {summary && <SummaryTab onOpenTeam={openTeam} />}
          {!summary && tab === 'schedule' && (
            <ScheduleTab
              target={target}
              matches={matches}
              loading={loading}
              onGoalsLoaded={onGoalsLoaded}
              focusMatchId={focusMatch?.team === target.id ? focusMatch.id : null}
              onFocused={clearFocusMatch}
            />
          )}
          {!summary && tab === 'standings' && <StandingsTab target={target} teamMatches={matches} />}
          {!summary && tab === 'players' && <PlayersTab target={target} matches={matches} />}
          {!summary && tab === 'koreans' && <KoreansTab />}
          {!summary && tab === 'news' && <NewsTab target={target} />}
          {!summary && tab === 'future' && <FutureTab target={target} />}
          </div>
        </ErrorBoundary>
      </main>
      <RefreshSheet open={refreshOpen} onClose={closeRefresh} />
    </div>
    </CrestGlowScope.Provider>
    </PaletteProvider>
  );
}
