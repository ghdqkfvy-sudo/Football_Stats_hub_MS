import { useEffect, useState } from 'react';
import type { Match } from '../lib/types';
import type { Target } from '../config/targets';
import { countdown, kstShortDate, kstTime } from '../lib/kst';
import { comp } from '../config/targets';
import { Crest } from './Crest';
import { CompCrest } from './CompCrest';

/**
 * 매치데이 히어로 — 모든 팀 중 **가장 가까운 경기**를 큰 카드로, 나머지를
 * 작은 카드로 늘어놓는다. 작은 카드를 누르면 그 팀이 히어로가 된다.
 *
 * 각 팀 탭의 히어로와 달리 여기서는 "어느 팀 경기인가" 가 먼저 읽혀야 하므로
 * 카드마다 그 팀 컬러를 띠로 두른다.
 */

interface CardProps {
  target: Target;
  match: Match;
  hero?: boolean;
  onSelect?: () => void;
}

/** 우리 팀 기준 홈/원정 */
const sideOf = (m: Match, teamId: string) => (m.home.id === teamId ? 'HOME' : 'AWAY');

function Countdown({ iso }: { iso: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const c = countdown(iso, now);
  if (c.past) return <span className="mdh__cd num">곧 시작</span>;
  const two = (n: number) => String(n).padStart(2, '0');
  return (
    <span className="mdh__cd num">
      {c.days > 0 && <b>{c.days}<i>일</i></b>}
      <b>{two(c.hours)}<i>시간</i></b>
      <b>{two(c.minutes)}<i>분</i></b>
      <b>{two(c.seconds)}<i>초</i></b>
    </span>
  );
}

export function MatchdayCard({ target, match, hero = false, onSelect }: CardProps) {
  const side = sideOf(match, target.espnTeamId);
  const c = comp(match.competition);
  const Tag = onSelect ? 'button' : 'div';

  return (
    <Tag
      className="mdh__card"
      data-hero={hero || undefined}
      /* accent 를 쓴다 — brand 가 거의 검정인 팀(뉴캐슬)은 테두리가 사라진다.
         (targets.ts: accent = 어두운 배경용으로 밝기를 올린 변형) */
      style={{
        ['--team' as string]: target.theme.accent,
        ['--teamfg' as string]: target.theme.accent,
      }}
      onClick={onSelect}
      {...(onSelect ? { type: 'button' as const, 'aria-label': `${target.nameEn} 경기를 크게 보기` } : {})}
    >
      {/* 팀명이 두 줄로 갈리면 카드 높이가 제각각이 된다 (Man United) */}
      <header className="mdh__top">
        <Crest
          team={{
            id: target.espnTeamId, name: target.name, shortName: target.name,
            abbr: target.abbr, logo: target.crest,
          }}
          size={hero ? 26 : 20}
        />
        <b className="mdh__team">{target.name}</b>
        <span className="mdh__comp">
          <CompCrest k={match.competition} size={14} />
          {c.name}
        </span>
      </header>

      <div className="mdh__fx">
        <div className="mdh__side">
          <Crest team={match.home} size={hero ? 54 : 34} />
          <span>{match.home.shortName}</span>
        </div>
        <div className="mdh__vs">
          {match.status === 'live' ? (
            <em className="mdh__live">LIVE</em>
          ) : (
            <span className="num">VS</span>
          )}
        </div>
        <div className="mdh__side">
          <Crest team={match.away} size={hero ? 54 : 34} />
          <span>{match.away.shortName}</span>
        </div>
      </div>

      <footer className="mdh__foot">
        <span className="mdh__ha" data-side={side}>{side === 'HOME' ? 'H' : 'A'}</span>
        {match.venue && <span className="mdh__venue">{match.venue}</span>}
        <span className="mdh__when num">
          {kstShortDate(match.kickoffUtc)} {match.timeTBD ? 'TBD' : kstTime(match.kickoffUtc)}
        </span>
      </footer>

      {/* 카운트다운은 히어로에만 — 작은 카드까지 매초 다시 그릴 이유가 없다 */}
      {hero && match.status !== 'live' && <Countdown iso={match.kickoffUtc} />}
    </Tag>
  );
}
