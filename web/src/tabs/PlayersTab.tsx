import { useEffect, useMemo, useState } from 'react';
import type { Target } from '../config/targets';
import type { Match } from '../lib/types';
import type { SquadData } from '../lib/api';
import { loadSquad } from '../lib/api';
import { bestEleven, buildSquad, orderForList, teamCohesion } from '../lib/squad';
import { Pitch } from '../components/Pitch';
import { PlayerTable } from '../components/PlayerTable';
import { LeaderBoard } from '../components/LeaderBoard';

export function PlayersTab({ target, matches }: { target: Target; matches: Match[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);

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

  const { players, formation, covered } = useMemo(
    () => buildSquad(matches, squad?.lineups ?? {}, squad?.athletes ?? {}, target.espnTeamId),
    [matches, squad, target.espnTeamId],
  );

  const xi = useMemo(
    () => bestEleven(players, formation, target.espnTeamId),
    [players, formation, target.espnTeamId],
  );

  /** 베스트 11(공격→골키퍼) 먼저, 나머지는 선발·출전·득점 순 */
  const ordered = useMemo(() => orderForList(players, xi.slots), [players, xi]);

  const leaders = useMemo(
    () =>
      players
        .filter((p) => p.points > 0)
        .map((p) => ({
          name: p.name,
          teamId: target.espnTeamId,
          goals: p.goals,
          assists: p.assists,
          points: p.points,
        })),
    [players, target.espnTeamId],
  );

  if (loadingSquad) {
    return (
      <div className="page">
        <div className="skel" style={{ height: 700 }} />
      </div>
    );
  }

  if (!players.length) {
    return (
      <div className="page">
        <div className="empty">
          <h3>{target.nameEn} 라인업 기록이 아직 없습니다</h3>
          <p>
            베스트 11 은 경기별 라인업(<code>formationPlace</code>)으로 만듭니다.
            경기가 끝나는 대로 자동으로 쌓이며, 프록시(<code>VITE_API_BASE</code>)나
            정적 피드(<code>/data/squad-*.json</code>) 중 하나는 연결되어 있어야 합니다.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <section>
        <div className="sec__head">
          <h2 className="sec__title">선수 스탯</h2>
          <span className="sec__note">
            {covered}경기 라인업 기준 · 포메이션 {xi.formation}
            {xi.verified ? '' : ' · 포지션 그룹 배치'}
          </span>
        </div>

        <div className="squad">
          <Pitch
            slots={xi.slots}
            formation={xi.formation}
            verified={xi.verified}
            covered={covered}
            chem={teamCohesion(xi.slots, covered)}
            activeId={activeId}
            onHover={setActiveId}
          />
          <PlayerTable players={ordered} activeId={activeId} onHover={setActiveId} />
        </div>
      </section>

      <section>
        <div className="sec__head">
          <h2 className="sec__title">팀 공격 포인트</h2>
          <span className="sec__note">{covered}경기 득점 기록 기준</span>
        </div>
        <LeaderBoard rows={leaders} limit={12} />
      </section>
    </div>
  );
}
