import { useEffect, useRef } from 'react';
import type { PlayerSeason } from '../lib/squad';
import { GameRow, PlayerSummary } from './PlayerCardParts';

/**
 * 선수 상세 — 이번 시즌 출전한 **모든 경기**의 기록.
 *
 * 모양은 호버 카드와 같다(같은 조각 PlayerCardParts) — 왼쪽 본체 + 오른쪽 경기 목록.
 * 다른 점은 경기 목록이 최근 3경기가 아니라 시즌 전 경기라는 것뿐이다.
 * 폰에서는 선수 목록을 누르면 이 시트만 뜬다(호버 카드는 띄우지 않는다).
 * 넓은 화면은 가운데 창, 폰은 바텀시트(.sheet 를 같이 쓴다).
 */
export function PlayerDetail({ p, onClose }: { p: PlayerSeason | null; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);

  /* Esc 로 닫고, 열릴 때 창으로 초점을 옮긴다(키보드·스크린리더가 창 안에서 시작) */
  useEffect(() => {
    if (!p) return;
    const back = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      back?.focus?.({ preventScroll: true });
    };
  }, [p, onClose]);

  const games = p?.recent ?? [];

  return (
    <div className="sheet sheet--modal" data-open={!!p} aria-hidden={!p}>
      <div className="sheet__scrim" onClick={onClose} />
      {p && (
        <div
          className="sheet__panel pdet"
          role="dialog"
          aria-modal="true"
          aria-label={`${p.name} 시즌 경기 기록`}
          tabIndex={-1}
          ref={panel}
        >
          <div className="sheet__grab" />
          <button className="pdet__x" aria-label="닫기" onClick={onClose}>✕</button>

          <div className="pdet__body">
            <div className="pcard__main">
              <PlayerSummary p={p} />
            </div>

            <div className="pcard__side">
              <div className="pcard__sideh">
                <b>시즌 {games.length}경기</b>
                <span>최신순</span>
              </div>
              {games.length === 0
                ? <p className="pdet__none">경기별 라인업 기록이 아직 없습니다.</p>
                : games.map((g) => <GameRow key={g.matchId} g={g} />)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
