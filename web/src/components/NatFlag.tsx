import { useState } from 'react';
import type { Nationality } from '../types/feedTypes';

/**
 * 선수 국적 — 국기 + 3글자 약어(ESP). 카드 포지션 옆에 쓴다.
 * 국기 이미지가 안 뜨면 약어만 남는다. 국적을 모르면 아무것도 그리지 않는다.
 */
export function NatFlag({ nat }: { nat?: Nationality }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!nat || (!nat.code && !nat.flag)) return null;
  const showImg = nat.flag && failed !== nat.flag;
  return (
    <span className="natf" title={nat.name ?? nat.code}>
      {showImg && (
        <img src={nat.flag} alt="" loading="lazy" onError={() => setFailed(nat.flag!)} />
      )}
      {nat.code && <span className="num">{nat.code}</span>}
    </span>
  );
}
