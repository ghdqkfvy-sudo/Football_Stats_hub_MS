import { useEffect, useState } from 'react';
import { setKoreanRoster } from '../config/targets';
import { loadKoreans } from './api';

/**
 * 코리안리거 명단을 한 번 받아 koreansOf 가 쓰게 한다 (2026-11-07).
 * 받은 뒤 이 훅을 쓴 화면을 한 번 다시 그린다 — 그 아래 카드 · 캘린더의 koreansOf 가 새 명단을 본다.
 */
let loaded: Promise<void> | null = null;
export function useKoreanRoster(): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    let alive = true;
    loaded ??= loadKoreans().then((r) => setKoreanRoster(r.data));
    loaded.then(() => { if (alive) setV((x) => x + 1); });
    return () => { alive = false; };
  }, []);
  return v;
}
