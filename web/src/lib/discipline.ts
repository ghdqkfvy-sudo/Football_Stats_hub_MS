import type { Match } from './types';
import { kstParts } from './kst';
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
  /** 징계로 못 뛰는 경기 전부(가까운 순) — FotMob 이 여러 경기에 올려 두었을 때 */
  missed?: Match[];
  /** 다시 뛸 수 있는 첫 경기(같은 대회) — 확인 범위 안에서 정해졌을 때만 */
  back?: Match;
}

export interface CardRisk { competition: string; yellows: number; limit: number }

export interface Discipline {
  /** 가장 가까운 출전 정지 (all[0]) */
  sus?: Suspension;
  /** 대회별 출전 정지 전부 — 리그 퇴장 + 챔스 경고 누적처럼 동시에 걸릴 수 있다(가까운 순) */
  all: Suspension[];
  risks: CardRisk[];
  /** 팀의 바로 다음 경기 기준 배지 — 레드(그 경기 출전 정지) · 옐로(그 대회 경고 1장 남음) */
  badge?: 'red' | 'yellow';
}

/** FotMob 징계(수집기) — 경기 시각으로 우리 일정과 맞춘다 */
export interface FotmobSus {
  ret?: string | null; utc?: string | null; league?: string | null; source?: string;
  games?: { utc: string | null; league?: string | null }[];
  checkedUntil?: string | null;
}

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

  /* 대회별로 하나씩 — 같은 대회는 FotMob 확정을 우선하고 계산 사유를 보탠다 */
  const byComp = new Map<string, Suspension>();

  /* 1) FotMob 확정 — 그 경기들이 우리 일정의 어느 경기인지 시각으로 찾는다(±12시간) */
  const near = (iso: string | null | undefined) => {
    if (!iso) return undefined;
    const at = Date.parse(iso);
    return upcoming.find((x) => Math.abs(Date.parse(x.kickoffUtc) - at) < 12 * 3600_000);
  };
  const fmGames = (fotmob?.games?.length ? fotmob.games.map((g) => g.utc) : [fotmob?.utc])
    .map(near).filter((m): m is Match => !!m)
    .sort(byKick);
  if (fmGames.length) {
    const first = fmGames[0];
    const missed = fmGames.filter((m) => m.competition === first.competition);
    const last = missed[missed.length - 1];
    /* 복귀 경기 — 마지막 정지 경기 뒤 같은 대회 첫 경기. 그 경기가 FotMob 확인 범위 안일 때만 "정해졌다" */
    const after = upcoming.find((m) => m.competition === first.competition && m.kickoffUtc > last.kickoffUtc);
    const limit = fotmob?.checkedUntil ? Date.parse(fotmob.checkedUntil) + 12 * 3600_000 : -Infinity;
    const back = after && Date.parse(after.kickoffUtc) <= limit ? after : undefined;
    byComp.set(first.competition, { competition: first.competition, reason: 'fotmob', confirmed: true, match: first, missed, back, ret: fotmob?.ret ?? null });
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
        /* 같은 대회에 FotMob 확정이 있으면 사유만 보탠다(같은 경기일 때), 없으면 계산값 */
        const fm = byComp.get(comp);
        if (!fm) byComp.set(comp, calc);
        else if (fm.match?.id === calc.match?.id) byComp.set(comp, { ...fm, reason: calc.reason, yellows: calc.yellows });
      }
    }

    /* 경고 1장 남음 — 그 대회 다음 경기가 있을 때만 */
    if (rule && next) {
      const limit = rule.thresholds(teamGames).find((t) => t > total);
      if (limit !== undefined && limit - total === 1) risks.push({ competition: comp, yellows: total, limit });
    }
  }

  const all = [...byComp.values()]
    .map((x) => (x.match && teamId ? { ...x, opp: (x.match.home.id === teamId ? x.match.away : x.match.home).name } : x))
    .sort((a, b) => (a.match && b.match ? byKick(a.match, b.match) : 0));
  const sus = all[0];

  /* 레드 배지 — 어느 대회 정지든 그 경기가 팀의 바로 다음 경기일 때만 */
  const badge: Discipline['badge'] =
    nextAll && all.some((x) => x.match?.id === nextAll.id) ? 'red'
      : nextAll && risks.some((r) => r.competition === nextAll.competition) ? 'yellow'
        : undefined;
  return { sus, all, risks, badge };
}

const REASON: Record<Suspension['reason'], string> = { red: '퇴장', yellow: '경고 누적', fotmob: '징계' };
const shortDay = (iso: string) => { const p = kstParts(iso); return `${p.month}.${p.date}`; };

/** 징계 사유 한 줄 — "퇴장 · 확정 · 11.8 복귀" (폰에서 줄이 갈리지 않게 짧게) */
export const susNote = (s: Suspension) =>
  [
    `${REASON[s.reason]}${s.yellows ? ` ${s.yellows}장` : ''}`,
    s.confirmed ? '확정' : '예상',
    s.back ? `${shortDay(s.back.kickoffUtc)} 복귀` : s.confirmed && (s.missed?.length ?? 0) > 1 ? '이후 미정' : '',
  ].filter(Boolean).join(' · ');
