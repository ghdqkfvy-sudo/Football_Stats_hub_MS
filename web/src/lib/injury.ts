import type { Injury } from '../types/feedTypes';

/** 마우스를 올렸을 때 보이는 한 줄 — "부상 · 11월 중순 복귀 예상" */
export const injuryTitle = (inj: Injury) =>
  inj.doubtful ? '출전 불투명' : `${inj.long ? '장기 부상' : '부상'} · ${inj.ko}`;
