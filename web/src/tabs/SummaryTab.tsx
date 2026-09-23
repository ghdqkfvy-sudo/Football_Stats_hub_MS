import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TARGETS, comp, getTarget, markOf, type Target, type TargetId } from '../config/targets';
import type { CompetitionKey, Match, StandingTable } from '../lib/types';
import { loadLeagueTable, loadSchedule } from '../lib/api';
import { buildTable, deriveLeaders, tableRound } from '../lib/league';
import { dayKey, monthKey, todayKey } from '../lib/kst';
import {
  cycleIndex, matchesByDay, monthResults, nextUpBoard, shiftWeek, weekStartKey,
  type TeamFeed,
} from '../lib/summary';
import { MatchdayCard } from '../components/MatchdayHero';
import type { TeamStanding } from '../components/NextMatchHero';
import { WeekCalendar } from '../components/WeekCalendar';
import { StandingsTable } from '../components/StandingsTable';
import { LeaderBoard } from '../components/LeaderBoard';
import { CompCrest } from '../components/CompCrest';
import { MonthList } from '../components/MonthList';

/**
 * Summary — 앱에 들어오면 처음 보이는 화면.
 *
 * 팀 탭을 하나씩 들어가지 않아도 "지금 무슨 일이 있나" 가 한 화면에 들어오게
 * 한다. 일곱 팀의 일정을 한데 모으고, 우리가 보는 세 대회의 순위와 선수
 * 기록을 붙인다.
 *
 * ⚠️ 대한민국은 순위·선수 기록에 넣지 않는다 — 국가대표는 리그가 없고,
 * 클럽 대회 순위표에 섞을 자리도 없다. 일정에는 그대로 나온다.
 */

/** 순위·선수 기록을 보여 줄 대회 */
const COMPS: CompetitionKey[] = ['eng.1', 'esp.1', 'uefa.champions'];

export function SummaryTab({ onOpenTeam }: { onOpenTeam: (id: TargetId) => void }) {
  /* ── 모든 팀 일정 ─────────────────────────────────── */
  const [feeds, setFeeds] = useState<Record<string, Match[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    let left = TARGETS.length;
    for (const t of TARGETS) {
      loadSchedule(t.espnTeamId).then((r) => {
        if (!alive) return;
        setFeeds((f) => ({ ...f, [t.id]: r.data }));
        if (--left === 0) setLoading(false);
      });
    }
    return () => { alive = false; };
  }, []);

  const teamFeeds = useMemo<TeamFeed[]>(
    () => TARGETS.map((t) => ({ id: t.id, matches: feeds[t.id] ?? [] })),
    [feeds],
  );

  const targetOf = (id: string) => getTarget(id as TargetId);

  /* ── 매치데이 히어로 ──────────────────────────────── */
  const board = useMemo(() => nextUpBoard(teamFeeds), [teamFeeds]);

  /*
   * 사용자가 고른 **경기 하나**. 예전에는 팀 id 만 들고 있었는데, 히어로는
   * 늘 `board`(팀별 *다음* 경기)에서 찾았다. 그래서 주간 캘린더에서 다음
   * 경기 **이후**의 경기를 눌러도 히어로는 그 팀의 다음 경기 그대로였고,
   * 이미 그 팀이 히어로면 아무 일도 안 일어난 것처럼 보였다.
   * 이제 누른 경기를 그대로 띄운다.
   *
   * 저장은 id 로 한다 — Match 객체를 들고 있으면 데이터가 갱신될 때
   * 옛 객체가 화면에 남는다. 매번 피드에서 다시 찾는다.
   */
  const [picked, setPicked] = useState<{ teamId: string; matchId: string } | null>(null);
  const pickedUp = useMemo(() => {
    if (!picked) return null;
    const m = teamFeeds.find((f) => f.id === picked.teamId)?.matches
      .find((x) => x.id === picked.matchId);
    return m ? { teamId: picked.teamId, match: m } : null;
  }, [picked, teamFeeds]);

  const hero = pickedUp ?? board[0] ?? null;
  /* 히어로로 올라간 팀은 아래 카드에서 뺀다 — 같은 팀이 두 번 나오면 헷갈린다 */
  const rest = board.filter((b) => b.teamId !== hero?.teamId);

  /* ── 주간 캘린더 ──────────────────────────────────── */
  const byDay = useMemo(() => matchesByDay(teamFeeds), [teamFeeds]);
  const [week, setWeek] = useState(() => weekStartKey(todayKey()));
  const [selDay, setSelDay] = useState<string | null>(null);
  const [selIdx, setSelIdx] = useState(0);

  /* 히어로가 바뀌면 그 경기가 든 주로 캘린더를 옮긴다 */
  const heroMatchId = hero?.match.id;
  const lastHero = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!hero || heroMatchId === lastHero.current) return;
    lastHero.current = heroMatchId;
    const k = dayKey(hero.match.kickoffUtc);
    setWeek(weekStartKey(k));
    setSelDay(k);
    const list = byDay.get(k) ?? [];
    const i = list.findIndex((x) => x.match.id === hero.match.id);
    setSelIdx(i < 0 ? 0 : i);
  }, [hero, heroMatchId, byDay]);

  /** 날짜를 누르면 그 날 경기를 히어로로. 같은 날짜를 또 누르면 다음 경기로. */
  const pickDay = (k: string) => {
    const list = byDay.get(k) ?? [];
    if (!list.length) { setSelDay(k); setSelIdx(0); return; }
    const i = cycleIndex(selDay, k, selIdx, list.length);
    setSelDay(k);
    setSelIdx(i);

    /* 히어로는 이제 **누른 그 경기**다. 미리 적어 두면 아래 이펙트가
       "히어로가 바뀌었다" 며 주를 옮기지 않는다 — 방금 누른 자리에 있어야 한다. */
    lastHero.current = list[i].match.id;
    setPicked({ teamId: list[i].teamId, matchId: list[i].match.id });
  };

  /* ── 대회 순위 ────────────────────────────────────── */
  const [active, setActive] = useState<CompetitionKey>('eng.1');
  const [tables, setTables] = useState<Record<string, { table: StandingTable | null; matches: Match[] } | null>>({});
  const asked = useRef(new Set<string>());

  /*
   * 세 대회 표를 **처음에 다 받는다.**
   * 순위 섹션은 고른 대회 하나만 쓰지만, 히어로의 "3위 · 3승1무0패" 는
   * 그 경기 팀이 어느 리그 소속이냐에 따라 달라진다. 경량본이라 한 개당
   * gzip 15KB 남짓이고, 어차피 탭을 누르면 받을 파일이다.
   */
  useEffect(() => {
    for (const k of COMPS) {
      if (asked.current.has(k)) continue;
      asked.current.add(k);
      setTables((t) => ({ ...t, [k]: null }));
      loadLeagueTable(k, comp(k).name).then((r) => {
        setTables((t) => ({
          ...t,
          [k]: {
            table: buildTable(r.data.table, r.data.matches, k, comp(k).name),
            matches: r.data.matches,
          },
        }));
      });
    }
  }, []);

  const league = tables[active];

  /**
   * 팀의 순위·승무패 — 받아 둔 표 어디에 있든 찾는다.
   * 리그를 먼저 보고(그게 "그 팀 순위"다) 없으면 챔스 같은 대회 표에서.
   */
  const standingOf = useCallback((teamId: string): TeamStanding | undefined => {
    for (const k of COMPS) {
      const row = tables[k]?.table?.rows.find((r) => r.team.id === teamId);
      if (row) return { rank: row.rank, win: row.win, draw: row.draw, loss: row.loss };
    }
    return undefined;
  }, [tables]);

  /**
   * 우리 클럽 팀 → 강조색 (대한민국은 뺀다 — 클럽 대회 순위표에 자리가 없다).
   *
   * ⚠️ brand 가 아니라 accent 다. targets.ts 가 적어 둔 대로 accent 는
   * "어두운 배경 위 텍스트·보더용으로 밝기를 올린 변형" 이다. 뉴캐슬 brand 는
   * #241F20(거의 검정), 토트넘은 #132257(짙은 남색)이라 어두운 표 위에서
   * 순위 숫자와 승점이 그대로 묻혀 버린다.
   */
  const clubColors = useMemo(() => {
    const out: Record<string, string> = {};
    for (const t of TARGETS) if (t.kind === 'club') out[t.espnTeamId] = markOf(t);
    return out;
  }, []);

  const leaders = useMemo(() => (league ? deriveLeaders(league.matches) : []), [league]);

  /* ── 이달의 경기 결과 ─────────────────────────────── */
  const thisMonth = monthKey(new Date());
  const results = useMemo(() => monthResults(teamFeeds, thisMonth), [teamFeeds, thisMonth]);
  const [openId, setOpenId] = useState<string | null>(null);
  /** 경기마다 "우리 팀" 이 다르다 — 그 팀 기준으로 승패·득점자를 읽는다 */
  const focusFor = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of results) map.set(r.match.id, targetOf(r.teamId).espnTeamId);
    return map;
  }, [results]);
  const barFor = useMemo(() => {
    const map = new Map<string, string>();
    // 같은 이유로 accent — 검정 띠는 띠가 아니다
    for (const r of results) map.set(r.match.id, targetOf(r.teamId).theme.accent);
    return map;
  }, [results]);
  /* 상대 팀 색. 기본은 흰색이고, 팀 컬러가 흰색에 가까운 뉴캐슬만
     theme.opponent(하늘색)를 쓴다 — 아니면 우리와 상대가 같은 색이 된다. */
  const oppFor = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of results) map.set(r.match.id, targetOf(r.teamId).theme.opponent ?? '#FFFFFF');
    return map;
  }, [results]);

  if (loading && !board.length) {
    return (
      <div className="page">
        <div className="skel" style={{ height: 260, borderRadius: 22 }} />
        <div className="skel" style={{ height: 320 }} />
      </div>
    );
  }

  return (
    <div className="page sum">
      {/* ── 1. 매치데이 히어로 ── */}
      <section>
        <div className="sec__head">
          <h2 className="sec__title">다음 경기</h2>
          <span className="sec__note">가장 가까운 경기가 큰 카드 · 카드를 누르면 바뀝니다</span>
        </div>
        {hero ? (
          <div className="mdh">
            <MatchdayCard
              target={targetOf(hero.teamId)}
              match={hero.match}
              standingOf={standingOf}
              hero
            />
            {/* 나머지는 3장씩 두 줄 — 한 줄에 여섯 장을 밀어 넣으면
                엠블럼도 팀명도 읽을 수 없는 크기가 된다 */}
            <div className="mdh__rest">
              {rest.map((b) => (
                <MatchdayCard
                  key={b.teamId}
                  target={targetOf(b.teamId)}
                  match={b.match}
                  standingOf={standingOf}
                  onSelect={() => setPicked({ teamId: b.teamId, matchId: b.match.id })}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="empty">
            <h3>예정된 경기가 없습니다</h3>
            <p>일정 데이터가 들어오면 여기에 다음 경기가 표시됩니다.</p>
          </div>
        )}
      </section>

      {/* ── 2. 주간 캘린더 ── */}
      <section>
        <div className="sec__head">
          <h2 className="sec__title">주간 일정</h2>
          <span className="sec__note">모든 날짜·시각은 한국시간(KST) 기준입니다</span>
        </div>
        <WeekCalendar
          startKey={week}
          byDay={byDay}
          targetOf={targetOf}
          selectedDay={selDay}
          selectedIndex={selIdx}
          onPick={pickDay}
          onMove={(d) => setWeek((w) => shiftWeek(w, d))}
          onToday={() => { setWeek(weekStartKey(todayKey())); setSelDay(todayKey()); setSelIdx(0); }}
        />
      </section>

      {/* ── 3. 대회 순위 ── */}
      <section>
        <div className="sec__head">
          <h2 className="sec__title">대회 순위</h2>
          <span className="sec__note">
            {league?.table
              ? `${tableRound(league.table)}R 기준 · 우리 팀은 팀 컬러로 표시`
              : '불러오는 중'}
          </span>
        </div>

        <nav className="comps" aria-label="대회 선택">
          {COMPS.map((c) => (
            <button
              key={c}
              className="comps__b"
              aria-pressed={c === active}
              style={{ ['--c' as string]: comp(c).color }}
              onClick={() => setActive(c)}
            >
              <CompCrest k={c} size={17} />
              {comp(c).name}
            </button>
          ))}
        </nav>

        {!league ? (
          <div className="skel" style={{ height: 420 }} />
        ) : league.table ? (
          <>
            <StandingsTable
              table={league.table}
              matches={league.matches}
              focusTeamId=""
              focusTeams={clubColors}
            />
            <div className="sec__head" style={{ marginTop: 22 }}>
              <h3 className="sec__title">{comp(active).name} 선수 순위</h3>
              <span className="sec__note">득점 · 도움 · 공격 포인트</span>
            </div>
            {leaders.length ? (
              <LeaderBoard rows={leaders} teamColors={clubColors} />
            ) : (
              <div className="empty">
                <h3>선수 기록이 아직 집계되지 않았습니다</h3>
                <p>
                  선수 순위는 경기별 기록(<code>__stats</code>)에서 만들어집니다.
                  순위표 전용 경량 파일에 그 값이 들어오는 다음 수집 회차부터 채워집니다.
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="empty">
            <h3>{comp(active).name} 순위표가 없습니다</h3>
            <p>아직 개막 전이거나 토너먼트 대회라 ESPN 에 순위 데이터가 없습니다.</p>
          </div>
        )}
      </section>

      {/* ── 4. 이달의 경기 결과 ── */}
      <section>
        <div className="sec__head">
          <h2 className="sec__title">{Number(thisMonth.slice(5))}월 경기 결과</h2>
          <span className="sec__note">종료된 경기를 누르면 골 기록이 펼쳐집니다</span>
        </div>
        {results.length ? (
          <MonthList
            matches={results.map((r) => r.match)}
            focusTeamId=""
            focusFor={(m) => focusFor.get(m.id) ?? ''}
            barColorOf={(m) => barFor.get(m.id)}
            oppColorOf={(m) => oppFor.get(m.id)}
            loadingGoals={EMPTY}
            openId={openId}
            onToggle={(m) => setOpenId((v) => (v === m.id ? null : m.id))}
            selectedDay={selDay}
          />
        ) : (
          <div className="empty">
            <h3>이 달에 끝난 경기가 없습니다</h3>
            <p>경기가 끝나면 여기에 결과가 쌓입니다.</p>
          </div>
        )}
      </section>

      <p className="sum__foot">
        팀 이름을 누르면 그 팀 화면으로 이동합니다.
        {TARGETS.map((t) => (
          <button key={t.id} className="sum__jump" onClick={() => onOpenTeam(t.id)}>
            {t.name}
          </button>
        ))}
      </p>
    </div>
  );
}

const EMPTY: Set<string> = new Set();

export type { Target };
