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
      try { await navigator.share({ title, url: href }); return; } catch (e) {
        /* 사용자가 닫았으면(AbortError) 끝. 그 밖의 실패(권한 · 앱 안 브라우저)는 주소 복사로 넘어간다 */
        if ((e as DOMException)?.name === 'AbortError') return;
      }
    }
    flash(await copyText(href) ? 'copied' : 'failed');
  };

  return (
    <button type="button" className={`sharel${className ? ` ${className}` : ''}`} onClick={share} title="이 화면의 링크 보내기" data-done={done ?? undefined}>
      {done === 'copied' ? '✓ 복사됨' : done === 'failed' ? '복사 실패' : '🔗 링크'}
    </button>
  );
}

/**
 * 주소 복사 — 클립보드 API 가 없거나 막힌 곳(카카오톡 · 인스타 같은 앱 안 브라우저, http)에서는
 * 보이지 않는 입력칸을 골라 복사하는 옛 방식으로 한 번 더 해 본다.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* 아래 방식으로 */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px';   // 16px — iOS 가 확대하지 않게
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}
