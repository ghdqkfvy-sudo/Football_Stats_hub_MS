import { useEffect, useState } from 'react';
import type { Match } from '../lib/types';
import { countdown, kstFullDate, kstTime } from '../lib/kst';
import { Crest } from './Crest';
import { CompCrest } from './CompCrest';
import { usePalette } from '../lib/palette';

/** 히어로에 붙는 팀 성적 요약 — 리그 순위와 승/무/패 */
export interface TeamStanding {
  rank?: number;
  win: number;
  draw: number;
  loss: number;
}

interface Props {
  match: Match;
  /** 우리가 보고 있는 팀 (이름을 팀 컬러로 강조한다) */
  focusTeamId: string;
  /** 팀순위 데이터에서 주입 — 없으면 해당 줄을 비운다 */
  standingOf?: (teamId: string) => TeamStanding | undefined;
}

const PIN = (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z" />
    <circle cx="12" cy="10" r="2.6" />
  </svg>
);

const BOLT = (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" />
  </svg>
);

const ALARM = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9.5V13l2.4 1.6M5 3.4L2.6 5.6M19 3.4l2.4 2.2" />
  </svg>
);

export function NextMatchHero({ match, focusTeamId, standingOf }: Props) {
  const palette = usePalette();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const cd = countdown(match.kickoffUtc, now);

  /** "3위 · 3W 0D 1L" — 레퍼런스와 같은 한 줄 요약 */
  const Team = ({ t }: { t: Match['home'] }) => {
    const st = standingOf?.(t.id);
    const focus = t.id === focusTeamId;
    return (
      <div className="fxt" data-focus={focus}>
        <span className="fxt__tile">
          <Crest team={t} size={58} />
        </span>
        <div className="fxt__name">{t.name}</div>
        {st && (
          <div className="fxt__rec num">
            {st.rank !== undefined && <b>{st.rank}위</b>}
            {st.rank !== undefined && ' · '}
            {st.win}W {st.draw}D {st.loss}L
          </div>
        )}
      </div>
    );
  };

  return (
    <section className="hero" aria-label="다음 경기">
      <div className="hero__top">
        <span className="hero__tag">
          {BOLT}
          다음 경기
        </span>
        <span className="hero__comp">
          <CompCrest k={match.competition} size={17} />
          {palette.name(match.competition)}
          {match.round && <em>{match.round}</em>}
        </span>
        <span className="hero__spacer" />
        {match.venue && (
          <span className="hero__venue">
            {PIN}
            {match.venue}
          </span>
        )}
      </div>

      <div className="hero__fx">
        <Team t={match.home} />
        <div className="fxvs">VS</div>
        <Team t={match.away} />
      </div>

      <div className="hero__when">
        <div className="when__date">{kstFullDate(match.kickoffUtc)}</div>
        <div className="when__time">
          <span className="when__ico">{ALARM}</span>
          <b className="num">{kstTime(match.kickoffUtc)}</b>
          <em>KST</em>
        </div>
      </div>

      <div className="hero__cd" role="timer" aria-label="킥오프까지 남은 시간">
        {([['일', cd.days], ['시', cd.hours], ['분', cd.minutes], ['초', cd.seconds]] as const).map(
          ([label, v], i) => (
            <div className="cdu" key={label}>
              {i > 0 && <span className="cdu__sep" aria-hidden="true">:</span>}
              <b className="num">{i === 0 ? v : String(v).padStart(2, '0')}</b>
              <i>{label}</i>
            </div>
          ),
        )}
      </div>
    </section>
  );
}
