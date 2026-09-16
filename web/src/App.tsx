import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import './styles/global.css';
import { TARGETS, getTarget, type TargetId } from './config/targets';
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

type TabId = 'schedule' | 'standings' | 'players' | 'future' | 'news' | 'koreans';

const CLUB_TABS: { id: TabId; label: string }[] = [
  { id: 'schedule', label: '일정' },
  { id: 'standings', label: '팀 순위' },
  { id: 'players', label: '선수 스탯' },
  { id: 'future', label: 'Future Resources' },
  { id: 'news', label: '뉴스' },
];

const NATIONAL_TABS: { id: TabId; label: string }[] = [
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
  const [targetId, setTargetId] = useState<TargetId>('real-madrid');
  const [season, setSeason] = useState(SEASONS[0].label);
  const target = getTarget(targetId);

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
      <div className="bgart" data-kind={target.bgKind} aria-hidden="true">
        <div className="bgart__img" style={{ backgroundImage: `url(${target.bg})` }} />
        <div className="bgart__veil" />
      </div>

      <header className="hdr">
        <div className="shell hdr__inner">
          <div className="hdr__id">
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
            <div>
              <h1 className="hdr__name">{target.nameEn}</h1>
              <div className="hdr__sub">K STATS HUB · {target.subtitle} · {season}</div>
            </div>
          </div>

          <div className="hdr__row">
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
              <span className="switch__label">CLUB</span>
              {TARGETS.filter((t) => t.kind === 'club').map((t) => (
                <button
                  key={t.id}
                  className="pill"
                  aria-pressed={t.id === targetId}
                  onClick={() => setTargetId(t.id)}
                >
                  <img src={t.crest} alt="" />
                  {t.name}
                </button>
              ))}
            </div>
            <div className="switch" style={{ marginLeft: 6 }}>
              <span className="switch__label">NATIONAL</span>
              {TARGETS.filter((t) => t.kind === 'national').map((t) => (
                <button
                  key={t.id}
                  className="pill"
                  aria-pressed={t.id === targetId}
                  onClick={() => setTargetId(t.id)}
                >
                  {/* 국기 이모지(🇰🇷)는 윈도우에서 'KR' 두 글자로 떨어진다 —
                      태극 문양 이미지를 직접 넣어 어디서나 같게 보이게 한다. */}
                  <img src={t.crest} alt="" />
                  {t.name}
                </button>
              ))}
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
              {source === 'live' ? '실시간' : source === 'feed' ? '자동 갱신' : '데이터 없음'}
              {source !== 'live' && fetchedAt && (
                <em className="srcbadge__at num">{ago(fetchedAt)}</em>
              )}
            </span>

            <div className="season">
              {SEASONS.map((s) => (
                <button key={s.year} aria-pressed={s.label === season} onClick={() => setSeason(s.label)}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <nav className="tabs" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.id}
                className="tab"
                role="tab"
                aria-selected={t.id === tab}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="shell">
        {/* key: 팀을 바꾸면 선택 날짜·펼친 행 상태를 초기화한다 */}
        {tab === 'schedule' && (
          <ScheduleTab
            key={target.id}
            target={target}
            matches={matches}
            loading={loading}
            onGoalsLoaded={onGoalsLoaded}
          />
        )}
        {tab === 'standings' && <StandingsTab key={target.id} target={target} teamMatches={matches} />}
        {tab === 'players' && <PlayersTab key={target.id} target={target} matches={matches} />}
        {tab === 'koreans' && <KoreansTab />}
        {tab === 'news' && <NewsTab key={target.id} target={target} />}
        {tab === 'future' && <FutureTab key={target.id} target={target} />}
        {tab !== 'schedule' && tab !== 'standings' && tab !== 'players' && tab !== 'koreans' && tab !== 'news' && tab !== 'future' && (
          <Placeholder tab={tab} />
        )}
      </main>
    </div>
    </PaletteProvider>
  );
}

const PLACEHOLDER: Record<string, { h: string; p: string }> = {
  standings: {
    h: '팀 순위 — 2단계에서 구현',
    p: '리그 → 챔피언스리그 순으로 참가 대회를 나열하고, 팀을 누르면 홈/원정 경기 결과가 아코디언으로 펼쳐집니다. 그 아래에 해당 대회의 득점·도움·공격포인트 순위가 붙습니다.',
  },
  players: {
    h: '선수 스탯 — 3단계에서 구현',
    p: '왼쪽에는 실제 출전 포지션 기록(formationPlace)으로 자동 선정한 베스트 11을 팀이 실제로 쓰는 포메이션에 배치하고, 오른쪽 선수 목록에 커서를 올리면 시즌 스탯과 최근 3경기가 뜹니다.',
  },
  future: {
    h: 'Future Resources — 4단계에서 구현',
    p: '임대·바이백·셀온 조항은 어떤 무료 API에도 없는 계약 정보라, 선수 명단과 조항만 수동 큐레이션 파일로 관리하고 시즌 성적·최근 3경기는 ESPN에서 실시간으로 붙입니다.',
  },
  news: {
    h: '뉴스 — 4단계에서 구현',
    p: 'ESPN 팀 뉴스 피드와 구글 뉴스 RSS(한국어)를 Worker에서 합쳐 제공합니다.',
  },
  koreans: {
    h: '코리안리거 — 3단계에서 구현',
    p: '유럽·MLS에서 뛰는 주요 한국 선수들의 시즌 기록과 최근 3경기를 리그별로 묶어 보여줍니다. ESPN athlete statistics 스키마 하나로 여러 리그를 동시에 커버합니다.',
  },
};

function Placeholder({ tab }: { tab: string }) {
  const c = PLACEHOLDER[tab];
  return (
    <div className="page">
      <div className="empty">
        <h3>{c?.h ?? '준비 중'}</h3>
        <p>{c?.p ?? ''}</p>
      </div>
    </div>
  );
}
