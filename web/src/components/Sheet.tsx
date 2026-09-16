import { useEffect } from 'react';
import type { Match } from '../lib/types';
import { kstFullDate, kstTime } from '../lib/kst';
import { Crest } from './Crest';
import { CompBadge } from './Bits';
import { GoalSheet } from './GoalSheet';

/** 모바일 전용 — 캘린더 호버를 대체하는 바텀시트. */
export function MatchSheet({
  match, loading, onClose,
}: { match: Match | null; loading: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!match) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [match, onClose]);

  const done = match?.status === 'finished';

  return (
    <div className="sheet" data-open={!!match} aria-hidden={!match}>
      <div className="sheet__scrim" onClick={onClose} />
      {match && (
        <div className="sheet__panel" role="dialog" aria-modal="true" aria-label="경기 상세">
          <div className="sheet__grab" />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
            <CompBadge k={match.competition} />
            <span className="eyebrow">{done ? '경기 종료' : '경기 예정'}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center' }}>
              <Crest team={match.home} size={46} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>{match.home.shortName}</span>
            </div>
            <div style={{ textAlign: 'center' }}>
              {done ? (
                <div className="num" style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 600 }}>
                  {match.homeScore} : {match.awayScore}
                </div>
              ) : (
                <div className="num" style={{ fontFamily: 'var(--font-display)', fontSize: 30, color: 'var(--accent)' }}>
                  {kstTime(match.kickoffUtc)}
                </div>
              )}
              <div style={{ fontSize: 11, color: 'var(--text-lo)', marginTop: 2 }}>
                {kstFullDate(match.kickoffUtc)} KST
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center' }}>
              <Crest team={match.away} size={46} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>{match.away.shortName}</span>
            </div>
          </div>

          {match.venue && (
            <p style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--text-lo)', margin: '14px 0 0' }}>
              {match.venue}
            </p>
          )}

          {done && (
            <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
              <GoalSheet m={match} loading={loading} />
            </div>
          )}

          <button
            onClick={onClose}
            style={{
              width: '100%', marginTop: 20, padding: '12px', borderRadius: 10,
              border: '1px solid var(--line-2)', color: 'var(--text-mid)', fontSize: 13,
            }}
          >
            닫기
          </button>
        </div>
      )}
    </div>
  );
}
