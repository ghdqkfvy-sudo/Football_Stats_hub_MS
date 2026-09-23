import { useState } from 'react';
import type { TeamRef } from '../lib/types';
import { tintOf } from '../config/crestTint';

/**
 * 엠블럼. 기본은 ESPN CDN 이미지이고, 로드에 실패하면 팀 컬러 배지로 폴백한다.
 * (Artifact 프리뷰처럼 외부 이미지가 차단된 환경에서는 항상 폴백이 보인다.)
 */
export function Crest({ team, size = 24, className = '' }: { team: TeamRef; size?: number; className?: string }) {
  /* 실패 상태는 **그 주소에 대해서만** 유효하다.
     예전에는 한 번 실패하면 그 자리에 다른 팀이 와도 계속 글자 배지로
     떨어졌다(팀을 바꿔도 컴포넌트는 같은 자리에 남아 상태가 살아 있었다).
     그래서 대한민국으로 바꿔도 태극 문양 대신 'KOR' 글자가 떴다. */
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = !!team.logo && failedSrc === team.logo;
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
      /* `crest` 는 문양 윤곽에 아주 얇은 빛을 두른다 — 토트넘 남색 수탉처럼
         어두운 엠블럼이 어두운 배경에 묻히는 것을 막는다(global.css 참고) */
      className={`crest ${className}`}
      key={team.logo}
      src={team.logo}
      alt={team.name}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailedSrc(team.logo)}
      style={{ width: size, height: size, objectFit: 'contain' }}
    />
  );
}
