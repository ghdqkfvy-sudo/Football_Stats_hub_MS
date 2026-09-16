/**
 * 한국 표준시(KST) 유틸.
 *
 * KST는 UTC+9 고정이며 서머타임이 없다. 따라서 타임존 DB 없이
 * 9시간 오프셋만으로 정확하게 계산할 수 있다.
 *
 * ⚠️ 핵심: 캘린더의 "날짜 칸" 배정은 반드시 KST 기준이어야 한다.
 * UTC 날짜로 버킷팅하면 한국 새벽 경기(예: 9/16 04:30 KST = 9/15 19:30 UTC)가
 * 전날 칸에 들어가 버린다. dayKey()가 이 문제를 막는다.
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** UTC 시각을 "KST 벽시계"를 가진 Date로 옮긴다. getUTC* 로만 읽을 것. */
function toKstClock(iso: string | Date): Date {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return new Date(d.getTime() + KST_OFFSET_MS);
}

/** KST 기준 날짜 키. 캘린더 그룹핑의 유일한 기준. */
export function dayKey(iso: string | Date): string {
  const k = toKstClock(iso);
  return `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, '0')}-${String(
    k.getUTCDate(),
  ).padStart(2, '0')}`;
}

/** KST 기준 연-월 키 ("2026-09") */
export function monthKey(iso: string | Date): string {
  return dayKey(iso).slice(0, 7);
}

export interface KstParts {
  year: number; month: number; date: number;
  hour: number; minute: number;
  weekday: number;      // 0=일
  weekdayKo: string;
}

export function kstParts(iso: string | Date): KstParts {
  const k = toKstClock(iso);
  return {
    year: k.getUTCFullYear(),
    month: k.getUTCMonth() + 1,
    date: k.getUTCDate(),
    hour: k.getUTCHours(),
    minute: k.getUTCMinutes(),
    weekday: k.getUTCDay(),
    weekdayKo: WEEKDAY_KO[k.getUTCDay()],
  };
}

/** "04:30" */
export function kstTime(iso: string | Date): string {
  const p = kstParts(iso);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

/** "2026년 9월 16일 (수)" */
export function kstFullDate(iso: string | Date): string {
  const p = kstParts(iso);
  return `${p.year}년 ${p.month}월 ${p.date}일 (${p.weekdayKo})`;
}

/** "9.16 (수)" */
export function kstShortDate(iso: string | Date): string {
  const p = kstParts(iso);
  return `${p.month}.${p.date} (${p.weekdayKo})`;
}

/** 새벽 경기 여부 — 00:00~05:59 KST. UI에서 "새벽" 배지를 띄우는 데 쓴다. */
export function isDawnMatch(iso: string | Date): boolean {
  return kstParts(iso).hour < 6;
}

/** 해당 KST 월의 달력 그리드(일요일 시작, 6주 고정)를 dayKey 배열로 만든다. */
export function monthGrid(year: number, month: number): { key: string; inMonth: boolean }[] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const startOffset = first.getUTCDay();               // 0=일
  const cells: { key: string; inMonth: boolean }[] = [];
  const cursor = new Date(first.getTime() - startOffset * 86400000);
  for (let i = 0; i < 42; i++) {
    const d = new Date(cursor.getTime() + i * 86400000);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
      d.getUTCDate(),
    ).padStart(2, '0')}`;
    cells.push({ key, inMonth: d.getUTCMonth() === month - 1 });
  }
  // 마지막 주 전체가 다음 달이면 잘라낸다(빈 줄이 남지 않도록).
  while (cells.length > 35 && cells.slice(-7).every((c) => !c.inMonth)) cells.length -= 7;
  return cells;
}

export interface Countdown {
  days: number; hours: number; minutes: number; seconds: number;
  totalMs: number; past: boolean;
}

export function countdown(targetIso: string, now: number = Date.now()): Countdown {
  const diff = new Date(targetIso).getTime() - now;
  const past = diff <= 0;
  const t = Math.max(0, diff);
  return {
    days: Math.floor(t / 86400000),
    hours: Math.floor((t % 86400000) / 3600000),
    minutes: Math.floor((t % 3600000) / 60000),
    seconds: Math.floor((t % 60000) / 1000),
    totalMs: diff,
    past,
  };
}

/** 오늘의 KST dayKey */
export function todayKey(now: number = Date.now()): string {
  return dayKey(new Date(now));
}


/* ── 시즌 ────────────────────────────────────────────────
   유럽 축구 시즌은 8월에 시작해 이듬해 5월에 끝난다.
   시즌 목록을 코드에 박아 두면 해가 바뀌는 순간 화면이 과거를 가리키므로,
   오늘(KST) 을 기준으로 계산한다. */

/** 그 날짜가 속한 시즌의 시작 연도 */
export function seasonStartYear(d: Date = new Date()): number {
  const k = new Date(d.getTime() + 9 * 3600_000);
  const y = k.getUTCFullYear();
  // 7월까지는 지난 시즌의 후반부로 본다 (ESPN season 파라미터와 같은 규칙)
  return k.getUTCMonth() + 1 >= 8 ? y : y - 1;
}

/** "2026-27" 표기 */
export function seasonLabel(startYear: number): string {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

/** 화면에 띄울 시즌 목록 — 이번 시즌과 다음 시즌 */
export function seasonOptions(d: Date = new Date()): { year: number; label: string }[] {
  const y = seasonStartYear(d);
  return [y, y + 1].map((year) => ({ year, label: seasonLabel(year) }));
}
