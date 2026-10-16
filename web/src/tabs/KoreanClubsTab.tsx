import { useEffect, useMemo, useState } from 'react';
import { KOREAN_CLUBS, comp, themeVarsOf, type KoreanClub, type TargetId } from '../config/targets';
import type { Match, StandingRow, StandingTable } from '../lib/types';
import { loadLeagueTable, loadSchedule } from '../lib/api';
import { buildTable } from '../lib/league';
import { nextUpOf } from '../lib/summary';
import { seasonRecord } from '../lib/compare';
import { kstParts, kstTime } from '../lib/kst';
import { PaletteProvider } from '../lib/palette';
import { Crest, CrestGlowScope } from '../components/Crest';
import { CompCrest } from '../components/CompCrest';
import { KorFlag } from '../components/KorFlag';
import { Swap, dirOf, type SwapDir } from '../components/Swap';
import { PlayersTab } from './PlayersTab';

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

/** 클럽 요약 + 리그 순위 */
function ClubTop({ club, matches }: { club: KoreanClub; matches: Match[] }) {
  const lg = club.league!;
  const [table, setTable] = useState<{ league: string; t: StandingTable | null } | null>(null);
  useEffect(() => {
    let alive = true;
    loadLeagueTable(lg, comp(lg).name, club.espnTeamId).then((r) => {
      if (!alive) return;
      setTable({ league: lg, t: buildTable(r.data.table, r.data.matches, lg, comp(lg).name) });
    });
    return () => { alive = false; };
  }, [lg, club.espnTeamId]);
  const t = table?.league === lg ? table.t : undefined;

  const row = t?.rows.find((r) => r.team.id === club.espnTeamId);
  const next = nextUpOf(matches);
  const rec = seasonRecord(matches, club.espnTeamId);
  const gd = row ? row.gf - row.ga : null;

  /* 순위표는 그 클럽 앞뒤 두 줄씩 — 스무 줄을 다 그리면 아래 선수 스탯이 한참 밀린다 */
  const around = useMemo<StandingRow[]>(() => {
    if (!t) return [];
    const i = t.rows.findIndex((r) => r.team.id === club.espnTeamId);
    if (i < 0) return t.rows.slice(0, 5);
    const from = Math.max(0, Math.min(i - 2, t.rows.length - 5));
    return t.rows.slice(from, from + 5);
  }, [t, club.espnTeamId]);

  const leagueName = t?.groupName ? `${comp(lg).name} · ${t.groupName}` : comp(lg).name;

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
              <CompCrest k={lg} size={13} />
              {leagueName}{row ? ` · ${row.played}경기` : ''}
            </span>
          </div>
        </div>

        <div className="kclub__kpi num">
          <div data-hl="true"><b>{row ? `${row.rank}위` : '–'}</b><span>순위</span></div>
          <div><b>{row ? row.points : '–'}</b><span>승점</span></div>
          <div><b>{row ? `${row.win}-${row.draw}-${row.loss}` : '–'}</b><span>승무패</span></div>
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
        <div className="kclub__line">
          <span className="eyebrow">최근 5경기</span>
          <span className="kclub__form">
            {rec.form.length
              ? rec.form.map((f, i) => <i key={i} className="fchip" data-r={f}>{f}</i>)
              : <span className="kclub__none">기록 없음</span>}
          </span>
          <span className="kclub__formnote">오른쪽이 최근 · 모든 대회</span>
        </div>
      </div>

      <div className="kclub__table">
        <div className="kclub__th">
          <span className="eyebrow">{leagueName} 순위</span>
          <span className="num">경기 · 승무패 · 승점</span>
        </div>
        {!table ? (
          <div className="skel" style={{ height: 200 }} />
        ) : around.length ? (
          around.map((r) => (
            <div key={r.team.id} className="kclub__tr" data-me={r.team.id === club.espnTeamId || undefined}>
              <span className="num kclub__rk">{r.rank}</span>
              <span className="kclub__tn">
                <Crest team={r.team} size={16} />
                <b>{r.team.name}</b>
              </span>
              <span className="num">{r.played}</span>
              <span className="num">{r.win}-{r.draw}-{r.loss}</span>
              <b className="num kclub__pts">{r.points}</b>
            </div>
          ))
        ) : (
          <p className="kclub__none">순위표가 아직 없습니다.</p>
        )}
      </div>
    </div>
  );
}

function NextLine({ m, teamId }: { m: Match; teamId: string }) {
  const home = m.home.id === teamId;
  const opp = home ? m.away : m.home;
  return (
    <span className="kclub__next">
      <i className="hachip" data-side={home ? 'H' : 'A'}>{home ? 'H' : 'A'}</i>
      <span>{home ? 'vs' : '@'}</span>
      <Crest team={opp} size={16} />
      <b>{opp.name}</b>
      <CompCrest k={m.competition} size={13} />
    </span>
  );
}
