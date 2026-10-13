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
