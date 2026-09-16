import { useState } from 'react';
import { usePalette } from '../lib/palette';

/**
 * 대회 앰블럼. ESPN 리그 로고를 쓰고, 로드에 실패하면(또는 로고가 없는
 * 대회면) 기존의 대회 컬러 도트로 폴백한다.
 * — Artifact 프리뷰처럼 외부 이미지가 막힌 환경에서는 항상 도트가 보인다.
 */
export function CompCrest({ k, size = 15 }: { k: string; size?: number }) {
  const p = usePalette();
  const src = p.logo(k);
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
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
      onError={() => setFailed(true)}
      style={{ width: size, height: size }}
    />
  );
}
