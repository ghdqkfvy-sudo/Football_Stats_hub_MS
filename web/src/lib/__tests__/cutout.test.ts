import { describe, expect, it } from 'vitest';
import { clearLightBackground } from '../cutout';

/** w×h 그림 — fill(x, y) 가 [r,g,b] 를 준다 */
function img(w: number, h: number, fill: (x: number, y: number) => [number, number, number]) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = fill(x, y); const i = (y * w + x) * 4;
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
  }
  return d;
}
const alpha = (d: Uint8ClampedArray, w: number, x: number, y: number) => d[(y * w + x) * 4 + 3];

describe('흰 배경 지우기 (SofaScore 사진)', () => {
  it('가장자리와 이어진 흰 배경은 지우고, 가운데 얼굴(어두운 색)은 남긴다', () => {
    const w = 20, h = 20;
    const d = img(w, h, (x, y) => ((x - 10) ** 2 + (y - 9) ** 2 < 25 ? [150, 110, 90] : [255, 255, 255]));
    const ratio = clearLightBackground(d, w, h);
    expect(alpha(d, w, 0, 0)).toBe(0);           // 모서리 배경
    expect(alpha(d, w, 10, 9)).toBe(255);        // 얼굴
    expect(ratio).toBeGreaterThan(0.5);
  });

  it('아래 끝에 닿은 흰 유니폼은 지우지 않는다(아래에서는 시작하지 않는다)', () => {
    const w = 20, h = 20;
    /* 위는 흰 배경, 가운데 어두운 띠(목·얼굴 경계), 아래 30% 는 흰 유니폼 */
    const d = img(w, h, (_x, y) => (y >= 8 && y < 14 ? [90, 70, 60] : [255, 255, 255]));
    clearLightBackground(d, w, h, { seedBottom: 0.6 });
    expect(alpha(d, w, 10, 2)).toBe(0);          // 배경
    expect(alpha(d, w, 10, 18)).toBe(255);       // 유니폼 — 그대로
  });

  it('그늘진 밝은 색(피부·회색 유니폼)은 순백이 아니라서 남는다', () => {
    const w = 10, h = 10;
    const d = img(w, h, (x) => (x < 5 ? [255, 255, 255] : [228, 220, 214]));
    clearLightBackground(d, w, h);
    expect(alpha(d, w, 1, 5)).toBe(0);
    expect(alpha(d, w, 8, 5)).toBe(255);
  });

  it('흰 배경이 없으면 지운 비율이 0 이다(호출부가 원본을 쓴다)', () => {
    const d = img(8, 8, () => [30, 40, 60]);
    expect(clearLightBackground(d, 8, 8)).toBe(0);
  });
});
