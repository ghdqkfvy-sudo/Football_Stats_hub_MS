import type { Injury } from '../types/feedTypes';

/** 빨간 십자가 — 흰 바탕 배지 안에 그린다(부상) */
export function InjuryCross({ size = 9 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden="true">
      <path d="M3.6 0h2.8v3.6H10v2.8H6.4V10H3.6V6.4H0V3.6h3.6z" fill="#E5262E" />
    </svg>
  );
}

/**
 * 배지 안 그림 — 부상은 빨간 십자가, **출전 불투명은 주황 물음표**.
 * 같은 흰 바탕 배지라 "몸 상태 문제" 로 한눈에 묶이고, 모양으로 확정/불확실이 갈린다.
 * (색만 바꾸면 작은 배지에서 구분이 안 된다 — 모양을 바꾼다)
 */
export function InjuryGlyph({ inj, size = 9 }: { inj: Injury; size?: number }) {
  if (inj.doubtful) {
    return (
      <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden="true">
        <path
          d="M2.6 3.3C2.6 1.9 3.7 1 5.1 1c1.5 0 2.5.9 2.5 2.1 0 1-.6 1.5-1.3 2-.5.3-.7.6-.7 1.1v.3H4.2v-.4c0-.9.4-1.4 1-1.8.5-.3.8-.6.8-1.1 0-.5-.4-.9-1-.9-.6 0-1 .4-1 1H2.6zM4.1 7.6h1.6V9H4.1z"
          fill="#E08A00"
        />
      </svg>
    );
  }
  return <InjuryCross size={size} />;
}

/**
 * 상세·호버 카드의 부상 줄 — [＋] 부상 · 11월 중순 복귀 예상 [장기].
 * 출전 불투명은 주황 톤 + 물음표 배지.
 */
export function InjuryLine({ inj }: { inj?: Injury }) {
  if (!inj) return null;
  return (
    <div className="pinj" data-doubt={inj.doubtful || undefined} data-long={inj.long || undefined} role="note">
      <i className="injb" data-doubt={inj.doubtful || undefined} aria-hidden="true"><InjuryGlyph inj={inj} size={10} /></i>
      <b>{inj.doubtful ? '출전 불투명' : '부상'}</b>
      {inj.injName && <span className="pinj__what">{inj.injName}</span>}
      {!inj.doubtful && <span>{inj.ko}</span>}
      {inj.long && <em className="pinj__long">장기</em>}
    </div>
  );
}

/**
 * 카드 그 자체 — 배지 바탕 없이 실제 카드 비율(세로로 긴 직사각형)로 붙인다(2026-10-17 A안).
 * 포지션 색 바탕 안에 넣으면 등번호 배지처럼 보여 "징계" 느낌이 안 났다.
 * 흰 테두리 + 그림자(CSS)로 잔디 · 어두운 배경 위에서도 또렷하게.
 */
export function CardShape({ color, w = 11 }: { color: 'red' | 'yellow'; w?: number }) {
  return (
    <svg width={w} height={Math.round(w * 1.4)} viewBox="0 0 10 14" aria-hidden="true" className="cardshape">
      <rect x=".6" y=".6" width="8.8" height="12.8" rx="1.4" fill={color === 'red' ? '#E5262E' : '#F5C518'} stroke="#fff" strokeWidth="1.2" />
    </svg>
  );
}

/**
 * 등번호 배지 자리 — 우선순위: 다음 경기 출전 정지(레드카드) → 부상(십자가) → 출전 불투명(물음표)
 * → 다음 경기 대회에서 경고 1장 남음(옐로카드) → 등번호.
 */
export function NumberBadge({ p, cls, title }: {
  p: { jersey?: number; inj?: Injury; disc?: { badge?: 'red' | 'yellow' } };
  cls: string;
  title?: (kind: string) => string | undefined;
}) {
  const kind = p.disc?.badge === 'red' ? 'red' : p.inj ? (p.inj.doubtful ? 'doubt' : 'inj') : p.disc?.badge === 'yellow' ? 'yellow' : null;
  if (!kind) return p.jersey !== undefined ? <span className={`${cls} num`}>{p.jersey}</span> : null;
  if (kind === 'red' || kind === 'yellow') {
    return (
      <span className={`${cls} ${cls}--card`} data-kind={kind} title={title?.(kind)}>
        <CardShape color={kind} />
      </span>
    );
  }
  return (
    <span className={`${cls} ${cls}--inj`} data-kind={kind} data-doubt={kind === 'doubt' || undefined} title={title?.(kind)}>
      <InjuryGlyph inj={p.inj!} />
    </span>
  );
}
