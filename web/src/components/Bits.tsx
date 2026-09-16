import type { CompetitionKey, Match, ResultOf } from '../lib/types';
import { isDawnMatch } from '../lib/kst';
import { usePalette } from '../lib/palette';
import { CompCrest } from './CompCrest';

export function CompBadge({ k, dot = true }: { k: CompetitionKey; dot?: boolean }) {
  const p = usePalette();
  return (
    <span className="cbadge" style={{ ['--c' as string]: p.color(k) }}>
      {dot && <CompCrest k={k} size={16} />}
      {p.name(k)}
    </span>
  );
}

export function FormChips({ form }: { form: ResultOf[] }) {
  if (!form.length) return null;
  const padded: (ResultOf | '-')[] = [...Array(Math.max(0, 5 - form.length)).fill('-'), ...form].slice(-5);
  return (
    <span className="side__form" aria-label={`최근 5경기 ${form.join('')}`}>
      {padded.map((r, i) => (
        <span key={i} className="fchip" data-r={r}>
          {r === '-' ? '' : r}
        </span>
      ))}
    </span>
  );
}

export function DawnBadge({ iso }: { iso: string }) {
  if (!isDawnMatch(iso)) return null;
  return (
    <span className="dawn" title="한국시간 기준 새벽 경기입니다">
      <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
      새벽
    </span>
  );
}

/** 특정 팀 관점의 승/무/패 */
export function resultFor(m: Match, teamId: string): ResultOf | null {
  if (m.status !== 'finished' || m.homeScore === undefined || m.awayScore === undefined) return null;
  const isHome = m.home.id === teamId;
  const mine = isHome ? m.homeScore : m.awayScore;
  const theirs = isHome ? m.awayScore : m.homeScore;
  return mine > theirs ? 'W' : mine < theirs ? 'L' : 'D';
}
