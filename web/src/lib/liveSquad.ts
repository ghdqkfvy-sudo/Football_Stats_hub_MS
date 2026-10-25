import { useEffect, useMemo, useState } from 'react';
import type { LivePlayer } from '../types/feedTypes';
import type { Match } from './types';
import type { SquadData } from './api';
import { loadSchedule, loadSquad } from './api';
import { SLUG_BY_TEAM_ID } from '../config/targets';
import { buildSquad } from './squad';
import type { PlayerSeason } from './squad';
import { discipline } from './discipline';

/**
 * 오늘의 경기 칩 → 선수 상세 카드 (2026-10-19).
 *
 * 라이브 파일은 FotMob 선수(id · 이름 · 등번호)라 우리(ESPN) 스쿼드와 이어 줘야 한다.
 * 등번호 + 성(姓) → 이름 낱말 묶음 → 성 하나 순으로 보고, **후보가 둘 이상이면 포기한다**
 * — 엉뚱한 사람의 카드를 여느니 안 여는 편이 낫다. 상대도 우리가 지켜보는 팀(스쿼드 파일이 있는 팀)이면
 * 그 팀 스쿼드로 상대 선수도 잇는다(useRivalSquad, 2026-10-25 첼시 vs 토트넘).
 */
const tokens = (s: string) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

const one = <T,>(xs: T[]) => (xs.length === 1 ? xs[0] : null);

export function matchLivePlayer(lp: LivePlayer, pool: PlayerSeason[]): PlayerSeason | null {
  const mine = tokens(lp.name);
  const last = tokens(lp.last).join(' ') || mine[mine.length - 1];
  const has = (p: PlayerSeason) => new Set(tokens(p.name));
  const lastIn = (p: PlayerSeason) => !!last && last.split(' ').every((t) => has(p).has(t));
  if (lp.no != null) {
    const hit = one(pool.filter((p) => p.jersey === lp.no && lastIn(p)));
    if (hit) return hit;
  }
  /* 'Lee Kang-In' ↔ 'Kang-In Lee' — 낱말 묶음이 같으면 같은 사람 */
  const key = [...mine].sort().join(' ');
  const same = one(pool.filter((p) => tokens(p.name).sort().join(' ') === key));
  if (same) return same;
  return one(pool.filter(lastIn));
}

/** 우리 팀 스쿼드의 시즌 선수 목록 — PlayersTab 과 같은 계산(징계까지). 스쿼드가 없으면 빈 목록 */
export function useSquadPlayers(teamId: string | undefined, matches: Match[] | undefined): PlayerSeason[] {
  const [squadOf, setSquadOf] = useState<{ team: string; data: SquadData | null } | null>(null);
  useEffect(() => {
    if (!teamId || !matches) return;
    let alive = true;
    loadSquad(teamId, matches).then((r) => { if (alive) setSquadOf({ team: teamId, data: r.data }); });
    return () => { alive = false; };
  }, [teamId, matches]);
  const squad = squadOf && squadOf.team === teamId ? squadOf.data : null;
  return useMemo(() => {
    if (!squad || !teamId || !matches) return [];
    const { players } = buildSquad(matches, squad.lineups ?? {}, squad.athletes ?? {}, teamId);
    return players.map((p) => ({ ...p, disc: discipline(p.recent, matches, squad.athletes?.[p.id]?.sus, undefined, teamId) }));
  }, [squad, teamId, matches]);
}

/**
 * 상대 팀 스쿼드 — 상대도 지켜보는 팀이면(일곱 팀 · 대표팀 · 코리안리거 소속팀) 그 팀 일정 → 스쿼드를 받아 온다.
 * 아니면 빈 목록(상대 칩은 그냥 칩으로 남는다).
 */
export function useRivalSquad(rivalId: string | undefined): PlayerSeason[] {
  const id = rivalId && SLUG_BY_TEAM_ID[rivalId] ? rivalId : undefined;
  const [sched, setSched] = useState<{ team: string; data: Match[] } | null>(null);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    loadSchedule(id).then((r) => { if (alive) setSched({ team: id, data: r.data }); });
    return () => { alive = false; };
  }, [id]);
  return useSquadPlayers(id, sched && sched.team === id && sched.data.length ? sched.data : undefined);
}
