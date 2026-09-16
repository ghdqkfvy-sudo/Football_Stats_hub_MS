import { useEffect, useMemo, useState } from 'react';
import type { Match, StandingTable } from '../lib/types';
import type { Target } from '../config/targets';
import { dayKey, monthKey } from '../lib/kst';
import { loadGoals, loadLeague } from '../lib/api';
import { buildTable } from '../lib/league';
import { usePalette } from '../lib/palette';
import { NextMatchHero, type TeamStanding } from '../components/NextMatchHero';
import { Calendar } from '../components/Calendar';
import { MonthList } from '../components/MonthList';
import { MatchSheet } from '../components/Sheet';

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

  /* ── 순위·승무패 소스 ──────────────────────────────────
     리그 표는 항상, 다음 경기 대회가 리그와 다르면 그 표도 같이 받는다.
     (최대 2회 호출이고 스냅샷 폴백이 있으므로 히어로 렌더를 막지 않는다) */
  const palette = usePalette();
  const leagueKey = target.league ?? target.competitions[0];
  const matchKey = next && next.competition !== leagueKey ? next.competition : null;
  const [tables, setTables] = useState<Record<string, StandingTable | null>>({});

  useEffect(() => {
    let alive = true;
    const want = [leagueKey, matchKey].filter((k): k is string => !!k);
    for (const k of want) {
      if (k in tables) continue;
      setTables((t) => ({ ...t, [k]: null }));
      loadLeague(k, palette.name(k)).then((r) => {
        if (!alive) return;
        setTables((t) => ({ ...t, [k]: buildTable(r.data.table, r.data.matches, k, palette.name(k)) }));
      });
    }
    return () => {
      alive = false;
    };
  }, [leagueKey, matchKey, tables, palette]);

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
      {next && <NextMatchHero match={next} focusTeamId={target.espnTeamId} standingOf={standingOf} />}

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
          <h2 className="sec__title">
            {cursor?.m}월 경기 <span className="num" style={{ color: 'var(--text-lo)', fontWeight: 400 }}>{monthMatches.length}</span>
          </h2>
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
