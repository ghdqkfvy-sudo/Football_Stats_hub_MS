/**
 * 직전 경기(최신순 recent[0])에서 골·도움을 올렸으면 "직전 경기 1골 1도움".
 * 코리안리거·Future 카드가 같이 쓴다 — 지금 폼이 좋은 선수가 바로 눈에 띄게.
 * 경기 날짜가 피드에 없어 "이번 주" 라고는 쓰지 않는다.
 */
export function lastMatchTag(recent: { goals: number; assists: number }[]): string | null {
  const g = recent[0];
  if (!g || g.goals + g.assists === 0) return null;
  return ['직전 경기', g.goals > 0 && `${g.goals}골`, g.assists > 0 && `${g.assists}도움`]
    .filter(Boolean).join(' ');
}

/**
 * ESPN 최근 5경기(lastFiveGames)의 score 를 **우리 득점 먼저** 로 바꿔 읽는다.
 *
 * 그 score 는 홈-원정 순서가 아니라 **큰 점수가 앞** 이다(2026-10 데이터로 확인:
 * 홈 패배 "3-0 L", 원정 승리 "4-3 W"). 그대로 찍으면 진 경기가 "3 : 0" 으로
 * 이긴 것처럼 읽혔다 — 결과(W/D/L)를 보고 패배일 때만 뒤집는다.
 */
export function oursFirst(score: string, result?: string): [number | undefined, number | undefined] {
  const [a, b] = String(score ?? '').split('-').map((x) => {
    const n = Number.parseInt(x, 10);
    return Number.isNaN(n) ? undefined : n;
  });
  if (a === undefined || b === undefined) return [a, b];
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return result === 'L' ? [lo, hi] : [hi, lo];
}
