import type { Injury } from '../types/feedTypes';
import type { Discipline } from './discipline';

/** 마우스를 올렸을 때 보이는 한 줄 — "부상 · 11월 중순 복귀 예상" */
export const injuryTitle = (inj: Injury) =>
  inj.doubtful ? '출전 불투명' : `${inj.long ? '장기 부상' : '부상'} · ${inj.ko}`;

/** 등번호 배지 자리의 마우스 올림 문구 */
export function badgeTitle(p: { inj?: Injury; disc?: Discipline }, kind: string): string | undefined {
  if (kind === 'red') return '다음 경기 출전 정지';
  if (kind === 'yellow') return '경고 누적 주의 — 1장 더 받으면 출전 정지';
  return p.inj ? injuryTitle(p.inj) : undefined;
}
