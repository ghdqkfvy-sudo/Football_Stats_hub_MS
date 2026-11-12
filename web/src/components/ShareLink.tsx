import { useEffect, useRef, useState } from 'react';

/**
 * 이 화면의 링크 보내기 — 폰은 공유 시트(카톡 등), 그 밖에는 주소를 복사한다.
 * 복사는 눈에 안 보이는 동작이라 단추 글자를 잠깐 "복사됨" 으로 바꿔 알려 준다.
 */
export function ShareLink({ href, title, className }: { href: string; title: string; className?: string }) {
  const [done, setDone] = useState<'copied' | 'failed' | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const flash = (v: 'copied' | 'failed') => {
    setDone(v);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setDone(null), 1600);
  };

  const share = async () => {
    /* 공유 시트는 터치 기기에서만 — 데스크톱 브라우저의 공유 창은 주소 복사보다 느리다 */
    const touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
    if (touch && typeof navigator.share === 'function') {
      try { await navigator.share({ title, url: href }); } catch { /* 닫았다 — 아무 일도 아니다 */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(href);
      flash('copied');
    } catch { flash('failed'); }
  };

  return (
    <button type="button" className={`sharel${className ? ` ${className}` : ''}`} onClick={share} title="이 화면의 링크 보내기" data-done={done ?? undefined}>
      {done === 'copied' ? '✓ 복사됨' : done === 'failed' ? '복사 실패' : '🔗 링크'}
    </button>
  );
}
