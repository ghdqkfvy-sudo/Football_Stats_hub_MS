import { useState } from 'react';
import { headshot } from '../config/koreans';

/**
 * 선수 헤드샷.
 *
 * ESPN 은 축구 선수 사진을 **일부 선수에게만** 준다. 그리고 그 사실을
 * 알려 주는 곳은 팀 로스터 응답(`/teams/{id}/roster`)의 `headshot.href`
 * 하나뿐이다 — 경기별 로스터·선수 프로필·검색 응답 어디에도 사진 필드가
 * 없어서, 예전에 "ESPN 은 축구 헤드샷을 제공하지 않는다"고 잘못 결론 내린
 * 적이 있다. 실제로는 이렇게 갈린다(실측):
 *   353951 → 이미지 있음 · 296410 / 149945 → 404
 *
 * 그래서 스냅샷이 팀 로스터에서 받아 둔 실제 주소(`src`)가 있으면 그걸
 * 쓰고, 없으면 관용 주소를 시도해 본 뒤 실패하면 등번호·이니셜 배지로
 * 떨어진다. 사진이 없는 선수가 섞여 있는 게 정상이다.
 */
export function Headshot({
  id, src, kind, jersey, label, size = 34, className = '',
}: {
  id: string;
  /** 스냅샷이 확인한 실제 사진 주소 — 없으면 관용 주소를 시도한다 */
  src?: string;
  /**
   * 사진 출처. 위키백과 사진은 경기 중 전신 컷이라 가운데를 잘라내면
   * 얼굴이 안 걸린다 — `data-kind` 로 넘겨 CSS 가 위쪽을 보여 준다.
   */
  kind?: 'cutout' | 'thumb' | 'espn' | 'wiki';
  /** 등번호 배지 (없으면 배지를 그리지 않는다) */
  jersey?: number;
  /** 이미지 실패 시 원 안에 넣을 글자 — 없으면 등번호를 쓴다 */
  label?: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const fallback = label ?? (jersey !== undefined ? String(jersey) : '');
  const url = src || headshot(id);

  if (failed || !url) {
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
      <img
        src={url}
        alt=""
        loading="lazy"
        data-kind={kind ?? undefined}
        onError={() => setFailed(true)}
      />
      {jersey !== undefined && <i className="hs__n num">{jersey}</i>}
    </span>
  );
}
