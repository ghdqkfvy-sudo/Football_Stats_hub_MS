/**
 * "이 줄이 우리 팀" 이라고 말할 색.
 *
 * 팀 컬러(accent)를 그대로 쓰면 대부분 잘 되지만, **뉴캐슬만 안 된다.**
 * 흑백 줄무늬 팀이라 어두운 배경에서 쓸 수 있는 쪽이 흰색(#E6EAF2)뿐인데,
 * 그건 본문 글씨 색과 사실상 같다. 스무 줄짜리 순위표에서 우리 줄만
 * 흰 글씨로 칠해 봐야 나머지 열아홉 줄과 구분되지 않는다.
 *
 * 그래서 팀 컬러가 **흰색에 가까우면** 그 팀의 보조색으로 바꾼다.
 * 뉴캐슬의 보조색은 엠블럼의 하늘색(#41B6E6)이라 팀 정체성도 지킨다.
 * 특정 팀을 이름으로 박지 않는다 — 색만 보고 판단하므로 나중에 흰색
 * 계열 팀이 늘어도 그대로 동작한다.
 */

const hex = (c: string): [number, number, number] | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(c ?? '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** 0~1. 사람 눈이 느끼는 밝기(ITU-R BT.601) */
export function lightness(color: string): number {
  const rgb = hex(color);
  if (!rgb) return 0;
  const [r, g, b] = rgb;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** 0~1. 색이 얼마나 "색다운가" — 회색·흰색·검정은 0에 가깝다 */
export function chroma(color: string): number {
  const rgb = hex(color);
  if (!rgb) return 0;
  return (Math.max(...rgb) - Math.min(...rgb)) / 255;
}

/**
 * 어두운 배경 위에서 흰 글씨와 구분되지 않는 색인가.
 * 밝고(0.8 이상) 동시에 색기가 옅을 때(0.15 미만)만 참이다 —
 * 밝아도 노랑(레알 #FFCF3D)처럼 색이 뚜렷하면 아무 문제가 없다.
 */
export function tooCloseToWhite(color: string): boolean {
  return lightness(color) >= 0.8 && chroma(color) < 0.15;
}

/** 강조에 쓸 색 — 흰색에 가까우면 보조색으로 물러난다 */
export function markColor(accent: string, secondary?: string): string {
  if (secondary && tooCloseToWhite(accent) && !tooCloseToWhite(secondary)) return secondary;
  return accent;
}
