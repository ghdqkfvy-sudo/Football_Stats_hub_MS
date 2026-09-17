/**
 * 한 경기의 도움을 정리한다 — 어느 골에 붙일지, 그리고 못 붙인 도움은 누구인지.
 *
 * ⚠️ 이 파일은 **대비책**이다. 진짜 답은 core `/plays` 의 득점 play 가 주는
 * participants(type:"assister") 이고, 스냅샷이 그걸 골에 직접 붙인다
 * (scripts/snapshot.mjs 의 corePlayAssists). 여기 로직은 그 값을 아직
 * 못 받은 경기에만 쓴다.
 *
 * 우리가 아는 것은 두 가지뿐이다.
 *  1) 골이 몇 분에 났는지 (스코어보드 details)
 *  2) 선수별 **도움 개수** 와 그라운드에 있던 구간
 *     (경기 요약 rosters + core 경기 로스터의 subbedIn/subbedOut clock)
 *
 * 그래서 "누가 몇 개를 도왔다" 는 확실하지만 "그게 어느 골인지" 는 대개 모른다.
 *
 * ── 예전 방식이 틀렸던 두 가지 ─────────────────────────────
 *
 * (1) **모든 골에 도움이 있다고 가정했다.**
 *     단독 드리블, 리바운드, 먼 거리 슛, 코너 혼전 골에는 도움이 없다.
 *     그런데 "이 골에 가능한 도움 후보가 하나뿐" 이면 무조건 붙여 버려서,
 *     도움이 없었던 골에도 남의 이름이 찍혔다.
 *     → 이제 **그 팀의 도움 수와 도움이 붙을 수 있는 골 수가 같을 때만**
 *       배정한다. 도움이 골보다 적다면 "어느 골이 도움 없이 들어갔는지" 를
 *       알 방법이 없으므로 아무 골에도 붙이지 않고 아래 "도움" 줄에 모아 적는다.
 *
 * (2) **이미 API 가 붙여 둔 도움의 몫을 빼지 않았다.**
 *     벨링엄 골에 "비니시우스" 가 이미 붙어 있는데도 비니시우스의 도움 1개가
 *     후보로 그대로 남아 다른 골에 또 배정됐고, 아래 "도움" 줄에도 다시
 *     나왔다. 같은 도움이 두 번 보이던 원인이다.
 *     → 이제 배정·잔여 계산을 **한 곳에서** 처리한다(resolveAssists).
 *       한 번 쓴 도움은 그 자리에서 장부에서 지워지므로 구조적으로 중복이 없다.
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

/** 도움 한 건을 가리키는 값 */
export interface AssistRef {
  name: string;
  id?: string;
}

export interface ResolvedAssists {
  /** 골 순번 → 추론으로 붙인 도움 (API 가 이미 준 골은 들어 있지 않다) */
  inferred: Map<number, AssistRef>;
  /** 어느 골에도 붙이지 못한 도움 — 화면 아래에 따로 적는다 */
  leftover: MatchPlayerStat[];
}

const FULL = 130; // 연장까지 넉넉히

/** 표기 차이를 지운 이름 — 발음 부호·대소문자·구두점·공백 */
const norm = (s: string | undefined) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * 도움 한 건(ref)이 어느 선수(stat)의 것인지 찾는다.
 *
 * id 가 양쪽에 있으면 그것으로 끝이다. 없으면 이름으로 찾는데, 두 응답의
 * 표기가 다를 수 있어(‘Josan’ vs ‘Josan Ferrández’) 단계적으로 느슨하게
 * 본다. 단 **후보가 둘 이상이면 포기한다** — 엉뚱한 사람의 몫을 깎느니
 * 못 찾은 채로 두는 편이 낫다.
 */
function findStat(ref: AssistRef, pool: MatchPlayerStat[]): MatchPlayerStat | undefined {
  if (ref.id) {
    const byId = pool.find((s) => s.id && s.id === ref.id);
    if (byId) return byId;
  }
  const want = norm(ref.name);
  if (!want) return undefined;

  const only = (list: MatchPlayerStat[]) => (list.length === 1 ? list[0] : undefined);

  return (
    only(pool.filter((s) => norm(s.name) === want)) ??
    only(pool.filter((s) => {
      const n = norm(s.name);
      return n.includes(want) || want.includes(n);
    })) ??
    only(pool.filter((s) => {
      const last = (n: string) => n.split(' ').slice(-1)[0];
      return last(norm(s.name)) === last(want);
    }))
  );
}

/** 이 골에 도움이 붙을 수 있는가 — 자책골·PK 에는 도움이 없다 */
const canHaveAssist = (g: GoalEvent) => !g.ownGoal && !g.penalty;

/**
 * 골과 도움을 맞춘다.
 *
 * @param goals  경기의 모든 골 (API 가 준 `assist` 가 있으면 그대로 존중한다)
 * @param stats  선수별 골·도움 합계 (+ 가능하면 출전 구간)
 */
export function resolveAssists(
  goals: GoalEvent[],
  stats: MatchPlayerStat[] | undefined,
): ResolvedAssists {
  const inferred = new Map<number, AssistRef>();
  if (!stats?.length) return { inferred, leftover: [] };

  /* 장부: 선수마다 "아직 안 쓴 도움" 이 몇 개인가.
     여기서 깎은 건 어디에도 다시 나타나지 않는다. */
  const ledger = stats.map((s) => ({ s, left: Math.max(0, s.a || 0) }));
  const spend = (ref: AssistRef) => {
    const pool = ledger.filter((x) => x.left > 0).map((x) => x.s);
    const hit = findStat(ref, pool);
    if (!hit) return false;
    const row = ledger.find((x) => x.s === hit);
    if (!row) return false;
    row.left -= 1;
    return true;
  };

  /* 1) API 가 이미 붙여 둔 도움을 먼저 장부에서 뺀다.
        (이걸 안 해서 같은 도움이 두 번 보였다) */
  for (const g of goals) {
    if (!g.assist) continue;
    spend({ name: g.assist, id: (g as GoalEvent & { assistId?: string }).assistId });
  }

  /* 2) 팀별로 나눠서, 남은 도움을 남은 골에 맞춰 본다 */
  const teams = new Set<string>();
  for (const g of goals) if (g.teamId) teams.add(g.teamId);

  for (const teamId of teams) {
    // 아직 도움이 안 붙었고 도움이 붙을 수 있는 골
    const open: number[] = [];
    goals.forEach((g, i) => {
      if (g.teamId === teamId && !g.assist && canHaveAssist(g)) open.push(i);
    });
    if (!open.length) continue;

    // 이 팀의 남은 도움을 한 건씩 펼친다 (2도움이면 두 건)
    const slots: { ref: AssistRef; from: number; to: number; row: (typeof ledger)[number] }[] = [];
    for (const row of ledger) {
      if (row.s.teamId !== teamId) continue;
      for (let k = 0; k < row.left; k++) {
        slots.push({
          ref: { name: row.s.name, id: row.s.id },
          from: row.s.in ?? 0,
          to: row.s.out ?? FULL,
          row,
        });
      }
    }
    if (!slots.length) continue;

    /*
     * ⚠️ 여기가 핵심이다.
     * 도움 수 < 골 수 이면 **어떤 골은 도움 없이 들어간 것**이고, 그게 어느
     * 골인지는 알 길이 없다. 이때 억지로 붙이면 없던 도움을 지어내는 셈이라,
     * 한 건도 붙이지 않고 전부 아래 "도움" 줄로 보낸다.
     * 수가 정확히 같을 때만 "모든 골에 도움이 하나씩" 이 성립하므로,
     * 그때 시간 제약으로 좁혀 본다.
     */
    if (slots.length !== open.length) continue;

    const fits = (gi: number, si: number) => {
      const g = goals[gi];
      const s = slots[si];
      if (g.scorer && norm(g.scorer) === norm(s.ref.name)) return false; // 자기 골을 자기가 돕지 않는다
      return g.minute >= s.from && g.minute <= s.to;
    };

    const usedSlot = new Set<number>();
    const doneGoal = new Set<number>();

    // 후보가 하나뿐인 쪽부터 확정하고, 확정될 때마다 다시 훑는다
    for (let pass = 0; pass < slots.length + open.length; pass++) {
      let progressed = false;

      // (a) 가능한 도움이 정확히 하나인 골
      for (const gi of open) {
        if (doneGoal.has(gi)) continue;
        const cand: number[] = [];
        for (let si = 0; si < slots.length; si++) {
          if (!usedSlot.has(si) && fits(gi, si)) cand.push(si);
        }
        if (cand.length === 1) {
          inferred.set(gi, slots[cand[0]].ref);
          slots[cand[0]].row.left -= 1;
          usedSlot.add(cand[0]);
          doneGoal.add(gi);
          progressed = true;
        }
      }

      // (b) 가능한 골이 정확히 하나인 도움
      for (let si = 0; si < slots.length; si++) {
        if (usedSlot.has(si)) continue;
        const cand = open.filter((gi) => !doneGoal.has(gi) && fits(gi, si));
        if (cand.length === 1) {
          inferred.set(cand[0], slots[si].ref);
          slots[si].row.left -= 1;
          usedSlot.add(si);
          doneGoal.add(cand[0]);
          progressed = true;
        }
      }

      if (!progressed) break;
    }
  }

  /* 3) 장부에 남은 것이 "어느 골인지 모르는 도움" 이다 */
  const leftover = ledger
    .filter((x) => x.left > 0)
    .map((x) => ({ ...x.s, a: x.left }));

  return { inferred, leftover };
}
