import { useEffect, useMemo, useState } from 'react';
import { KOREAN_CLUBS, comp, mobileName, themeVarsOf, type KoreanClub, type TargetId } from '../config/targets';
import type { CompetitionKey, Match, StandingRow, StandingTable } from '../lib/types';
import { loadLeagueTable, loadSchedule, loadScheduleExtras, type CupRound } from '../lib/api';
import { buildTable } from '../lib/league';
import { nextUpOf } from '../lib/summary';
import { euroStage, seasonRecord, type EuroStage } from '../lib/compare';
import { roundKo } from '../lib/rounds';
import { kstParts, kstTime } from '../lib/kst';
import { PaletteProvider } from '../lib/palette';
import { Crest, CrestGlowScope } from '../components/Crest';
import { CompCrest } from '../components/CompCrest';
import { KorFlag } from '../components/KorFlag';
import { Swap, dirOf, type SwapDir } from '../components/Swap';
import { PlayersTab } from './PlayersTab';
import { LiveMatchView } from '../components/LiveMatch';
import { isTodayLive, useLive } from '../lib/live';
import { resultOf } from '../lib/league';
import { useMedia } from '../lib/useMedia';
import { useSquadPlayers } from '../lib/liveSquad';
import { RatingBadge } from '../components/RatingBadge';

/**
 * 대한민국 › 소속팀 — 코리안리거가 뛰는 클럽(뮌헨 · LAFC · 아틀레티코).
 *
 * 팀 탭을 늘리지 않고, 위의 전환 버튼으로 클럽을 고른다(선수 스탯 탭의
 * 득점/도움/공격 포인트와 같은 모양). 고른 클럽은
 *   1) 요약 — 리그 순위·승점·전적·득실, 다음 경기, 최근 5경기
 *   2) 리그 순위 — 그 클럽 앞뒤 다섯 줄
 *   3) 선수 스탯 — **클럽 탭과 같은 화면**(베스트 11 · 목록 · 호버 카드 · 상세)
 * 코리안리거는 베스트 11·목록에 태극기로 표시한다.
 *
 * 화면 색은 고른 클럽의 팀 컬러다(그 안의 카드·게이지가 클럽 탭과 같아 보이게).
 */
export function KoreanClubsTab({ pick, onPick }: { pick: TargetId | null; onPick: (id: TargetId) => void }) {
  /* 세 클럽 일정을 다 받는다 — 처음 고를 클럽(다음 경기가 가장 빠른 클럽)을 정하려면 필요하다 */
  const [feeds, setFeeds] = useState<Record<string, Match[]>>({});
  useEffect(() => {
    let alive = true;
    for (const c of KOREAN_CLUBS) {
      loadSchedule(c.espnTeamId).then((r) => {
        if (alive) setFeeds((f) => ({ ...f, [c.id]: r.data }));
      });
    }
    return () => { alive = false; };
  }, []);
  const loaded = KOREAN_CLUBS.every((c) => feeds[c.id]);

  /* 고른 클럽 — 없으면 다음 경기가 가장 빠른 클럽(Summary 의 대한민국 카드와 같은 기준) */
  const soonest = useMemo(() => {
    const next = KOREAN_CLUBS
      .map((c) => ({ c, m: nextUpOf(feeds[c.id] ?? []) }))
      .filter((x) => x.m)
      .sort((a, b) => a.m!.kickoffUtc.localeCompare(b.m!.kickoffUtc));
    return next[0]?.c.id ?? KOREAN_CLUBS[0].id;
  }, [feeds]);
  const club = KOREAN_CLUBS.find((c) => c.id === pick) ?? KOREAN_CLUBS.find((c) => c.id === soonest)!;

  const [dir, setDir] = useState<SwapDir>('fade');
  const choose = (id: TargetId) => {
    if (id === club.id) return;
    setDir(dirOf(KOREAN_CLUBS.findIndex((c) => c.id === club.id), KOREAN_CLUBS.findIndex((c) => c.id === id)));
    onPick(id);
  };

  const matches = feeds[club.id];

  return (
    <div className="page kclub">
      <section>
        <div className="sec__head">
          <h2 className="sec__title">소속팀</h2>
          <span className="sec__note">코리안리거가 뛰는 클럽 · 리그 순위 · 베스트 11 · 선수 스탯</span>
        </div>

        <div className="kclub__sw" role="tablist" aria-label="소속팀 고르기">
          {KOREAN_CLUBS.map((c) => (
            <button
              key={c.id}
              role="tab"
              aria-selected={c.id === club.id}
              data-on={c.id === club.id || undefined}
              className="kclub__b"
              style={{ ['--club' as string]: c.theme.accent }}
              onClick={() => choose(c.id)}
            >
              <Crest
                team={{ id: c.espnTeamId, name: c.name, shortName: c.name, abbr: c.abbr, logo: c.crest }}
                size={22}
                glow={false}
              />
              <span className="kclub__bt">
                <b>{c.name}</b>
                <small>
                  {c.koreans.map((k) => (
                    <span key={k.id}><KorFlag />{k.nameKo}</span>
                  ))}
                </small>
              </span>
            </button>
          ))}
        </div>
      </section>

      <Swap k={`${club.id}:${matches ? 1 : 0}`} dir={dir}>
        <ClubPanel club={club} matches={matches} loaded={loaded} />
      </Swap>
    </div>
  );
}

/**
 * 소속팀 화면의 오늘의 경기 — 클럽 탭이 없어서(대한민국 › 소속팀) 버튼으로 같은 화면을 펼친다.
 * 경기 중이면 처음부터 펼쳐 둔다.
 */
function ClubToday({ club, matches }: { club: KoreanClub; matches: Match[] }) {
  const live = useLive(club.id);
  const [open, setOpen] = useState<boolean | null>(null);
  if (!live || !isTodayLive(live)) return null;
  if (live.phase === 'pre' && !live.home.starters.length) return null;
  /* 경기 중이거나 오늘 끝났으면 펼친 채로 — Summary 의 오늘의 경기에서 넘어오면 바로 보이게 */
  const shown = open ?? live.phase !== 'pre';
  return (
    <div className="kclub__today">
      <button className="hero__live" data-phase={live.phase} onClick={() => setOpen(!shown)} aria-expanded={shown}>
        <i aria-hidden="true" />
        {live.phase === 'live' ? <>LIVE {live.clock && <span className="num">{live.clock}</span>} · 오늘의 경기</> : '오늘의 경기'}
        {shown ? ' 접기' : ' 보기'}
      </button>
      {shown && <LiveMatchView live={live} match={matches.find((m) => m.id === live.espnId)} teamId={club.espnTeamId} matches={matches} />}
    </div>
  );
}

/** 고른 클럽 한 곳 — 팀 컬러·대회 색을 그 클럽 것으로 갈아 끼운다 */
function ClubPanel({ club, matches, loaded }: { club: KoreanClub; matches: Match[] | undefined; loaded: boolean }) {
  const scope = useMemo<ReadonlySet<string>>(() => new Set([club.espnTeamId]), [club.espnTeamId]);
  const marks = useMemo(() => new Map(club.koreans.map((k) => [k.id, k.nameKo])), [club]);

  return (
    <PaletteProvider target={club}>
      <CrestGlowScope.Provider value={scope}>
        <div className="kclub__panel" style={themeVarsOf(club)}>
          {!matches ? (
            <div className="skel" style={{ height: 260 }} />
          ) : (
            <>
              <ClubTop club={club} matches={matches} />
              <ClubToday club={club} matches={matches} />
              <PlayersTab target={club} matches={matches} embedded marks={marks} />
            </>
          )}
          {!matches && loaded && (
            <div className="empty">
              <h3>{club.name} 일정이 아직 없습니다</h3>
              <p>다음 수집 때 채워집니다.</p>
            </div>
          )}
        </div>
      </CrestGlowScope.Provider>
    </PaletteProvider>
  );
}

/** 유럽대항전 — 이 클럽이 뛰는 첫 대회(챔스 → 유로파 → 컨퍼런스) */
const EUROPE: CompetitionKey[] = ['uefa.champions', 'uefa.europa', 'uefa.europa.conf'];

/** 대회 순위표 하나 받아 두기 — 받는 중 undefined · 없음 null */
function useTable(lg: CompetitionKey | undefined, teamId: string): StandingTable | null | undefined {
  const [got, setGot] = useState<{ k: string; t: StandingTable | null } | null>(null);
  useEffect(() => {
    if (!lg) return;
    let alive = true;
    loadLeagueTable(lg, comp(lg).name, teamId).then((r) => {
      if (alive) setGot({ k: lg, t: buildTable(r.data.table, r.data.matches, lg, comp(lg).name) });
    });
    return () => { alive = false; };
  }, [lg, teamId]);
  return got && got.k === lg ? got.t : undefined;
}

/** 그 클럽 앞뒤 n 줄(기본 다섯) */
function aroundOf(t: StandingTable | null | undefined, teamId: string, n = 5): StandingRow[] {
  if (!t) return [];
  const i = t.rows.findIndex((r) => r.team.id === teamId);
  if (i < 0) return t.rows.slice(0, n);
  const from = Math.max(0, Math.min(i - Math.floor(n / 2), t.rows.length - n));
  return t.rows.slice(from, from + n);
}

/** 두 박스가 나란히 놓이는 폭 — kclubs.css 의 @media (min-width: 901px) 와 같다 */
const SIDE_BY_SIDE = '(min-width: 901px)';

/**
 * 클럽 요약 + 순위 — **리그 / 유럽대항전 전환**.
 *
 * 전환하면 위 요약 카드(순위·승점·승무패·득실, 다음 경기, 최근 5경기)도 그 대회
 * 기준으로 바뀐다(2026-10-16 요청). 유럽대항전은 리그 페이즈면 순위표, 토너먼트로
 * 올라가면 지금 라운드("16강")와 그 라운드 1·2차전 — Summary 팀 비교의 "챔스" 칸과
 * 같은 판정(euroStage)이다.
 */
function ClubTop({ club, matches }: { club: KoreanClub; matches: Match[] }) {
  const lg = club.league!;
  const euro = EUROPE.find((k) => matches.some((m) => m.competition === k));
  const [view, setView] = useState<'league' | 'euro'>('league');
  const showEuro = !!euro && view === 'euro';

  const leagueT = useTable(lg, club.espnTeamId);
  const euroT = useTable(euro, club.espnTeamId);
  const [rounds, setRounds] = useState<CupRound[] | null>(null);
  useEffect(() => {
    if (!euro) return;
    let alive = true;
    loadScheduleExtras(club.espnTeamId).then((e) => { if (alive) setRounds(e.rounds[euro] ?? []); });
    return () => { alive = false; };
  }, [euro, club.espnTeamId]);

  const euroGames = useMemo(() => (euro ? matches.filter((m) => m.competition === euro) : []), [matches, euro]);
  const euroRow = euroT?.rows.find((r) => r.team.id === club.espnTeamId);
  const stage = useMemo<EuroStage | null>(
    () => (euro && rounds ? euroStage(euroGames, club.espnTeamId, rounds, euroRow?.rank) : null),
    [euro, rounds, euroGames, club.espnTeamId, euroRow?.rank],
  );

  /* 지금 보는 대회 기준의 값들 */
  const cur = showEuro ? euro! : lg;
  const t = showEuro ? euroT : leagueT;
  const row = t?.rows.find((r) => r.team.id === club.espnTeamId);
  const scoped = showEuro ? euroGames : matches;
  const next = nextUpOf(scoped);
  const rec = seasonRecord(scoped, club.espnTeamId);
  /* 승무패·득실은 표 줄이 없으면(토너먼트만 치른 대회 등) 그 대회 경기 기록으로 */
  const w = row ? row.win : rec.win, d = row ? row.draw : rec.draw, l = row ? row.loss : rec.loss;
  const gd = row ? row.gf - row.ga : rec.played ? rec.gf - rec.ga : null;
  const played = row ? row.played : rec.played;
  const ko = showEuro && stage?.kind === 'ko' ? stage : null;

  /* 나란히 놓이면 왼쪽(최근 5경기 목록 · 코리안리거)과 높이를 맞춰 일곱 줄, 쌓이면(폰 포함) 다섯 줄 그대로 */
  const wide = useMedia(SIDE_BY_SIDE);
  const around = useMemo(() => aroundOf(t, club.espnTeamId, wide ? 7 : 5), [t, club.espnTeamId, wide]);
  /* 넓은 화면 — 최근 5경기를 경기 목록으로(순위표 5줄과 높이가 맞는다). 폰 · 좁은 화면은 칩 한 줄 그대로 */
  const recent = useMemo(
    () => scoped
      .filter((m) => !/friendly/.test(m.competition) && resultOf(m, club.espnTeamId) !== null)
      .sort((a, b) => b.kickoffUtc.localeCompare(a.kickoffUtc))
      .slice(0, 5),
    [scoped, club.espnTeamId],
  );
  const koGames = useMemo(() => {
    if (!ko || !rounds) return [];
    const r = rounds.find((x) => roundKo(x.label) === ko.round);
    return r ? euroGames.filter((m) => m.kickoffUtc >= r.start && m.kickoffUtc <= r.end) : [];
  }, [ko, rounds, euroGames]);

  const curName = comp(cur).name;
  const phase = showEuro ? (ko ? '토너먼트' : '리그 페이즈') : t?.groupName;
  const title = phase ? `${curName} · ${phase}` : curName;

  return (
    <div className="kclub__top">
      <div className="kclub__hero">
        <div className="kclub__id">
          <Crest
            team={{ id: club.espnTeamId, name: club.name, shortName: club.name, abbr: club.abbr, logo: club.crest }}
            size={44}
          />
          <div>
            <b>{club.name}</b>
            <span>
              <CompCrest k={cur} size={13} />
              {title}{played ? ` · ${played}경기` : ''}
            </span>
          </div>
        </div>

        <div className="kclub__kpi num">
          <div data-hl="true">
            <b>{ko ? ko.round : row ? `${row.rank}위` : '–'}</b>
            <span>{ko ? '라운드' : '순위'}</span>
          </div>
          <div><b>{row ? row.points : '–'}</b><span>승점</span></div>
          <div><b>{played ? `${w}-${d}-${l}` : '–'}</b><span>승무패</span></div>
          <div><b>{gd === null ? '–' : gd > 0 ? `+${gd}` : gd}</b><span>득실</span></div>
        </div>

        <div className="kclub__line">
          <span className="eyebrow">다음 경기</span>
          {next ? (
            <>
              <NextLine m={next} teamId={club.espnTeamId} />
              <b className="kclub__when num">
                {(() => {
                  const p = kstParts(next.kickoffUtc);
                  return `${p.month}.${p.date} (${p.weekdayKo}) ${next.timeTBD ? 'TBD' : kstTime(next.kickoffUtc)}`;
                })()}
              </b>
            </>
          ) : <span className="kclub__none">예정된 경기 없음</span>}
        </div>
        <div className="kclub__line kclub__line--chips">
          <span className="eyebrow">최근 5경기</span>
          <span className="kclub__form">
            {rec.form.length
              ? rec.form.map((f, i) => <i key={i} className="fchip" data-r={f}>{f}</i>)
              : <span className="kclub__none">기록 없음</span>}
          </span>
          <span className="kclub__formnote">오른쪽이 최근 · {showEuro ? `${curName}만` : '모든 대회'}</span>
        </div>
        <div className="kclub__recent">
          <div className="kclub__rh">
            <span className="eyebrow">최근 5경기</span>
            <span className="kclub__formnote">위가 최근 · {showEuro ? `${curName}만` : '모든 대회'}</span>
          </div>
          {recent.length ? (
            <ol>{recent.map((m) => <RecentRow key={m.id} m={m} teamId={club.espnTeamId} />)}</ol>
          ) : <span className="kclub__none">기록 없음</span>}
        </div>
        <KoreanLine club={club} matches={matches} />
      </div>

      <div className="kclub__table">
        {euro && (
          <div className="kclub__seg" role="tablist" aria-label="순위 대회 고르기">
            <button role="tab" aria-selected={!showEuro} data-on={!showEuro || undefined} onClick={() => setView('league')}>
              <CompCrest k={lg} size={13} />
              <span className="m-full">{comp(lg).name}</span><span className="m-short">{mobileName(lg)}</span>
            </button>
            <button role="tab" aria-selected={showEuro} data-on={showEuro || undefined} onClick={() => setView('euro')}>
              <CompCrest k={euro} size={13} />
              <span className="m-full">{comp(euro).name}</span><span className="m-short">{mobileName(euro)}</span>
            </button>
          </div>
        )}

        {ko ? (
          <>
            <div className="kclub__th kclub__th--ko">
              <span className="eyebrow">{title}</span>
              {euroRow && <span className="num">리그 페이즈 {euroRow.rank}위</span>}
            </div>
            <div className="kclub__ko" data-st={ko.status}>
              <b>{ko.round}</b>
              {ko.text !== ko.round && <span>{ko.text}</span>}
            </div>
            {koGames.map((m, i) => <KoGame key={m.id} m={m} teamId={club.espnTeamId} leg={koGames.length > 1 ? i + 1 : 0} />)}
          </>
        ) : (
          <>
            <div className="kclub__cap eyebrow">{title} 순위</div>
            {/* 머리줄도 표 줄과 같은 칸 — 예전엔 "경기 · 승무패 · 승점" 한 덩어리라 숫자 칸과 어긋났다 */}
            <div className="kclub__tr kclub__tr--h" aria-hidden="true">
              <span>#</span><span>팀</span><span>경기</span><span>승무패</span><span>승점</span>
            </div>
            {t === undefined || (showEuro && !rounds) ? (
              <div className="skel" style={{ height: 200 }} />
            ) : around.length ? (
              <>
                {around.map((r) => <TableRow key={r.team.id} r={r} me={r.team.id === club.espnTeamId} />)}
                {showEuro && stage?.kind === 'league' && stage.phaseOver && <p className="kclub__konote">{stage.text}</p>}
              </>
            ) : (
              <p className="kclub__none">순위표가 아직 없습니다.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** 순위표 한 줄 */
function TableRow({ r, me }: { r: StandingRow; me: boolean }) {
  return (
    <div className="kclub__tr" data-me={me || undefined}>
      <span className="num kclub__rk">{r.rank}</span>
      <span className="kclub__tn">
        <Crest team={r.team} size={16} />
        <b>{r.team.name}</b>
      </span>
      <span className="num">{r.played}</span>
      <span className="num">{r.win}-{r.draw}-{r.loss}</span>
      <b className="num kclub__pts">{r.points}</b>
    </div>
  );
}

/** 토너먼트 경기 한 줄 — 1차전/2차전 · 상대 · 점수(또는 일시) */
function KoGame({ m, teamId, leg }: { m: Match; teamId: string; leg: number }) {
  const home = m.home.id === teamId;
  const opp = home ? m.away : m.home;
  const p = kstParts(m.kickoffUtc);
  const done = m.status === 'finished';
  const ours = home ? m.homeScore : m.awayScore;
  const theirs = home ? m.awayScore : m.homeScore;
  return (
    <div className="kclub__kg">
      <span className="kclub__kgl">{leg ? `${leg}차전` : '단판'}</span>
      <span className="kclub__next">
        <i className="hachip" data-side={home ? 'H' : 'A'}>{home ? 'H' : 'A'}</i>
        <span>vs</span>
        <Crest team={opp} size={16} />
        <b>{opp.name}</b>
      </span>
      <b className="num kclub__kgs">
        {done && ours !== undefined && theirs !== undefined
          ? `${ours} : ${theirs}`
          : `${p.month}.${p.date} ${m.timeTBD ? 'TBD' : kstTime(m.kickoffUtc)}`}
      </b>
    </div>
  );
}

/** 최근 경기 한 줄 — 결과 · 날짜 · 홈/원정 · 상대 · 대회 · 스코어(우리 쪽 먼저) */
function RecentRow({ m, teamId }: { m: Match; teamId: string }) {
  const home = m.home.id === teamId;
  const opp = home ? m.away : m.home;
  const r = resultOf(m, teamId)!;
  const p = kstParts(m.kickoffUtc);
  const [a, b] = home ? [m.homeScore, m.awayScore] : [m.awayScore, m.homeScore];
  return (
    <li>
      <i className="fchip" data-r={r}>{r}</i>
      <span className="kclub__rd num">{p.month}.{p.date}</span>
      <i className="hachip" data-side={home ? 'H' : 'A'}>{home ? 'H' : 'A'}</i>
      <Crest team={opp} size={16} />
      <b>{opp.name}</b>
      <CompCrest k={m.competition} size={12} />
      <span className="kclub__rs num" data-r={r}>{a}<i>:</i>{b}</span>
    </li>
  );
}

/** 코리안리거 시즌 한 줄 — 출전 · 선발 · 분 · 골/도움 · 시즌 평점(FotMob). 넓은 화면에서만 */
function KoreanLine({ club, matches }: { club: KoreanClub; matches: Match[] }) {
  const pool = useSquadPlayers(club.espnTeamId, matches);
  if (!pool.length) return null;
  return (
    <div className="kclub__kor">
      {club.koreans.map((k) => {
        const p = pool.find((x) => x.id === k.id);
        return (
          <div key={k.id} className="kclub__korrow">
            <span className="kclub__korname"><KorFlag />{k.nameKo}</span>
            {p ? (
              <span className="kclub__korstat num">
                <span><b>{p.apps}</b>경기</span>
                <span>선발 <b>{p.starts}</b></span>
                <span><b>{p.minutes}</b>분</span>
                <span><b>{p.goals}</b>골 <b>{p.assists}</b>도움</span>
                {p.inj && <em className="kclub__korinj" data-doubt={p.inj.doubtful || undefined}>{p.inj.ko}</em>}
              </span>
            ) : <span className="kclub__none">이번 시즌 출전 기록 없음</span>}
            {p?.rating != null && <span className="kclub__korrtg"><small>시즌 평점</small><RatingBadge v={p.rating} /></span>}
          </div>
        );
      })}
    </div>
  );
}

function NextLine({ m, teamId }: { m: Match; teamId: string }) {
  const home = m.home.id === teamId;
  const opp = home ? m.away : m.home;
  return (
    <span className="kclub__next">
      <i className="hachip" data-side={home ? 'H' : 'A'}>{home ? 'H' : 'A'}</i>
      <span>vs</span>
      <Crest team={opp} size={16} />
      <b>{opp.name}</b>
      <CompCrest k={m.competition} size={13} />
    </span>
  );
}
