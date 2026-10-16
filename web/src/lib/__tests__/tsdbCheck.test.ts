import { describe, expect, it } from 'vitest';
import { maskKey, verdictOfRoster, verdictOfStatus } from '../tsdbCheck';

describe('TheSportsDB 키 점검', () => {
  it('공개 테스트 키만 그대로 보이고 나머지는 가린다', () => {
    expect(maskKey('123')).toBe('123');
    expect(maskKey('3')).toBe('3');
    expect(maskKey('abcd1234')).toBe('ab…34');
  });

  it('HTTP 상태를 판정으로 바꾼다', () => {
    expect(verdictOfStatus(429).verdict).toBe('limited');
    expect(verdictOfStatus(401).verdict).toBe('denied');
    expect(verdictOfStatus(404).verdict).toBe('denied');
    expect(verdictOfStatus(500).verdict).toBe('error');
  });

  it('로스터가 짧으면(무료 키) "일부만", 길면 성공 — 컷아웃 수를 센다', () => {
    const p = (cut: boolean) => ({ strCutout: cut ? 'https://r2.thesportsdb.com/x.png' : null });
    const few = verdictOfRoster({ player: [p(true), p(true), p(false)] });
    expect(few.verdict).toBe('limited');
    expect(few.detail).toContain('선수 3명 · 컷아웃 2장');
    const full = verdictOfRoster({ player: Array.from({ length: 25 }, (_, i) => p(i < 20)) });
    expect(full).toEqual({ verdict: 'ok', detail: '선수 25명 · 컷아웃 20장' });
    expect(verdictOfRoster({ player: null }).verdict).toBe('error');
  });
});
