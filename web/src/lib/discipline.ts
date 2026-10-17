import type { Match } from './types';
import type { RecentGame } from './squad';

/**
 * 징계 — 출전 정지 · 경고 누적 위험. **대회마다 따로** 센다(2026-10-17 요청).
 *
 * 경고·퇴장 징계는 그 대회 안에서만 적용된다 — 리그 경고 4장은 챔스와 상관없고,
 * 챔스에서 퇴장당하면 다음 **챔스** 경기에 못 뛴다(주말 리그는 뛴다).
 *
 * 근거는 두 가지:
 *  1) FotMob 다음 경기 결장자의 type=suspension — 확정(수집기가 squad 파일에 sus 로 남긴다)
 *  2) 우리 경기별 카드 기록으로 계산 — 예상(퇴장 직후 · 누적 기준을 막 채운 직후)
 * 정지 경기 수(다이렉트 레드 3경기 등)는 징계위원회가 정해서 알 수 없다 — "다음 경기" 만 말한다.
 */

/** 대회별 경고 누적 기준 — 이 장수에 닿으면 다음 경기 1경기 정지 */
interface Rule { name: string; thresholds: (teamGames: number) => number[] }
export const CARD_RULES: Record<string, Rule> = {
  /* 프리미어리그: 19라운드 전 5장, 32라운드 전 10장, 시즌 15장 */
  'eng.1': {
    name: '프리미어리그',
    thresholds: (g) => (g < 19 ? [5, 10, 15] : g < 32 ? [10, 15] : [15]),
  },
  /* 라리가 · 분데스리가: 5장마다 */
  'esp.1': { name: '라리가', thresholds: () => [5, 10, 15, 20] },
  'ger.1': { name: '분데스리가', thresholds: () => [5, 10, 15, 20] },
  /* 챔스: 3장 → 이후 홀수(5 · 7 · 9). 8강이 끝나면 지워지지만 그 전까지는 이 규칙 */
  'uefa.champions': { name: '챔스', thresholds: () => [3, 5, 7, 9, 11] },
  /* MLS 등 규정을 확실히 모르는 대회는 넣지 않는다 — 틀린 경고를 띄우느니 안 띄운다 */
};

export interface Suspension {
  competition: string;
  /** red = 퇴장 · yellow = 경고 누적 · fotmob = FotMob 확정(사유 모름) */
  reason: 'red' | 'yellow' | 'fotmob';
  /** 확정(FotMob)인가, 우리 계산(예상)인가 */
  confirmed: boolean;
  /** 경고 누적이면 그 대회 경고 수 */
  yellows?: number;
  /** 못 뛰는 경기 */
  match?: Match;
  /** FotMob 복귀 예상 문구가 있으면 */
  ret?: string | null;
  /** 그 경기 상대 이름 */
  opp?: string;
}

export interface CardRisk { competition: string; yellows: number; limit: number }

export interface Discipline {
  sus?: Suspension;
  risks: CardRisk[];
  /** 팀의 바로 다음 경기 기준 배지 — 레드(그 경기 출전 정지) · 옐로(그 대회 경고 1장 남음) */
  badge?: 'red' | 'yellow';
}

/** FotMob 징계(수집기) — 경기 시각으로 우리 일정과 맞춘다 */
export interface FotmobSus { ret?: string | null; utc?: string | null; league?: string | null; source?: string }

const byKick = (a: { kickoffUtc: string }, b: { kickoffUtc: string }) => a.kickoffUtc.localeCompare(b.kickoffUtc);
const finished = (m: Match) => m.status === 'finished';

/** 그 대회 경고 수 — 퇴장당한 경기의 경고는 누적에 넣지 않는다(두 번째 경고 퇴장 포함) */
const yellowsIn = (games: RecentGame[]) => games.reduce((s, g) => s + (g.red > 0 ? 0 : g.yellow), 0);

export function discipline(
  recent: RecentGame[],
  teamMatches: Match[],
  fotmob: FotmobSus | undefined,
  now: number = Date.now(),
  teamId?: string,
): Discipline {
  const upcoming = teamMatches.filter((m) => !finished(m) && Date.parse(m.kickoffUtc) >= now - 3 * 3600_000).sort(byKick);
  const nextAll = upcoming[0];
  const nextIn = (comp: string) => upcoming.find((m) => m.competition === comp);

  let sus: Suspension | undefined;

  /* 1) FotMob 확정 — 그 경기가 우리 일정의 어느 경기인지 시각으로 찾는다(±12시간) */
  if (fotmob?.utc) {
    const at = Date.parse(fotmob.utc);
    const m = upcoming.find((x) => Math.abs(Date.parse(x.kickoffUtc) - at) < 12 * 3600_000);
    if (m) sus = { competition: m.competition, reason: 'fotmob', confirmed: true, match: m, ret: fotmob.ret ?? null };
  }

  /* 2) 우리 계산 — 대회마다, 그 선수의 마지막 경기 뒤로 팀이 그 대회를 아직 안 치렀을 때만 */
  const comps = new Set(recent.map((g) => g.competition));
  const risks: CardRisk[] = [];
  for (const comp of comps) {
    const games = recent.filter((g) => g.competition === comp).sort(byKick);
    const last = games[games.length - 1];
    const playedSince = teamMatches.some((m) => m.competition === comp && finished(m) && m.kickoffUtc > last.kickoffUtc);
    const next = nextIn(comp);
    const rule = CARD_RULES[comp];
    const teamGames = teamMatches.filter((m) => m.competition === comp && finished(m)).length;
    const total = yellowsIn(games);

    if (!playedSince && next) {
      let calc: Suspension | undefined;
      if (last.red > 0) calc = { competition: comp, reason: 'red', confirmed: false, match: next };
      else if (rule && last.yellow > 0) {
        const before = total - last.yellow;
        const hit = rule.thresholds(teamGames - 1).find((t) => before < t && total >= t);
        if (hit) calc = { competition: comp, reason: 'yellow', confirmed: false, yellows: total, match: next };
      }
      if (calc) {
        /* FotMob 확정이 같은 경기면 사유만 보태고, 없으면 계산값을 쓴다(가장 가까운 경기 우선) */
        if (sus && sus.match?.id === calc.match?.id) sus = { ...sus, reason: calc.reason, yellows: calc.yellows };
        else if (!sus || (calc.match && sus.match && byKick(calc.match, sus.match) < 0)) sus = calc;
      }
    }

    /* 경고 1장 남음 — 그 대회 다음 경기가 있을 때만 */
    if (rule && next) {
      const limit = rule.thresholds(teamGames).find((t) => t > total);
      if (limit !== undefined && limit - total === 1) risks.push({ competition: comp, yellows: total, limit });
    }
  }

  if (sus?.match && teamId) sus = { ...sus, opp: (sus.match.home.id === teamId ? sus.match.away : sus.match.home).name };

  const badge: Discipline['badge'] =
    sus?.match && nextAll && sus.match.id === nextAll.id ? 'red'
      : nextAll && risks.some((r) => r.competition === nextAll.competition) ? 'yellow'
        : undefined;
  return { sus, risks, badge };
}
