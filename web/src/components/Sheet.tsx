import { useEffect } from 'react';
import type { Match } from '../lib/types';
import { kstFullDate, kstTime } from '../lib/kst';
import { Crest } from './Crest';
import { CompBadge } from './Bits';
import { GoalSheet } from './GoalSheet';

/**
 * 폰 캘린더의 경기 상세 — 아래에서 올라오는 시트.
 *
 * 폰에서는 날짜 칸이든 경기 막대든 누르면 이 시트 하나만 뜬다(Calendar 의 onPickDay).
 * 예전에는 막대 → 이 시트, 날짜 → 작은 미리보기로 갈려서, 5px 막대를 맞혔는지에 따라
 * 다른 창이 떴다. 하루에 경기가 둘이면(대표팀 등) 위아래로 이어서 보여 준다.
 */
export function MatchSheet({
  matches, loadingIds, onClose,
}: { matches: Match[]; loadingIds: ReadonlySet<string>; onClose: () => void }) {
  const open = matches.length > 0;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <div className="sheet" data-open={open} aria-hidden={!open}>
      <div className="sheet__scrim" onClick={onClose} />
      {open && (
        <div className="sheet__panel" role="dialog" aria-modal="true" aria-label="경기 상세">
          <div className="sheet__grab" />
          {matches.map((m) => (
            <div className="sheet__m" key={m.id}>
              <SheetMatch match={m} loading={loadingIds.has(m.id)} />
            </div>
          ))}

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

/** 시트 안의 경기 한 건 */
function SheetMatch({ match, loading }: { match: Match; loading: boolean }) {
  const done = match.status === 'finished';
  return (
    <>
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
            {/* 시각 미정이면 ESPN 이 임의 시각(대개 05:00 KST)을 채워 보낸다 — TBD 로 */}
            {match.timeTBD ? 'TBD' : kstTime(match.kickoffUtc)}
          </div>
        )}
        <div style={{ fontSize: 11, color: 'var(--text-lo)', marginTop: 2 }}>
          {kstFullDate(match.kickoffUtc)} {match.timeTBD && !done ? '· 시각 미정' : 'KST'}
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
    </>
  );
}
