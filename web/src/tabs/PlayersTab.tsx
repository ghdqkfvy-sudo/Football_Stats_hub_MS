import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Target } from '../config/targets';
import type { Match } from '../lib/types';
import type { SquadData } from '../lib/api';
import { loadSquad } from '../lib/api';
import { bestEleven, buildSquad, orderForList, teamCohesion } from '../lib/squad';
import { Pitch } from '../components/Pitch';
import { PlayerTable } from '../components/PlayerTable';
import { LeaderBoard } from '../components/LeaderBoard';
import { PlayerDetail } from '../components/PlayerDetail';
import type { PlayerSeason } from '../lib/squad';
import { KorFlag } from '../components/KorFlag';

export function PlayersTab({
  target, matches, embedded = false, marks,
}: {
  target: Target;
  matches: Match[];
  /** 다른 탭 안에 들어갈 때(대한민국 › 소속팀) — 바깥 .page 를 두르지 않는다 */
  embedded?: boolean;
  /** 코리안리거(id → 한국어 이름) — 베스트 11·목록에 태극기로 표시 */
  marks?: ReadonlyMap<string, string>;
}) {
  /*
   * 강조는 마우스를 올린 동안만(hoverId). 포메이션에서 선수를 누르면 목록에서
   * 누른 것과 같은 선수 상세 창이 뜬다 — 예전에는 누르면 "고정 강조" 만 되고
   * 상세는 목록에서 다시 눌러야 했다.
   */
  const [hoverId, setHoverId] = useState<string | null>(null);
  const activeId = hoverId;
  const [detail, setDetail] = useState<PlayerSeason | null>(null);
  const closeDetail = useCallback(() => setDetail(null), []);

  /* 라인업·선수 프로필은 전부 네트워크에서 온다.
     경기별 로스터에 골·도움까지 들어 있어 이름 매칭이 필요 없다. */
  const [squad, setSquad] = useState<SquadData | null>(null);
  const [loadingSquad, setLoadingSquad] = useState(true);
  useEffect(() => {
    let alive = true;
    setSquad(null);
    setLoadingSquad(true);
    loadSquad(target.espnTeamId, matches).then((r) => {
      if (!alive) return;
      setSquad(r.data);
      setLoadingSquad(false);
    });
    return () => {
      alive = false;
    };
  }, [target.espnTeamId, matches]);

  const { players, departed, formation, covered, formationTally, slotShape } = useMemo(
    () => buildSquad(matches, squad?.lineups ?? {}, squad?.athletes ?? {}, target.espnTeamId),
    [matches, squad, target.espnTeamId],
  );

  const xi = useMemo(
    () => bestEleven(players, formation, slotShape),
    [players, formation, slotShape],
  );

  /** 베스트 11 에 못 든 코리안리거 — 포메이션 위에 한 줄로 알린다(목록에서는 강조) */
  const outOfXi = useMemo(() => {
    if (!marks?.size) return [];
    const inXi = new Set(xi.slots.map((s) => s.player?.id).filter(Boolean));
    return players.filter((p) => marks.has(p.id) && !inXi.has(p.id));
  }, [marks, xi, players]);

  /** 베스트 11(공격→골키퍼) 먼저, 나머지는 선발·출전·득점 순 */
  const ordered = useMemo(() => orderForList(players, xi.slots), [players, xi]);

  const leaders = useMemo(
    () =>
      /* 팀 공격 포인트는 팀의 시즌 기록 — 떠난 선수가 이 팀에서 올린 것도 넣는다 */
      [...players, ...departed]
        .filter((p) => p.points > 0)
        .map((p) => ({
          name: marks?.get(p.id) ?? p.name,
          teamId: target.espnTeamId,
          goals: p.goals,
          assists: p.assists,
          points: p.points,
        })),
    [players, departed, target.espnTeamId, marks],
  );

  const Wrap = embedded ? EmbeddedWrap : PageWrap;

  if (loadingSquad) {
    return (
      <Wrap>
        <div className="skel" style={{ height: 700 }} />
      </Wrap>
    );
  }

  if (!players.length) {
    return (
      <Wrap>
        <div className="empty">
          <h3>{target.nameEn} 라인업 기록이 아직 없습니다</h3>
          <p>
            베스트 11 은 경기별 라인업(<code>formationPlace</code>)으로 만듭니다.
            경기가 끝나는 대로 자동으로 쌓이며, 프록시(<code>VITE_API_BASE</code>)나
            정적 피드(<code>/data/squad-*.json</code>) 중 하나는 연결되어 있어야 합니다.
          </p>
        </div>
      </Wrap>
    );
  }

  return (
    <Wrap>
      <section>
        <div className="sec__head">
          <h2 className="sec__title">선수 스탯</h2>
          <span className="sec__note">
            {covered}경기 라인업 기준 · 포메이션 {xi.formation}
            {xi.verified ? '' : ' · 포지션 그룹 배치'}
          </span>
        </div>

        {outOfXi.map((p) => (
          <p className="squad__kor" key={p.id}>
            <KorFlag />
            <b>{marks?.get(p.id)}</b>
            <span className="num">
              베스트 11 밖 · {p.apps}경기(선발 {p.starts}/{covered}) · {p.minutes}분
            </span>
            <em>아래 목록에 강조</em>
          </p>
        ))}

        <div className="squad">
          <Pitch
            slots={xi.slots}
            formation={xi.formation}
            verified={xi.verified}
            covered={covered}
            chem={teamCohesion(xi.slots, covered)}
            tally={formationTally}
            marks={marks}
            activeId={activeId}
            onHover={setHoverId}
            onSelect={(id) => {
              const p = id ? players.find((x) => x.id === id) : undefined;
              if (p) { setHoverId(null); setDetail(p); }
            }}
          />
          <PlayerTable
            players={ordered}
            activeId={activeId}
            onHover={setHoverId}
            onClose={() => setHoverId(null)}
            onOpen={setDetail}
            marks={marks}
          />
          <PlayerDetail p={detail} onClose={closeDetail} />
        </div>
      </section>

      <section>
        <div className="sec__head">
          <h2 className="sec__title">팀 공격 포인트</h2>
          <span className="sec__note">{covered}경기 득점 기록 기준</span>
        </div>
        <LeaderBoard rows={leaders} variant="bar" />
      </section>
    </Wrap>
  );
}

const PageWrap = ({ children }: { children: React.ReactNode }) => <div className="page">{children}</div>;
const EmbeddedWrap = ({ children }: { children: React.ReactNode }) => <>{children}</>;
