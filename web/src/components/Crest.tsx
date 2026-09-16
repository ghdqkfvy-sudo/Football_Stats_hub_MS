import { useState } from 'react';
import type { TeamRef } from '../lib/types';
import { tintOf } from '../config/crestTint';

/**
 * 엠블럼. 기본은 ESPN CDN 이미지이고, 로드에 실패하면 팀 컬러 배지로 폴백한다.
 * (Artifact 프리뷰처럼 외부 이미지가 차단된 환경에서는 항상 폴백이 보인다.)
 */
export function Crest({ team, size = 24, className = '' }: { team: TeamRef; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const label = team.abbr || team.shortName.replace(/\s/g, '').slice(0, 3);

  if (!team.logo || failed) {
    const [bg, fg] = tintOf(team.id);
    return (
      <span
        className={`mono ${className}`}
        style={{
          width: size,
          height: size,
          fontSize: Math.max(8, size * (label.length > 2 ? 0.3 : 0.38)),
          background: `linear-gradient(155deg, ${bg}, color-mix(in srgb, ${bg} 70%, #05070D))`,
          borderColor: `color-mix(in srgb, ${fg} 28%, transparent)`,
          color: fg,
        }}
        aria-label={team.name}
      >
        {label}
      </span>
    );
  }
  return (
    <img
      className={className}
      src={team.logo}
      alt={team.name}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      style={{ width: size, height: size, objectFit: 'contain' }}
    />
  );
}
