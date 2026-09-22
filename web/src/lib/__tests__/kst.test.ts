import { describe, expect, it } from 'vitest';
import {
  countdown, dayKey, isDawnMatch, kstFullDate, kstShortDate, kstTime,
  monthGrid, monthKey, seasonLabel, seasonOptions, seasonStartYear,
} from '../kst';

/**
 * ⚠️ 여기서 지키는 것: **날짜 칸 배정은 KST 기준**이라는 규칙.
 * UTC 로 버킷팅하면 한국 새벽 경기가 전날 칸에 들어간다 — 실제로 났던 버그다.
 */
describe('dayKey / monthKey', () => {
  it('한국 새벽 경기를 KST 당일 칸에 넣는다', () => {
    // 9/16 04:30 KST == 9/15 19:30 UTC — UTC 로 자르면 9/15 로 밀린다
    expect(dayKey('2026-09-15T19:30Z')).toBe('2026-09-16');
    expect(monthKey('2026-09-15T19:30Z')).toBe('2026-09-16'.slice(0, 7));
  });

  it('월말 자정을 넘기면 다음 달로 넘어간다', () => {
    // 8/31 16:00 UTC == 9/1 01:00 KST
    expect(dayKey('2026-08-31T16:00Z')).toBe('2026-09-01');
    expect(monthKey('2026-08-31T16:00Z')).toBe('2026-09');
  });

  it('KST 정오는 그대로 그 날짜다', () => {
    expect(dayKey('2026-09-16T03:00Z')).toBe('2026-09-16');
  });
});

describe('표시 포맷', () => {
  it('시각·날짜를 KST 로 적는다', () => {
    expect(kstTime('2026-09-15T19:30Z')).toBe('04:30');
    expect(kstShortDate('2026-09-15T19:30Z')).toBe('9.16 (수)');
    expect(kstFullDate('2026-09-15T19:30Z')).toBe('2026년 9월 16일 (수)');
  });

  it('새벽 배지는 00:00~05:59 KST 에만 붙는다', () => {
    expect(kstTime('2026-09-15T19:30Z')).toBe('04:30');
    expect(isDawnMatch('2026-09-15T19:30Z')).toBe(true);
    // 경계: 20:59Z == 05:59 KST 는 새벽, 21:00Z == 06:00 KST 는 아니다
    expect(kstTime('2026-09-15T20:59Z')).toBe('05:59');
    expect(isDawnMatch('2026-09-15T20:59Z')).toBe(true);
    expect(kstTime('2026-09-15T21:00Z')).toBe('06:00');
    expect(isDawnMatch('2026-09-15T21:00Z')).toBe(false);
  });
});

describe('monthGrid', () => {
  it('일요일에 시작하고, 마지막 주가 전부 다음 달이면 잘라낸다', () => {
    const cells = monthGrid(2026, 9);
    expect(cells.length % 7).toBe(0);
    expect(cells.length).toBeLessThanOrEqual(42);
    expect(cells.length).toBeGreaterThanOrEqual(35);
    // 그 달의 1일이 그리드 안에 있고 inMonth 다
    const first = cells.find((c) => c.key === '2026-09-01');
    expect(first?.inMonth).toBe(true);
    // 마지막 주가 통째로 다음 달인 경우는 남지 않는다
    expect(cells.slice(-7).some((c) => c.inMonth)).toBe(true);
  });

  it('그 달 날짜를 하나도 빠뜨리지 않는다', () => {
    const inMonth = monthGrid(2026, 2).filter((c) => c.inMonth);
    expect(inMonth.length).toBe(28);          // 2026년 2월
    expect(inMonth[0].key).toBe('2026-02-01');
    expect(inMonth.at(-1)!.key).toBe('2026-02-28');
  });
});

describe('시즌 판정', () => {
  it('8월부터 새 시즌, 7월까지는 지난 시즌의 후반부다', () => {
    expect(seasonStartYear(new Date('2026-08-01T00:00Z'))).toBe(2026);
    expect(seasonStartYear(new Date('2026-07-31T00:00Z'))).toBe(2025);
    // KST 로 판정한다 — 7/31 16:00 UTC 는 이미 8/1 KST
    expect(seasonStartYear(new Date('2026-07-31T16:00Z'))).toBe(2026);
  });

  it('라벨은 2026-27 꼴이고 세기를 넘겨도 두 자리다', () => {
    expect(seasonLabel(2026)).toBe('2026-27');
    expect(seasonLabel(2099)).toBe('2099-00');
  });

  it('시즌 목록을 코드에 박지 않는다 — 오늘로부터 만든다', () => {
    const opts = seasonOptions(new Date('2026-09-17T00:00Z'));
    expect(opts.map((o) => o.label)).toEqual(['2026-27', '2027-28']);
  });
});

describe('countdown', () => {
  it('남은 시간을 쪼개고, 지나간 경기는 past 다', () => {
    const now = Date.parse('2026-09-16T00:00:00Z');
    const c = countdown('2026-09-17T02:30:00Z', now);
    expect(c.past).toBe(false);
    expect(c.days).toBe(1);
    expect(c.hours).toBe(2);
    expect(c.minutes).toBe(30);
    expect(countdown('2026-09-15T00:00:00Z', now).past).toBe(true);
  });
});
