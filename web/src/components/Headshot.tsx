import { useEffect, useState } from 'react';
import { headshot } from '../config/koreans';
import { canonicalPhotoUrl } from '../lib/photoUrl';
import { sofascoreImage } from '../lib/photoProbe';
import { cutoutOf, cutoutReady } from '../lib/cutout';

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
  id, src, kind, sofa, jersey, label, size = 34, className = '',
}: {
  id: string;
  /** 스냅샷이 확인한 실제 사진 주소 — 없으면 관용 주소를 시도한다 */
  src?: string;
  /**
   * 사진 출처. 위키백과 사진은 경기 중 전신 컷이라 가운데를 잘라내면
   * 얼굴이 안 걸린다 — `data-kind` 로 넘겨 CSS 가 위쪽을 보여 준다.
   */
  kind?: 'cutout' | 'thumb' | 'espn' | 'wiki';
  /**
   * SofaScore 선수 ID — **사진 1순위**(2026-10-16). 이미지가 안 뜨면 src(받아 둔 컷아웃 등)로,
   * 그것도 안 되면 ESPN 관용 주소 → 글자 배지로 내려간다.
   */
  sofa?: string;
  /** 등번호 배지 (없으면 배지를 그리지 않는다) */
  jersey?: number;
  /** 이미지 실패 시 원 안에 넣을 글자 — 없으면 등번호를 쓴다 */
  label?: string;
  size?: number;
  className?: string;
}) {
  /*
   * 실패는 **그 주소에 대해서만** 기억한다(Crest 와 같은 규칙).
   * 예전에는 한 번 실패하면 영영 글자 배지였다 — Future Resources 는 카드가
   * 피드보다 먼저 그려져서, 처음엔 사진 주소가 없어 관용 ESPN 주소를 시도하다
   * 404 가 났고, 곧이어 피드가 진짜 사진 주소를 줘도 다시 시도하지 않았다.
   * 후보가 여럿이라(SofaScore → 받아 둔 사진 → ESPN) 실패한 주소들을 모아 둔다.
   */
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const fallback = label ?? (jersey !== undefined ? String(jersey) : '');
  const confirmed = canonicalPhotoUrl(src);
  const sofaUrl = sofa ? sofascoreImage(sofa) : '';
  /* 후보 순서 — [주소, data-kind, 스냅샷이 확인한 주소인가] */
  const candidates: [string, string | undefined, boolean][] = [];
  if (sofaUrl) candidates.push([sofaUrl, 'sofa', true]);
  if (confirmed) candidates.push([confirmed, kind, true]);
  const guess = headshot(id);
  if (guess && guess !== confirmed) candidates.push([guess, undefined, false]);
  const pick = candidates.find(([u]) => !failed.has(u));

  /* SofaScore 사진은 흰 바탕이라 배경을 지운 판을 쓴다(lib/cutout.ts).
     ⚠️ 원본을 먼저 띄우면 흰 원판이 잠깐 보였다가 바뀐다(2026-10-16 피드백) —
     처리될 때까지는 빈 원(자리만)을 두고, 처리하지 못했을 때만 원본을 쓴다 */
  const sofaPick = pick?.[1] === 'sofa' ? pick[0] : '';
  const [clean, setClean] = useState<{ url: string; data: string | null } | null>(null);
  useEffect(() => {
    if (!sofaPick) return;
    let alive = true;
    cutoutOf(sofaPick).then((data) => { if (alive) setClean({ url: sofaPick, data }); });
    return () => { alive = false; };
  }, [sofaPick]);
  /* 확인된 주소가 하나라도 실패했으면 스모크가 센다(추측 주소 404 는 정상) */
  const failedConfirmed = candidates.find(([u, , c]) => c && failed.has(u))?.[0];

  if (!pick) {
    return (
      <span
        className={`hs hs--fallback ${className}`}
        /*
         * 스냅샷이 확인한 주소를 못 불러온 경우만 — 화면 스모크(e2e/smoke.mjs)가 "사진 없음" 과 구분해 센다.
         * 관용 주소 추측이 404 난 건 원본에 사진이 없는 선수라 정상이다.
         */
        data-failed={failedConfirmed}
        style={{ width: size, height: size, fontSize: Math.max(10, size * (fallback.length > 2 ? 0.3 : 0.42)) }}
        aria-hidden="true"
      >
        {fallback}
      </span>
    );
  }
  const [url, k, sure] = pick;
  /* undefined = 처리 중 · null = 못 함(원본) · 문자열 = 배경 지운 판 */
  const ready = k === 'sofa' ? (clean?.url === url ? clean.data : cutoutReady(url)) : null;
  if (k === 'sofa' && ready === undefined) {
    return (
      <span className={`hs hs--wait ${className}`} style={{ width: size, height: size }} aria-hidden="true">
        {jersey !== undefined && <i className="hs__n num">{jersey}</i>}
      </span>
    );
  }
  const shown = typeof ready === 'string' ? ready : url;
  return (
    <span className={`hs ${className}`} style={{ width: size, height: size }}>
      <img
        key={url}
        src={shown}
        alt=""
        loading="lazy"
        data-kind={k}
        data-clean={shown !== url || undefined}
        /* 추측 주소 — 404 가 정상일 수 있어 스모크가 세지 않는다 */
        data-guess={sure ? undefined : ''}
        /* SofaScore CDN 은 다른 사이트에서 부를 때 리퍼러를 보면 막을 수 있다 */
        referrerPolicy={k === 'sofa' ? 'no-referrer' : undefined}
        onError={() => setFailed((f) => new Set(f).add(url))}
      />
      {jersey !== undefined && <i className="hs__n num">{jersey}</i>}
    </span>
  );
}
