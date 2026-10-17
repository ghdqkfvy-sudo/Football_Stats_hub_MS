import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Target } from '../config/targets';
import type { Match } from '../lib/types';
import type { SquadData } from '../lib/api';
import { loadSquad } from '../lib/api';
import { bestEleven, buildSquad, orderForList, teamCohesion } from '../lib/squad';
import { discipline } from '../lib/discipline';
import { liveInjuries, seasonFromInjury } from '../lib/injury';
import { Pitch } from '../components/Pitch';
import { PlayerTable } from '../components/PlayerTable';
import { LeaderBoard } from '../components/LeaderBoard';
import { PlayerDetail } from '../components/PlayerDetail';
import { InjuryList } from '../components/InjuryList';
import { SuspensionList } from '../components/SuspensionList';
import { CompareBar, PlayerCompare } from '../components/PlayerCompare';
import { rivalsOf } from '../lib/playerCompare';
import type { PlayerSeason } from '../lib/squad';
import { KorFlag } from '../components/KorFlag';

export function PlayersTab({
  target, matches, embedded = false, marks, matchesLoading = false,
}: {
  target: Target;
  matches: Match[];
  /** 다른 탭 안에 들어갈 때(대한민국 › 소속팀) — 바깥 .page 를 두르지 않는다 */
  embedded?: boolean;
  /** 코리안리거(id → 한국어 이름) — 베스트 11·목록에 태극기로 표시 */
  marks?: ReadonlyMap<string, string>;
  /** 일정(matches)을 아직 받는 중 — 그동안은 "기록 없음" 이 아니라 불러오는 중으로 그린다 */
  matchesLoading?: boolean;
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
  /* 선수 비교 — 1번 고정(cmpA) 동안 다음에 누른 선수가 2번. 포메이션 · 목록 · 명단 어디서 골라도 된다 */
  const [cmpA, setCmpA] = useState<PlayerSeason | null>(null);
  const [cmpPair, setCmpPair] = useState<[PlayerSeason, PlayerSeason] | null>(null);
  const closeCompare = useCallback(() => setCmpPair(null), []);
  const cancelCompare = useCallback(() => setCmpA(null), []);

  /* 라인업·선수 프로필은 전부 네트워크에서 온다.
     경기별 로스터에 골·도움까지 들어 있어 이름 매칭이 필요 없다. */
  /*
   * 스쿼드는 **어느 팀 것인지** 와 함께 들고 있는다(App 의 일정과 같은 방식).
   * ⚠️ 예전에는 팀을 바꾸면 첫 화면이 **이전 팀 스쿼드 + 새 팀 일정** 으로 한 번 그려져
   * 선수가 0명으로 계산됐고, "라인업 기록이 아직 없습니다 … 정적 피드 …" 안내가
   * 잠깐 떴다가 사라졌다(2026-10-16). 팀이 맞지 않으면 그냥 불러오는 중이다.
   */
  const [squadOf, setSquadOf] = useState<{ team: string; data: SquadData | null } | null>(null);
  useEffect(() => {
    let alive = true;
    const team = target.espnTeamId;
    loadSquad(team, matches).then((r) => {
      if (alive) setSquadOf({ team, data: r.data });
    });
    return () => {
      alive = false;
    };
  }, [target.espnTeamId, matches]);
  const squad = squadOf?.team === target.espnTeamId ? squadOf.data : null;
  /* 일정이 아직 안 왔을 때(matchesLoading)도 불러오는 중 — 경기 0개로 계산하면 같은 안내가 뜬다 */
  const loadingSquad = squadOf?.team !== target.espnTeamId || matchesLoading;

  const { players: built, departed, formation, covered, formationTally, slotShape } = useMemo(
    () => buildSquad(matches, squad?.lineups ?? {}, squad?.athletes ?? {}, target.espnTeamId),
    [matches, squad, target.espnTeamId],
  );
  /* 징계 — 대회별 경고·퇴장 + FotMob 확정(squad 파일의 sus)을 팀 일정과 맞춰 붙인다 */
  const players = useMemo(
    () => built.map((p) => ({ ...p, disc: discipline(p.recent, matches, squad?.athletes?.[p.id]?.sus, undefined, target.espnTeamId) })),
    [built, matches, squad, target.espnTeamId],
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
  /* 선수 목록 — 경기에 나온 선수 + 맨 아래에 **시즌 내내 결장한 부상자**(호드리구 · 사비 시몬스 …).
     라인업 기록이 없어 베스트 11 · 공격 포인트에는 넣지 않고, 목록에서만 출전 0 · 부상 표시로 보인다. */
  const ordered = useMemo(() => {
    const ids = new Set(players.map((p) => p.id));
    const absent = (squad?.injuries ?? [])
      .filter((x) => !x.espnId || !ids.has(x.espnId))
      .map(seasonFromInjury);
    return [...orderForList(players, xi.slots), ...absent];
  }, [players, xi, squad]);

  const injList = useMemo(() => liveInjuries(squad?.injuries ?? [], players), [squad, players]);

  /** 선수를 눌렀을 때 — 비교 고르는 중이면 2번으로, 아니면 상세 */
  const pick = (p: PlayerSeason) => {
    setHoverId(null);
    if (cmpA) {
      if (p.id === cmpA.id) return;
      setCmpPair([cmpA, p]);
      setCmpA(null);
    } else setDetail(p);
  };
  const startCompare = (p: PlayerSeason) => { setHoverId(null); setDetail(null); setCmpPair(null); setCmpA(p); };
  const rivals = useMemo(() => (cmpA ? rivalsOf(cmpA, ordered) : []), [cmpA, ordered]);

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
          <p>베스트 11 과 선수 기록은 경기별 라인업으로 만듭니다. 경기가 끝나고 다음 수집 때 자동으로 채워집니다.</p>
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
              if (p) pick(p);
            }}
            onLongPress={(id) => { const p = players.find((x) => x.id === id); if (p) startCompare(p); }}
            pinnedId={cmpA?.id ?? null}
          />
          <PlayerTable
            players={ordered}
            activeId={activeId}
            onHover={setHoverId}
            onClose={() => setHoverId(null)}
            onOpen={pick}
            marks={marks}
            onLongPress={startCompare}
            pinnedId={cmpA?.id ?? null}
          />
          <PlayerDetail p={detail} onClose={closeDetail} onCompare={startCompare} />
          <PlayerCompare pair={cmpPair} onClose={closeCompare} onChange={startCompare} />
          <CompareBar a={cmpA} rivals={rivals} onPick={pick} onCancel={cancelCompare} />
        </div>
      </section>

      <SuspensionList players={players} onOpen={pick} />

      {!!injList.length && <InjuryList list={injList} players={players} onOpen={pick} />}

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
