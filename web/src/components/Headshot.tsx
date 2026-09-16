import { useState } from 'react';
import { headshot } from '../config/koreans';

/**
 * 선수 헤드샷. 이미지가 없거나 차단되면 등번호 배지로 폴백한다.
 * (Artifact 프리뷰는 외부 이미지를 막으므로 항상 폴백이 보인다)
 */
export function Headshot({
  id, jersey, label, size = 34, className = '',
}: {
  id: string;
  /** 등번호 배지 (없으면 배지를 그리지 않는다) */
  jersey?: number;
  /** 이미지 실패 시 원 안에 넣을 글자 — 없으면 등번호를 쓴다 */
  label?: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const fallback = label ?? (jersey !== undefined ? String(jersey) : '');

  if (failed) {
    return (
      <span
        className={`hs hs--fallback ${className}`}
        style={{ width: size, height: size, fontSize: Math.max(10, size * (fallback.length > 2 ? 0.3 : 0.42)) }}
        aria-hidden="true"
      >
        {fallback}
      </span>
    );
  }
  return (
    <span className={`hs ${className}`} style={{ width: size, height: size }}>
      <img src={headshot(id)} alt="" loading="lazy" onError={() => setFailed(true)} />
      {jersey !== undefined && <i className="hs__n num">{jersey}</i>}
    </span>
  );
}
