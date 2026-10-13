import { useState } from 'react';

/**
 * 팀 배경 아트워크 — 콘텐츠 뒤에서 어둡게 깔린다.
 *
 * 팀을 바꾸면 사진이 툭 바뀌었다. 이전 사진을 한 장 남겨 두고 새 사진을 그 위에서
 * 0.6초 동안 떠오르게 한 뒤(motion.css .bgart__img[data-enter]) 이전 장을 치운다.
 * 사진이 없는 팀은 팀 컬러 그라디언트(data-empty).
 */
export interface BgLayer {
  /** 바뀌었는지 가리는 열쇠 (팀 id · 'summary') */
  key: string;
  src?: string;
}

export function BgArt({ kind, layer }: { kind: string; layer: BgLayer }) {
  /* 이전 장 — 렌더 중에 열쇠가 바뀐 걸 보고 바로 갈아 끼운다(파생 상태; 이펙트를 거치지 않는다) */
  const [layers, setLayers] = useState<{ cur: BgLayer; prev: BgLayer | null }>({ cur: layer, prev: null });
  if (layers.cur.key !== layer.key) setLayers({ cur: layer, prev: layers.cur });

  const img = (l: BgLayer, enter: boolean) => (
    <div
      key={l.key}
      className="bgart__img"
      data-empty={!l.src || undefined}
      data-enter={enter || undefined}
      style={l.src ? { backgroundImage: `url(${l.src})` } : undefined}
      onAnimationEnd={enter ? () => setLayers((s) => ({ ...s, prev: null })) : undefined}
    />
  );

  return (
    <div className="bgart" data-kind={kind} aria-hidden="true">
      {layers.prev && img(layers.prev, false)}
      {img(layers.cur, !!layers.prev)}
      <div className="bgart__veil" />
    </div>
  );
}
