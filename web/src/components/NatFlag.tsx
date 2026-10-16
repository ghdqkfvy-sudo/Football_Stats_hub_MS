import { useState } from 'react';
import type { Nationality } from '../types/feedTypes';

/**
 * 선수 국적 — 국기만. 카드에서 포지션 왼쪽에 쓴다(마우스를 올리면 나라 이름).
 * 국기 이미지가 안 뜨거나 국적을 모르면 아무것도 그리지 않는다.
 */
export function NatFlag({ nat }: { nat?: Nationality }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!nat?.flag || failed === nat.flag) return null;
  return (
    <img
      className="natf"
      src={nat.flag}
      alt={nat.name ?? nat.code ?? ''}
      title={nat.name ?? nat.code}
      loading="lazy"
      onError={() => setFailed(nat.flag!)}
    />
  );
}
