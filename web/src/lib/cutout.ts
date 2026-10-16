/**
 * SofaScore 선수 사진의 **흰 배경 지우기** — 브라우저에서 한다.
 *
 * SofaScore 사진은 흰 바탕 PNG 라, 어두운 화면의 원형 칩·카드에서 흰 원판이
 * 튀어 보였다(2026-10-16). CSS 로는 못 지운다 — mix-blend-mode: multiply 는 흰색을
 * 없애지만 어두운 배경 위에서 얼굴까지 같이 어두워진다.
 *
 * 방법: 가장자리에서 시작해 **거의 순백인 픽셀만** 이어 칠하듯(flood fill) 지우고,
 * 그 경계 띠는 반투명으로 부드럽게 한다. 순백 근처만 지우므로 그늘진 피부·유니폼은
 * 거기서 멈춘다. 아래쪽 가장자리에서는 시작하지 않는다 — 흰 유니폼(레알)이 화면
 * 아래 끝에 닿아 있어 거기서 시작하면 유니폼이 통째로 지워진다.
 *
 * 이미지 서버가 다른 사이트의 픽셀 읽기(CORS)를 허락하지 않으면 캔버스를 못 읽는다 —
 * 그때는 원본을 그대로 쓴다(Headshot 이 알아서 원본으로 남는다).
 */

/** 이 픽셀이 지울 배경색인가 — 밝고(모든 채널 ≥ min) 채도가 거의 없다 */
const isBg = (d: Uint8ClampedArray, i: number, min: number): boolean => {
  const r = d[i], g = d[i + 1], b = d[i + 2];
  return d[i + 3] > 0 && r >= min && g >= min && b >= min && Math.max(r, g, b) - Math.min(r, g, b) <= 18;
};

/**
 * RGBA 픽셀 배열에서 가장자리와 이어진 흰 배경을 투명하게 만든다 (제자리 수정).
 * @returns 지운 픽셀 비율(0~1) — 너무 적으면(배경이 흰색이 아님) 호출부가 원본을 쓴다
 */
export function clearLightBackground(
  data: Uint8ClampedArray, w: number, h: number, { min = 238, seedBottom = 0.6 } = {},
): number {
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  const seed = (x: number, y: number) => {
    const p = y * w + x;
    if (!seen[p] && isBg(data, p * 4, min)) { seen[p] = 1; stack.push(p); }
  };
  /* 위쪽 전체 + 양옆의 위 60% 에서만 시작한다(아래는 유니폼) */
  for (let x = 0; x < w; x++) seed(x, 0);
  const sideTo = Math.floor(h * seedBottom);
  for (let y = 0; y < sideTo; y++) { seed(0, y); seed(w - 1, y); }

  let cleared = 0;
  while (stack.length) {
    const p = stack.pop()!;
    data[p * 4 + 3] = 0;
    cleared++;
    const x = p % w, y = (p - x) / w;
    if (x > 0) seed(x - 1, y);
    if (x < w - 1) seed(x + 1, y);
    if (y > 0) seed(x, y - 1);
    if (y < h - 1) seed(x, y + 1);
  }

  /* 경계 띠 — 지운 칸 바로 옆의 밝은 픽셀은 밝을수록 더 투명하게(가장자리 흰 테두리 없애기) */
  for (let p = 0; p < w * h; p++) {
    if (seen[p]) continue;
    const x = p % w, y = (p - x) / w;
    const near = (x > 0 && seen[p - 1]) || (x < w - 1 && seen[p + 1]) || (y > 0 && seen[p - w]) || (y < h - 1 && seen[p + w]);
    if (!near) continue;
    const i = p * 4;
    const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
    if (lum > 200) data[i + 3] = Math.round(data[i + 3] * Math.min(1, (255 - lum) / 55));
  }
  return cleared / (w * h);
}

const cache = new Map<string, Promise<string | null>>();

/**
 * 이미지 주소 → 배경을 지운 이미지(data URL). 못 하면 null(원본을 쓴다).
 * 같은 주소는 한 번만 처리한다(선수 목록·포메이션·카드가 같은 사진을 쓴다).
 */
export function cutoutOf(url: string): Promise<string | null> {
  const hit = cache.get(url);
  if (hit) return hit;
  const p = new Promise<string | null>((resolve) => {
    if (typeof document === 'undefined') { resolve(null); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => {
      try {
        const w = img.naturalWidth, h = img.naturalHeight;
        if (!w || !h) { resolve(null); return; }
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0);
        const id = ctx.getImageData(0, 0, w, h);          // CORS 가 막히면 여기서 던진다
        const ratio = clearLightBackground(id.data, w, h);
        /* 배경이 거의 안 지워졌으면(이미 투명하거나 흰 배경이 아님) 원본 그대로 */
        if (ratio < 0.04) { resolve(null); return; }
        ctx.putImageData(id, 0, 0);
        resolve(c.toDataURL('image/png'));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
  cache.set(url, p);
  return p;
}
