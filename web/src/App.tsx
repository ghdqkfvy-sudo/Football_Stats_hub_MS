import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import './styles/global.css';
/* 좁은 화면 전용 덮어쓰기 — global.css 뒤에 와야 이긴다 */
import './styles/mobile.css';
import { TARGETS, getTarget, subtitleParts, type TargetId } from './config/targets';
import type { Match } from './lib/types';
import { loadSchedule, type Source } from './lib/api';
import { ScheduleTab } from './tabs/ScheduleTab';
import { StandingsTab } from './tabs/StandingsTab';
import { PlayersTab } from './tabs/PlayersTab';
import { KoreansTab } from './tabs/KoreansTab';
import { NewsTab } from './tabs/NewsTab';
import { FutureTab } from './tabs/FutureTab';
import { PaletteProvider } from './lib/palette';
import { seasonOptions } from './lib/kst';
import { Crest } from './components/Crest';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SummaryTab } from './tabs/SummaryTab';
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
  const [view, setView] = useState<'summary' | 'team'>('summary');
  const [targetId, setTargetId] = useState<TargetId>('real-madrid');
  const target = getTarget(targetId);
  const summary = view === 'summary';

  /** 팀을 고르면 그 팀 화면으로 넘어간다 */
  const openTeam = useCallback((id: TargetId) => {
    setTargetId(id);
    setView('team');
  }, []);
  /*
   * ⚠️ 예전에는 시즌을 고르는 단추가 두 개 있었다. 그런데 그 값은 헤더
   * 글자에만 쓰여서, 다음 시즌을 눌러도 라벨만 바뀌고 일정·순위는 그대로였다
   * — 사용자를 속이는 UI 다. 시즌별 조회는 아직 없으므로, 지금 시즌을
   * 그냥 적는다. (스냅샷·앱 모두 오늘 날짜로 시즌을 계산한다 — lib/kst.ts)
   */
  const season = SEASONS[0].label;

  const tabs = target.kind === 'club' ? CLUB_TABS : NATIONAL_TABS;
  const [tab, setTab] = useState<TabId>(tabs[0].id);
  useEffect(() => {
    if (!tabs.some((t) => t.id === tab)) setTab(tabs[0].id);
  }, [tabs, tab]);

  const [matches, setMatches] = useState<Match[]>([]);
  const [source, setSource] = useState<Source>('none');
  const [fetchedAt, setFetchedAt] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    // 팀을 바꾸면 이전 팀 일정이 잠깐 남아 "다음 경기"가 잘못 잡히는 것을 막는다
    setMatches([]);
    loadSchedule(target.espnTeamId).then((r) => {
      if (!alive) return;
      setMatches(r.data);
      setSource(r.source);
      setFetchedAt(r.fetchedAt);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [target.espnTeamId]);

  const onGoalsLoaded = useCallback((id: string, goals: Match['goals']) => {
    setMatches((prev) => prev.map((m) => (m.id === id ? { ...m, goals, goalsLoaded: true } : m)));
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
    <div style={themeVars}>
      {/* 팀 배경 아트워크 — 콘텐츠 뒤에서 어둡게 깔린다 */}
      <div className="bgart" data-kind={summary ? 'summary' : target.bgKind} aria-hidden="true">
        {/* 요약 화면은 팀이 없으므로 공용 아트워크를 쓴다.
            사진이 없는 팀은 팀 컬러 그라디언트로 — 사진을 못 구했다고
            팀을 추가하지 못하는 편이 더 나쁘다. */}
        <div
          className="bgart__img"
          data-empty={!summary && !target.bg ? true : undefined}
          style={
            summary
              ? { backgroundImage: `url(${bgSummary})` }
              : target.bg ? { backgroundImage: `url(${target.bg})` } : undefined
          }
        />
        <div className="bgart__veil" />
      </div>

      <header className="hdr">
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
                <span>MS STATS HUB</span>
                {(summary ? ['전체 요약'] : subtitleParts(target)).map((part) => (
                  <span key={part}>{part}</span>
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
                  onClick={() => setView('summary')}
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
                    <img src={t.crest} alt="" />
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
                    <img src={t.crest} alt="" />
                    <span className="pill__name">{t.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <span className="hdr__spacer" />

            <span
              className="srcbadge"
              data-src={source}
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

            <span className="season season--static num" title="표시 중인 시즌">
              {season}
            </span>
          </div>

          {/* 요약 화면에는 팀별 탭이 없다 — 한 화면에 다 들어 있다 */}
          {!summary && (
            <nav className="tabs" role="tablist">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  className="tab"
                  role="tab"
                  aria-selected={t.id === tab}
                  onClick={() => setTab(t.id)}
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
            </nav>
          )}
        </div>
      </header>

      <main className="shell">
        {/* key: 팀을 바꾸면 선택 날짜·펼친 행 상태와 함께 오류 상태도 초기화된다 */}
        <ErrorBoundary
          key={summary ? 'summary' : `${target.id}-${tab}`}
          label={summary ? '요약' : tabs.find((t) => t.id === tab)?.label}
        >
          {summary && <SummaryTab onOpenTeam={openTeam} />}
          {!summary && tab === 'schedule' && (
            <ScheduleTab
              target={target}
              matches={matches}
              loading={loading}
              onGoalsLoaded={onGoalsLoaded}
            />
          )}
          {!summary && tab === 'standings' && <StandingsTab target={target} teamMatches={matches} />}
          {!summary && tab === 'players' && <PlayersTab target={target} matches={matches} />}
          {!summary && tab === 'koreans' && <KoreansTab />}
          {!summary && tab === 'news' && <NewsTab target={target} />}
          {!summary && tab === 'future' && <FutureTab target={target} />}
        </ErrorBoundary>
      </main>
    </div>
    </PaletteProvider>
  );
}
