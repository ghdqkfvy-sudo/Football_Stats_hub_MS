import { useState } from 'react';
import { headshot } from '../config/koreans';

/**
 * 선수 헤드샷.
 *
 * ⚠️ ESPN은 축구 선수 개인 사진을 공개 API/CDN으로 제공하지 않는다 —
 * `/i/headshots/soccer/players/full/{id}.png` 패턴을 손흥민·비니시우스
 * 주니어처럼 확실히 사진이 있어야 할 스타 선수 ID로도 확인해 봤지만 전부
 * 404였다(선수 프로필·로스터 응답 어디에도 headshot 필드 자체가 없다).
 * 그래서 네트워크 요청을 시도하지 않고 바로 등번호/이니셜 배지를 보여준다
 * — 실패하는 이미지 요청을 계속 쏘는 것보다 정직하고 빠르다.
 * ESPN이 나중에 이 데이터를 제공하게 되면 `ATTEMPT_IMAGE` 를 true로 바꾸면 된다.
 */
const ATTEMPT_IMAGE = false;

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
  const [failed, setFailed] = useState(!ATTEMPT_IMAGE);
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
