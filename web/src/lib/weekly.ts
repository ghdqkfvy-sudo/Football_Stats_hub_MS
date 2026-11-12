/**
 * 코리안리거 주간 리포트 — 한 주(화~월, KST) 동안 누가 얼마나 뛰었나.
 *
 * 카드 스물한 장을 하나씩 펼쳐야 알 수 있던 "이번 주말 누가 잘했나" 를 한 장으로 모은다.
 * 새로 받는 데이터는 없다 — 선수별 최근 경기(클럽)에서 그 주에 든 경기만 추린다.
 * 최근 경기는 선수당 세 경기뿐이라 두세 주 전까지만 거슬러 볼 수 있다.
 * 날짜가 비어 온 경기(일부 리그)는 어느 주인지 알 수 없어 넣지 않는다.
 */
import type { KoreanGame, KoreanPlayer } from '../types/feedTypes';
import { dayKey } from './kst';
import { weekStartKey } from './summary';

export interface WeeklyRow {
  player: KoreanPlayer;
  games: KoreanGame[];
  minutes: number;
  goals: number;
  assists: number;
  /** 그 주 경기 평점의 평균 — 평점 있는 경기가 없으면 null */
  rating: number | null;
}

export interface Weekly {
  /** 그 주 화요일(KST) "2026-11-03" */
  start: string;
  /** 그 주 월요일 */
  end: string;
  rows: WeeklyRow[];
  /** 그 주에 기록이 없는 선수 */
  idle: KoreanPlayer[];
  goals: number;
  assists: number;
  minutes: number;
  /** 평점이 가장 높은 선수(60분 이상 뛴 선수 우선) */
  best: WeeklyRow | null;
}

/*
 * 한 주는 **화요일~월요일(KST)** 이다. 유럽의 일요일 저녁 경기는 한국시간으로 월요일 새벽이라,
 * 월~일로 자르면 같은 주말 라운드가 두 주로 갈린다(토요일 경기는 이번 주, 일요일 경기는 다음 주).
 * 하루를 당겨 월요일 새벽 경기까지 그 주말에 묶는다. 주중 유럽대항전(화~목 밤)은 그대로 그 주다.
 */
const weekOf = (g: KoreanGame): string | null =>
  (g.date ? addDays(weekStartKey(addDays(dayKey(g.date), -1)), 1) : null);

/** 기록이 있는 주(화요일 키), 최신순 */
export function weeksWithGames(players: KoreanPlayer[]): string[] {
  const set = new Set<string>();
  for (const p of players) for (const g of p.recent) { const w = weekOf(g); if (w) set.add(w); }
  return [...set].sort().reverse();
}

export function buildWeekly(players: KoreanPlayer[], start: string): Weekly {
  const rows: WeeklyRow[] = [];
  const idle: KoreanPlayer[] = [];
  for (const player of players) {
    const games = player.recent.filter((g) => weekOf(g) === start)
      .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
    if (!games.length) { idle.push(player); continue; }
    const rated = games.map((g) => g.rating).filter((v): v is number => typeof v === 'number');
    rows.push({
      player, games,
      minutes: games.reduce((a, g) => a + (g.minutes ?? 0), 0),
      goals: games.reduce((a, g) => a + g.goals, 0),
      assists: games.reduce((a, g) => a + g.assists, 0),
      rating: rated.length ? Math.round((rated.reduce((a, v) => a + v, 0) / rated.length) * 10) / 10 : null,
    });
  }
  /* 공격 포인트 → 평점 → 출전 시간 순. 숫자로 남은 것이 먼저 보이게 */
  rows.sort((a, b) => (b.goals + b.assists) - (a.goals + a.assists)
    || (b.rating ?? 0) - (a.rating ?? 0) || b.minutes - a.minutes);
  const ratedRows = rows.filter((r) => r.rating != null);
  const pool = ratedRows.some((r) => r.minutes >= 60) ? ratedRows.filter((r) => r.minutes >= 60) : ratedRows;
  const best = pool.reduce<WeeklyRow | null>((m, r) => (!m || (r.rating ?? 0) > (m.rating ?? 0) ? r : m), null);
  return {
    start, end: addDays(start, 6), rows, idle,
    goals: rows.reduce((a, r) => a + r.goals, 0),
    assists: rows.reduce((a, r) => a + r.assists, 0),
    minutes: rows.reduce((a, r) => a + r.minutes, 0),
    best,
  };
}

/** 날짜 키에 며칠 더하기 */
function addDays(key: string, days: number): string {
  const t = Date.parse(`${key}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** "11.2 ~ 11.8" */
export function weekLabel(w: Pick<Weekly, 'start' | 'end'>): string {
  const md = (k: string) => `${Number(k.slice(5, 7))}.${Number(k.slice(8, 10))}`;
  return `${md(w.start)} ~ ${md(w.end)}`;
}
