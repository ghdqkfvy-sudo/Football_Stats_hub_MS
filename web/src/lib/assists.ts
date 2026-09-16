/**
 * 도움을 골에 배정한다 — 시간으로 좁혀서.
 *
 * ESPN 은 "이 골의 도움은 누구" 를 어디서도 주지 않는다. 확인한 것:
 *  · 스코어보드 details  → 득점자만 (athletesInvolved 1명)
 *  · 요약 keyEvents      → 아예 없음
 *  · core /plays         → 도움 play 는 있지만 선수가 $ref 라 이름이 없고,
 *                          한 경기 1,404개라 페이지를 다 받아야 한다
 *
 * 대신 두 가지는 확실히 안다.
 *  1) 골이 몇 분에 났는지 (스코어보드 details)
 *  2) 각 선수가 몇 분부터 몇 분까지 그라운드에 있었는지
 *     (core 경기 로스터의 subbedIn/subbedOut clock)
 *
 * 그래서 "그 시간에 뛰지 않았으면 그 골을 도울 수 없다" 로 후보를 지우고,
 * **유일하게 남을 때만** 배정한다. 둘 이상 가능하면 배정하지 않는다 —
 * 찍어서 맞히는 것보다 비워 두는 편이 정직하다.
 */
import type { GoalEvent } from './types';

export interface MatchPlayerStat {
  id?: string;
  teamId: string;
  name: string;
  g: number;
  a: number;
  /** 투입 분 (선발이면 0, 모르면 null) */
  in?: number | null;
  /** 교체 아웃 분 (끝까지 뛰었으면 null) */
  out?: number | null;
}

interface Slot {
  name: string;
  teamId: string;
  from: number;
  to: number;
}

const FULL = 130; // 연장까지 넉넉히

/**
 * @returns goalIndex → 도움 선수 이름. 배정되지 않은 골은 키가 없다.
 */
export function assignAssists(
  goals: GoalEvent[],
  stats: MatchPlayerStat[] | undefined,
): Map<number, string> {
  const out = new Map<number, string>();
  if (!goals.length || !stats?.length) return out;

  // 도움 1건마다 슬롯 하나 — 2도움이면 슬롯 2개
  const slots: Slot[] = [];
  for (const s of stats) {
    for (let k = 0; k < (s.a || 0); k++) {
      slots.push({
        name: s.name,
        teamId: s.teamId,
        from: s.in ?? 0,
        to: s.out ?? FULL,
      });
    }
  }
  if (!slots.length) return out;

  /** 이 골을 이 슬롯이 도울 수 있는가 */
  const fits = (gi: number, si: number) => {
    const g = goals[gi];
    const s = slots[si];
    if (g.ownGoal) return false;                 // 자책골에는 도움이 없다
    if (g.penalty) return false;                 // PK 도 도움이 붙지 않는다
    if (g.teamId && s.teamId && g.teamId !== s.teamId) return false;
    if (g.scorer === s.name) return false;       // 자기 골을 자기가 돕지 않는다
    return g.minute >= s.from && g.minute <= s.to;
  };

  const usedSlot = new Set<number>();
  const doneGoal = new Set<number>();

  // 후보가 하나뿐인 쪽부터 확정하고, 확정될 때마다 다시 훑는다
  for (let pass = 0; pass < slots.length + goals.length; pass++) {
    let progressed = false;

    // (1) 가능한 슬롯이 정확히 하나인 골
    for (let gi = 0; gi < goals.length; gi++) {
      if (doneGoal.has(gi)) continue;
      const cand: number[] = [];
      for (let si = 0; si < slots.length; si++) {
        if (!usedSlot.has(si) && fits(gi, si)) cand.push(si);
      }
      if (cand.length === 1) {
        out.set(gi, slots[cand[0]].name);
        usedSlot.add(cand[0]);
        doneGoal.add(gi);
        progressed = true;
      }
    }

    // (2) 가능한 골이 정확히 하나인 슬롯
    for (let si = 0; si < slots.length; si++) {
      if (usedSlot.has(si)) continue;
      const cand: number[] = [];
      for (let gi = 0; gi < goals.length; gi++) {
        if (!doneGoal.has(gi) && fits(gi, si)) cand.push(gi);
      }
      if (cand.length === 1) {
        out.set(cand[0], slots[si].name);
        usedSlot.add(si);
        doneGoal.add(cand[0]);
        progressed = true;
      }
    }

    if (!progressed) break;
  }

  return out;
}

/** 배정되지 못하고 남은 도움 (화면 아래에 따로 적는다) */
export function leftoverAssists(
  stats: MatchPlayerStat[] | undefined,
  assigned: Map<number, string>,
): MatchPlayerStat[] {
  if (!stats?.length) return [];
  const used = new Map<string, number>();
  for (const name of assigned.values()) used.set(name, (used.get(name) ?? 0) + 1);

  const rest: MatchPlayerStat[] = [];
  for (const s of stats) {
    const remain = (s.a || 0) - (used.get(s.name) ?? 0);
    if (remain > 0) rest.push({ ...s, a: remain });
  }
  return rest;
}
