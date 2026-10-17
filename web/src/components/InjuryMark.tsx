import type { Injury } from '../types/feedTypes';

/** 빨간 십자가 — 흰 바탕 배지 안에 그린다(부상 표시) */
export function InjuryCross({ size = 9 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden="true">
      <path d="M3.6 0h2.8v3.6H10v2.8H6.4V10H3.6V6.4H0V3.6h3.6z" fill="#E5262E" />
    </svg>
  );
}

/**
 * 상세·호버 카드의 부상 줄 — [＋] 부상 · 11월 중순 복귀 예상.
 * 출전 불투명(doubtful)은 주황 톤으로 구분한다.
 */
export function InjuryLine({ inj }: { inj?: Injury }) {
  if (!inj) return null;
  return (
    <div className="pinj" data-doubt={inj.doubtful || undefined} role="note">
      <i className="injb" aria-hidden="true"><InjuryCross size={10} /></i>
      <b>{inj.doubtful ? '부상 의심' : '부상'}</b>
      <span>{inj.ko}</span>
    </div>
  );
}
