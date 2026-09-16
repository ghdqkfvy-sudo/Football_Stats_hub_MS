import { useEffect, useMemo, useState } from 'react';
import type { Target } from '../config/targets';
import type { Match, StandingTable } from '../lib/types';
import { loadLeague, type Source , loadScheduleExtras, type ScheduleExtras } from '../lib/api';
import { buildTable, deriveLeaders, tableRound } from '../lib/league';
import { usePalette } from '../lib/palette';
import { StandingsTable } from '../components/StandingsTable';
import { LeaderBoard } from '../components/LeaderBoard';
import { CompCrest } from '../components/CompCrest';
import { CupPath } from '../components/CupPath';

/** 순위가 안 맞아 보일 때 제일 먼저 필요한 정보는 "언제 뜬 값인가" 다 */
const SRC: Record<Source, string> = {
  live: '실시간',
  feed: '자동 갱신',
  none: '데이터 없음',
};

export function StandingsTab({
  target, teamMatches,
}: {
  target: Target;
  /** 우리 팀 일정 — 컵은 리그 단위 데이터가 없어서 이쪽으로 대진을 그린다 */
  teamMatches: Match[];
}) {
  const palette = usePalette();
  const [active, setActive] = useState<string>(target.league ?? target.competitions[0]);
  const [cache, setCache] = useState<
    Record<string, { table?: StandingTable; matches: Match[]; source: Source; fetchedAt: string }>
  >({});
  const [loading, setLoading] = useState(false);

  /* 컵은 순위표가 없다 — 대신 우리가 나온 라운드부터 결승까지를 그린다.
     라운드 목록은 ESPN 스코어보드의 calendar 에서 받아 둔 값이다. */
  const [extras, setExtras] = useState<ScheduleExtras | null>(null);
  useEffect(() => {
    let alive = true;
    setExtras(null);
    loadScheduleExtras(target.espnTeamId).then((e) => { if (alive) setExtras(e); });
    return () => { alive = false; };
  }, [target.espnTeamId]);

  useEffect(() => {
    setActive(target.league ?? target.competitions[0]);
  }, [target]);

  useEffect(() => {
    if (cache[active]) return;
    let alive = true;
    setLoading(true);
    loadLeague(active, palette.name(active)).then((r) => {
      if (!alive) return;
      setCache((c) => ({ ...c, [active]: { ...r.data, source: r.source, fetchedAt: r.fetchedAt } }));
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [active, cache, palette]);

  const data = cache[active];

  const table = useMemo(
    () => (data ? buildTable(data.table, data.matches, active, palette.name(active)) : null),
    [data, active, palette],
  );

  const leaders = useMemo(() => (data ? deriveLeaders(data.matches) : []), [data]);

  /* 이 대회가 컵인지 — "순위표에 진출권 구분이 없고(=ESPN 이 순위표를 안 준다)
     라운드 목록이 있다" 가 기준이다. 대회 이름으로 판별하면 새 컵마다 깨진다. */
  const cupRounds = useMemo(() => {
    const rs = extras?.rounds?.[active];
    if (!rs?.length) return null;
    return table && table.zones && Object.keys(table.zones).length > 0 ? null : rs;
  }, [extras, active, table]);

  /* 컵은 리그 전체 경기를 모으지 않는다(380경기짜리 파일을 컵마다 만들 이유가
     없다). 우리 팀 일정에서 그 대회 경기만 추려 대진을 그린다. */
  const cupMatches = useMemo(
    () => teamMatches.filter((m) => m.competition === active),
    [teamMatches, active],
  );

  const finished = data?.matches.filter((m) => m.status === 'finished').length ?? 0;
  const withGoals = data?.matches.filter((m) => m.goals.length > 0).length ?? 0;

  return (
    <div className="page">
      {/* 참가 대회 선택 */}
      <nav className="comps" aria-label="참가 대회">
        {target.competitions.map((c) => (
          <button
            key={c}
            className="comps__b"
            aria-pressed={c === active}
            style={{ ['--c' as string]: palette.color(c) }}
            onClick={() => setActive(c)}
          >
            <CompCrest k={c} size={17} />
            {palette.name(c)}
          </button>
        ))}
      </nav>

      {loading && !data && (
        <>
          <div className="skel" style={{ height: 44 }} />
          <div className="skel" style={{ height: 480 }} />
        </>
      )}

      {cupRounds && (
        <section>
          <div className="sec__head">
            <h2 className="sec__title">{palette.name(active)}</h2>
            <span className="sec__note">토너먼트 — 순위표 대신 대진으로 봅니다</span>
          </div>
          <CupPath
            rounds={cupRounds}
            matches={cupMatches}
            focusTeamId={target.espnTeamId}
            competitionName={palette.name(active)}
          />
        </section>
      )}

      {!cupRounds && data && !table && (
        <div className="empty">
          <h3>{palette.name(active)} 순위표가 없습니다</h3>
          <p>
            토너먼트 대회이거나 아직 개막 전이라 ESPN에 순위 데이터가 없습니다. 경기가 시작되면
            결과로 표가 자동 생성됩니다.
          </p>
        </div>
      )}

      {table && (
        <>
          <section>
            <div className="sec__head">
              <h2 className="sec__title">{table.competitionName} 순위</h2>
              <span className="sec__note">
                {table.derived
                  ? `${finished}경기 결과로 산출 · 최대 ${tableRound(table)}R 반영`
                  : `ESPN 공식 집계 ${tableRound(table)}R 기준 · 최근 경기 반영에 시차가 있습니다`}
                {' · '}
                {SRC[data.source]}
                {data.fetchedAt ? ` ${new Date(data.fetchedAt).toLocaleString('ko-KR', {
                  month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
                })} 기준` : ''}
              </span>
            </div>
            <StandingsTable
              table={table}
              matches={data.matches}
              focusTeamId={target.espnTeamId}
            />
            <p className="tbl__hint">팀을 누르면 홈·원정 경기 결과가 펼쳐집니다.</p>
          </section>

          <section>
            <div className="sec__head">
              <h2 className="sec__title">{table.competitionName} 공격 포인트</h2>
              <span className="sec__note">
                {withGoals}/{finished}경기의 득점 기록 반영
              </span>
            </div>
            <LeaderBoard
              rows={leaders}
              note={
                withGoals < finished
                  ? '득점 상세가 제공된 경기만 집계됩니다'
                  : undefined
              }
            />
          </section>
        </>
      )}
    </div>
  );
}
