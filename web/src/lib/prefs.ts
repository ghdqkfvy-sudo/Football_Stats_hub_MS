/**
 * 이 기기의 설정 — Summary 에 보일 팀과 시작 화면.
 *
 * 팀이 일곱(코리안리거 소속팀까지 열)으로 늘면서 Summary 가 4,000px 를 넘었다. 덜 보는 팀을
 * 끄면 다음 경기 카드 · 주간 일정 · 팀 비교 · 경기 결과에서 빠진다(위쪽 팀 전환 줄에는 그대로 남는다 —
 * 가끔 들어가 볼 수는 있어야 한다).
 * 서버가 없으므로 이 기기 브라우저에만 저장한다. 저장이 막혀 있으면 기본값(전부 · 마지막 화면)으로 동작한다.
 */
import { useSyncExternalStore } from 'react';

export interface Prefs {
  /** Summary 에 보일 팀 id — null 이면 전부 */
  teams: string[] | null;
  /** 앱을 열 때 — 'last' 마지막으로 본 화면 · 'summary' · 팀 id */
  start: string;
}

const KEY = 'msh:prefs';
const DEFAULT: Prefs = { teams: null, start: 'last' };

/** 저장된 글자 → 설정. 모양이 어긋나면 기본값(낡은 저장값 때문에 앱이 깨지지 않게) */
export function parsePrefs(raw: string | null | undefined): Prefs {
  if (!raw) return DEFAULT;
  try {
    const v = JSON.parse(raw);
    const teams = Array.isArray(v?.teams) && v.teams.every((x: unknown) => typeof x === 'string') ? v.teams as string[] : null;
    return { teams, start: typeof v?.start === 'string' && v.start ? v.start : 'last' };
  } catch { return DEFAULT; }
}

/**
 * 보일 팀 — 저장된 목록에서 지금 있는 팀만, 원래 순서대로.
 * 하나도 안 남으면(전부 끔 · 팀이 없어짐) 전부 보인다: 빈 Summary 는 고장처럼 보인다.
 */
export function visibleTeams<T extends { id: string }>(all: T[], prefs: Prefs): T[] {
  if (!prefs.teams) return all;
  const on = new Set(prefs.teams);
  const kept = all.filter((t) => on.has(t.id));
  return kept.length ? kept : all;
}

/** 시작 화면의 주소 — 'last' 면 null(마지막 화면 규칙에 맡긴다). 없어진 팀이면 Summary */
export function startRoute(prefs: Prefs, teamIds: string[]): string | null {
  if (prefs.start === 'last') return null;
  if (prefs.start === 'summary') return '#/';
  return teamIds.includes(prefs.start) ? `#/${prefs.start}` : '#/';
}

let cache: Prefs | null = null;
const subs = new Set<() => void>();

export function getPrefs(): Prefs {
  if (cache) return cache;
  let raw: string | null = null;
  try { raw = localStorage.getItem(KEY); } catch { /* 저장소가 막혀 있다 — 기본값 */ }
  cache = parsePrefs(raw);
  return cache;
}

export function setPrefs(next: Prefs): void {
  cache = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* 이번 화면에서만 쓴다 */ }
  for (const f of subs) f();
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (cb) => { subs.add(cb); return () => { subs.delete(cb); }; },
    getPrefs,
    () => DEFAULT,
  );
}
