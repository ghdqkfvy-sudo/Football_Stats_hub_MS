import { describe, expect, it } from 'vitest';
import { chroma, lightness, markColor, tooCloseToWhite } from '../mark';

/* 실제 targets.ts 의 값들 */
const RMA = { accent: '#FFCF3D', secondary: '#8B7BFF' };
const CHE = { accent: '#5B9BFF', secondary: '#F5C451' };
const MUN = { accent: '#FF6B72', secondary: '#FBE122' };
const TOT = { accent: '#8AB0FF', secondary: '#E3E9FF' };
const NEW = { accent: '#E6EAF2', secondary: '#41B6E6' };
const LIV = { accent: '#FF5B6E', secondary: '#00B2A9' };
const KOR = { accent: '#FF5C71', secondary: '#4C8DFF' };

describe('tooCloseToWhite', () => {
  it('뉴캐슬의 흰색만 걸린다', () => {
    expect(tooCloseToWhite(NEW.accent)).toBe(true);
    for (const t of [RMA, CHE, MUN, TOT, LIV, KOR]) {
      expect(tooCloseToWhite(t.accent)).toBe(false);
    }
  });

  it('밝아도 색이 뚜렷하면 문제가 아니다 — 레알의 노랑', () => {
    expect(lightness(RMA.accent)).toBeGreaterThan(0.75);   // 밝다
    expect(chroma(RMA.accent)).toBeGreaterThan(0.5);       // 그런데 노랗다
    expect(tooCloseToWhite(RMA.accent)).toBe(false);
  });

  it('순백과 밝은 회색은 걸린다', () => {
    expect(tooCloseToWhite('#FFFFFF')).toBe(true);
    expect(tooCloseToWhite('#EEEEEE')).toBe(true);
  });

  it('어두운 색은 걸리지 않는다 (여기서 막을 문제가 아니다)', () => {
    expect(tooCloseToWhite('#241F20')).toBe(false);   // 뉴캐슬 brand — 검정
    expect(tooCloseToWhite('#132257')).toBe(false);   // 토트넘 brand — 남색
  });

  it('잘못된 값에도 죽지 않는다', () => {
    expect(tooCloseToWhite('')).toBe(false);
    expect(tooCloseToWhite('빨강')).toBe(false);
    expect(lightness('')).toBe(0);
  });
});

describe('markColor', () => {
  it('뉴캐슬만 보조색(엠블럼 하늘색)으로 물러난다', () => {
    expect(markColor(NEW.accent, NEW.secondary)).toBe('#41B6E6');
  });

  it('나머지 여섯 팀은 팀 컬러 그대로다', () => {
    for (const t of [RMA, CHE, MUN, TOT, LIV, KOR]) {
      expect(markColor(t.accent, t.secondary)).toBe(t.accent);
    }
  });

  it('보조색까지 흰색에 가까우면 바꿔 봐야 소용없으므로 그대로 둔다', () => {
    /* 토트넘 보조색(#E3E9FF)이 그런 경우다 — 만약 accent 가 흰색이었다면 */
    expect(markColor('#F2F4F8', TOT.secondary)).toBe('#F2F4F8');
  });

  it('보조색이 없으면 그대로 둔다', () => {
    expect(markColor(NEW.accent)).toBe(NEW.accent);
  });
});
