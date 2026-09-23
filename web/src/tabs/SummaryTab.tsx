import { useEffect, useMemo, useRef, useState } from 'react';
import { TARGETS, comp, getTarget, type Target, type TargetId } from '../config/targets';
import type { CompetitionKey, Match, StandingTable } from '../lib/types';
import { loadLeagueTable, loadSchedule } from '../lib/api';
import { buildTable, deriveLeaders, tableRound } from '../lib/league';
import { dayKey, monthKey, todayKey } from '../lib/kst';
import {
  cycleIndex, matchesByDay, monthResults, nextUpBoard, shiftWeek, weekStartKey,
  type TeamFeed,
} from '../lib/summary';
import { MatchdayCard } from '../components/MatchdayHero';
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
  /** 사용자가 카드나 날짜로 고른 팀 — 없으면 가장 가까운 경기의 팀 */
  const [pickedTeam, setPickedTeam] = useState<string | null>(null);
  const heroId = (pickedTeam && board.some((b) => b.teamId === pickedTeam))
    ? pickedTeam
    : board[0]?.teamId ?? null;
  const hero = board.find((b) => b.teamId === heroId);
  const rest = board.filter((b) => b.teamId !== heroId);

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
    lastHero.current = list[i].match.id;   // 아래 이펙트가 주를 되돌리지 않게
    setPickedTeam(list[i].teamId);
  };

  /* ── 대회 순위 ────────────────────────────────────── */
  const [active, setActive] = useState<CompetitionKey>('eng.1');
  const [tables, setTables] = useState<Record<string, { table: StandingTable | null; matches: Match[] } | null>>({});
  const asked = useRef(new Set<string>());

  useEffect(() => {
    if (asked.current.has(active)) return;
    asked.current.add(active);
    setTables((t) => ({ ...t, [active]: null }));
    loadLeagueTable(active, comp(active).name).then((r) => {
      setTables((t) => ({
        ...t,
        [active]: {
          table: buildTable(r.data.table, r.data.matches, active, comp(active).name),
          matches: r.data.matches,
        },
      }));
    });
  }, [active]);

  const league = tables[active];

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
    for (const t of TARGETS) if (t.kind === 'club') out[t.espnTeamId] = t.theme.accent;
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
            <MatchdayCard target={targetOf(hero.teamId)} match={hero.match} hero />
            <div className="mdh__rest">
              {rest.map((b) => (
                <MatchdayCard
                  key={b.teamId}
                  target={targetOf(b.teamId)}
                  match={b.match}
                  onSelect={() => setPickedTeam(b.teamId)}
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
            <LeaderBoard rows={leaders} teamColors={clubColors} />
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
