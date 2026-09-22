import { useEffect, useMemo, useRef, useState } from 'react';
import type { Match, StandingTable } from '../lib/types';
import type { Target } from '../config/targets';
import { dayKey, monthKey } from '../lib/kst';
import { loadGoals, loadLeagueTable, loadScheduleExtras, type ScheduleExtras } from '../lib/api';
import { buildTable } from '../lib/league';
import { usePalette } from '../lib/palette';
import { NextMatchHero, type TeamStanding } from '../components/NextMatchHero';
import { Calendar } from '../components/Calendar';
import { MonthList } from '../components/MonthList';
import { MatchSheet } from '../components/Sheet';
import { MatchPreview } from '../components/MatchPreview';

interface Props {
  target: Target;
  matches: Match[];
  loading: boolean;
  /** 득점 상세를 받아오면 상위 상태를 갱신한다 */
  onGoalsLoaded: (matchId: string, goals: Match['goals']) => void;
}

export function ScheduleTab({ target, matches, loading, onGoalsLoaded }: Props) {
  const next = useMemo(
    () => matches.find((m) => m.status === 'scheduled' || m.status === 'live'),
    [matches],
  );

  const [cursor, setCursor] = useState<{ y: number; m: number } | null>(null);

  /**
   * 선택 날짜·표시 월의 기본값은 "다음 경기"다.
   * 사용자가 직접 날짜나 달을 고르면 pinned 가 되어 더 이상 자동으로 움직이지 않는다.
   * (팀 전환 직후 이전 팀 일정이 남아 잘못된 날짜에 고정되던 문제를 막는다)
   */
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    if (pinned || !matches.length) return;
    const anchor = next ?? matches[matches.length - 1];
    const [y, m] = monthKey(anchor.kickoffUtc).split('-').map(Number);
    setCursor({ y, m });
    setSelectedDay(dayKey(anchor.kickoffUtc));
  }, [matches, next, pinned]);

  /**
   * 히어로에 보여줄 경기 — 캘린더에서 다른 날짜를 고르면 그 날의 경기로 바뀐다.
   * 고른 날짜에 경기가 없으면(빈 칸을 눌렀거나 아직 선택 전) 원래의 "다음 경기"로 되돌아간다.
   */
  const heroMatch = useMemo(() => {
    if (!selectedDay) return next ?? null;
    return matches.find((m) => dayKey(m.kickoffUtc) === selectedDay) ?? next ?? null;
  }, [matches, selectedDay, next]);

  /* ── 순위·승무패 소스 ──────────────────────────────────
     리그 표는 항상, 히어로 경기의 대회가 리그와 다르면 그 표도 같이 받는다.
     (최대 2회 호출이고 스냅샷 폴백이 있으므로 히어로 렌더를 막지 않는다) */
  const palette = usePalette();
  const leagueKey = target.league ?? target.competitions[0];
  const matchKey = heroMatch && heroMatch.competition !== leagueKey ? heroMatch.competition : null;
  /* 컵 라운드 목록과 다음 경기 미리보기 — 경기 목록과 같은 파일에 있지만
     쓰는 화면이 달라 따로 읽는다(같은 파일이라 요청은 한 번 더 나가지 않는다). */
  const [extras, setExtras] = useState<ScheduleExtras | null>(null);
  useEffect(() => {
    let alive = true;
    setExtras(null);
    loadScheduleExtras(target.espnTeamId).then((e) => { if (alive) setExtras(e); });
    return () => { alive = false; };
  }, [target.espnTeamId]);

  const [tables, setTables] = useState<Record<string, StandingTable | null>>({});
  /**
   * 이미 요청한 대회.
   *
   * ⚠️ 여기에 히어로의 "3위 · 3승1무0패" 를 통째로 지워 버린 버그가 있었다.
   * 예전 코드는 `tables` 를 의존성에 넣고, 그 안에서 `setTables` 로
   * 로딩 표시를 넣고, 정리 함수에서 `alive = false` 로 응답을 버렸다.
   * 그러면 순서가 이렇게 된다.
   *
   *   1) 이펙트 실행 → setTables({esp.1: null}) → 요청 시작
   *   2) tables 가 바뀌어 이펙트 재실행 → **정리 함수가 alive=false**
   *   3) 요청이 돌아옴 → `if (!alive) return` → 결과를 버린다
   *   4) 재실행된 이펙트는 `'esp.1' in tables` 라서 다시 요청하지 않는다
   *
   * 결과적으로 표는 **영원히 채워지지 않았다**. 3.2MB 파일을 받던 시절에도
   * 같았다(응답이 느릴수록 확실히 버려진다).
   *
   * 요청 이력은 상태가 아니라 ref 에 둔다 — 렌더를 유발하지 않으므로
   * 이펙트가 자기 자신을 다시 트리거하지 않는다. 그리고 응답을 버리지
   * 않는다: 결과는 대회 슬러그로 키가 박혀 있어 늦게 와도 제자리에 들어간다.
   * (팀이나 탭을 바꾸면 App 이 이 컴포넌트를 remount 하므로 ref 도 초기화된다)
   */
  const asked = useRef(new Set<string>());

  useEffect(() => {
    for (const k of [leagueKey, matchKey]) {
      if (!k || asked.current.has(k)) continue;
      asked.current.add(k);
      setTables((t) => ({ ...t, [k]: null }));
      /* 히어로에 필요한 건 순위·승무패뿐이다 — 3.2MB 리그 파일이 아니라
         순위표 전용 경량본을 읽는다(api.ts 의 loadLeagueTable 주석 참고). */
      loadLeagueTable(k, palette.name(k)).then((r) => {
        setTables((t) => ({ ...t, [k]: buildTable(r.data.table, r.data.matches, k, palette.name(k)) }));
      });
    }
  }, [leagueKey, matchKey, palette]);

  const leagueTable = tables[leagueKey] ?? null;
  const matchTable = matchKey ? (tables[matchKey] ?? null) : null;

  const [pending, setPending] = useState<Set<string>>(new Set());
  const [sheet, setSheet] = useState<Match | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const fetchGoals = async (m: Match) => {
    if (m.goalsLoaded || pending.has(m.id)) return;
    setPending((s) => new Set(s).add(m.id));
    const goals = await loadGoals(m.competition, m.id);
    onGoalsLoaded(m.id, goals ?? []);
    setPending((s) => {
      const n = new Set(s);
      n.delete(m.id);
      return n;
    });
  };

  /**
   * 다음 경기 히어로에 붙일 순위·승무패.
   * 1순위는 그 경기의 대회 순위표(챔스 리그페이즈 포함), 없으면 우리 팀 리그 표.
   * 두 표 모두에 없는 팀(예: 컵대회 하위리그 상대)은 아무것도 표시하지 않는다.
   */
  const standingOf = (teamId: string): TeamStanding | undefined => {
    for (const t of [matchTable, leagueTable]) {
      const row = t?.rows.find((r) => r.team.id === teamId);
      if (row) {
        return {
          rank: row.rank,
          win: row.win,
          draw: row.draw,
          loss: row.loss,
        };
      }
    }
    return undefined;
  };

  /** 달을 옮기면 그 달의 첫 경기일로 선택을 옮긴다(빈 하이라이트가 남지 않도록). */
  const moveMonth = (y: number, m: number) => {
    setPinned(true);
    setCursor({ y, m });
    const key = `${y}-${String(m).padStart(2, '0')}`;
    const first = matches.find((x) => monthKey(x.kickoffUtc) === key);
    setSelectedDay(first ? dayKey(first.kickoffUtc) : null);
  };

  const toggleRow = (m: Match) => {
    if (m.status !== 'finished') return;
    const nextId = openId === m.id ? null : m.id;
    setOpenId(nextId);
    if (nextId && !m.goalsLoaded) fetchGoals(m);
  };

  const monthMatches = useMemo(() => {
    if (!cursor) return [];
    const key = `${cursor.y}-${String(cursor.m).padStart(2, '0')}`;
    return matches.filter((m) => monthKey(m.kickoffUtc) === key);
  }, [matches, cursor]);

  if (loading && !matches.length) {
    return (
      <div className="page">
        <div className="skel" style={{ height: 300, borderRadius: 22 }} />
        <div className="skel" style={{ height: 420 }} />
      </div>
    );
  }

  if (!matches.length) {
    return (
      <div className="page">
        <div className="empty">
          <h3>일정을 불러오지 못했습니다</h3>
          <p>
            이 앱에는 경기 데이터가 하나도 박혀 있지 않습니다. 모든 일정·결과는
            Worker 프록시(<code>VITE_API_BASE</code>) 또는 정적 피드
            (<code>/data/schedule-*.json</code>)에서 옵니다. 둘 중 하나는 연결되어 있어야 합니다.
            <br />
            로컬에서 채우려면 <code>npm run snapshot</code> 을 한 번 실행하세요.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      {heroMatch && <NextMatchHero match={heroMatch} focusTeamId={target.espnTeamId} standingOf={standingOf} />}
      {heroMatch && extras?.preview?.eventId === heroMatch.id && (
        <MatchPreview
          match={heroMatch}
          focusTeamId={target.espnTeamId}
          lastFive={extras.preview.lastFive}
          h2h={extras.preview.h2h}
          h2hScope={extras.preview.h2hScope}
        />
      )}

      <section>
        <div className="sec__head">
          <h2 className="sec__title">경기 캘린더</h2>
          <span className="sec__note">모든 날짜·시각은 한국시간(KST) 기준입니다</span>
        </div>
        {cursor && (
          <Calendar
            matches={matches}
            year={cursor.y}
            month={cursor.m}
            selectedDay={selectedDay}
            nextDay={next ? dayKey(next.kickoffUtc) : null}
            focusTeamId={target.espnTeamId}
            onSelectDay={(k) => {
              setPinned(true);
              setSelectedDay(k);
            }}
            onMove={moveMonth}
            onPick={(m) => {
              // 좁은 화면: 바텀시트 / 넓은 화면: 아래 목록에서 펼치고 스크롤
              if (typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches) {
                setSheet(m);
                if (m.status === 'finished') fetchGoals(m);
                return;
              }
              if (m.status === 'finished') {
                setOpenId(m.id);
                if (!m.goalsLoaded) fetchGoals(m);
              }
              requestAnimationFrame(() =>
                document.getElementById(`match-${m.id}`)?.scrollIntoView({
                  behavior: 'smooth',
                  block: 'center',
                }),
              );
            }}
          />
        )}
      </section>

      <section>
        <div className="sec__head">
          <h2 className="sec__title">{cursor?.m}월 경기</h2>
          <span className="sec__note">종료된 경기를 누르면 골 기록이 펼쳐집니다</span>
        </div>
        <MonthList
          matches={monthMatches}
          focusTeamId={target.espnTeamId}
          nextMatchId={next?.id}
          loadingGoals={pending}
          openId={openId}
          onToggle={toggleRow}
          selectedDay={selectedDay}
        />
      </section>

      <MatchSheet
        match={sheet}
        loading={!!sheet && pending.has(sheet.id)}
        onClose={() => setSheet(null)}
      />
    </div>
  );
}
