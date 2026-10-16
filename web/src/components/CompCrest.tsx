import { useState } from 'react';
import { usePalette } from '../lib/palette';

/**
 * 대회 앰블럼. ESPN 리그 로고를 쓰고, 로드에 실패하면(또는 로고가 없는
 * 대회면) 기존의 대회 컬러 도트로 폴백한다.
 * — Artifact 프리뷰처럼 외부 이미지가 막힌 환경에서는 항상 도트가 보인다.
 */
export function CompCrest({ k, size = 15 }: { k: string; size?: number }) {
  const p = usePalette();
  const logo = p.logo(k);
  /* 0: 화이트(500-dark) · 1: 컬러 원본(500) · 2: 실패 → 도트.
     컵 대회 몇몇은 화이트 판이 없어서, 그때는 컬러 원본으로 한 번 더 시도한다. */
  const [step, setStep] = useState<{ src?: string; n: number }>({ n: 0 });
  const n = step.src === logo ? step.n : 0;
  const src = n === 1 ? logo?.replace('/500-dark/', '/500/') : logo;

  if (!src || n >= 2) {
    return <i className="cdot" style={{ ['--c' as string]: p.color(k) }} aria-hidden="true" />;
  }

  return (
    <img
      className="clogo"
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setStep({ src: logo, n: n === 0 && logo?.includes('/500-dark/') ? 1 : 2 })}
      style={{ width: size, height: size }}
    />
  );
}
