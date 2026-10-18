import { Fragment } from 'react';
import { RatingBadge } from './RatingBadge';
import { seasonRatingTitle } from '../lib/rating';
import type { GameState, PlayerSeason, RecentGame } from '../lib/squad';
import { isBenchRegular, stateDelta } from '../lib/squad';
import { usePalette } from '../lib/palette';
import { kstShortDate } from '../lib/kst';
import { Headshot } from './Headshot';
import { NatFlag } from './NatFlag';
import { InjuryLine } from './InjuryMark';
import { DisciplineLines } from './DisciplineLines';
import { Crest } from './Crest';
import { CompCrest } from './CompCrest';

/*
 * 선수 카드 조각 — 호버 카드(PlayerTable PlayerCard)와 선수 상세 시트(PlayerDetail)가
 * **같은 모양**을 쓰도록 한곳에 둔다. 폰에서는 시트만 뜨므로 시트가 카드와 같아 보여야
 * 넓은 화면에서 보던 정보를 그대로 찾을 수 있다.
 */

const POS_LABEL: Record<string, string> = { G: 'GK', D: 'DF', M: 'MF', F: 'FW' };

export function Cards({ yellow, red, zero = false }: { yellow: number; red: number; zero?: boolean }) {
  if (!yellow && !red && !zero) return <i className="cards__none">–</i>;
  return (
    <span className="cards">
      {(yellow > 0 || zero) && (
        <b className="num" data-c="y">
          <i />
          {yellow}
        </b>
      )}
      {(red > 0 || zero) && (
        <b className="num" data-c="r">
          <i />
          {red}
        </b>
      )}
    </span>
  );
}

/** 카드 본체 — 이름·포지션, 출전/선발/골/도움, 출전 시간·공격 포인트, 카드, 대회별 */
export function PlayerSummary({ p }: { p: PlayerSeason }) {
  const palette = usePalette();
  return (
    <>
    <div className="pcard__top">
      <Headshot id={p.id} src={p.photo} kind={p.photoKind} sofa={p.sofascoreId} label={String(p.jersey)} size={46} className="pcard__hs" />
      <div>
        <b>{p.name}</b>
        <span>
          <NatFlag nat={p.nat} />
          <em className="pcard__pos" data-pos={p.pos}>{POS_LABEL[p.pos]}</em>
          {` #${p.jersey}`}
          {p.age ? ` · ${p.age}세` : ''}
          {p.rating != null && <span className="pmeta__rtg">· 시즌 평점 <RatingBadge v={p.rating} title={seasonRatingTitle(p)} /></span>}
        </span>
      </div>
    </div>
    <InjuryLine inj={p.inj} />
    <DisciplineLines d={p.disc} />

    {/* 숫자 네 칸은 있는 그대로 — 강조 상자는 공격 포인트 하나만 쓴다 */}
    <div className="pcard__stats">
      {([
        ['출전', p.apps, false],
        ['선발', p.starts, false],
        ['골', p.goals, true],
        ['도움', p.assists, true],
      ] as const).map(([k, v, tint]) => (
        // 골·도움 숫자는 팀 컬러로 — 상자는 그대로 두고 값만 눈에 띄게
        <div key={k} data-tint={tint && v > 0 ? true : undefined}>
          <b className="num">{v}</b>
          <span>{k}</span>
        </div>
      ))}
    </div>

    <div className="pcard__hero">
      <div className="pcard__mins num">
        <b>{p.minutes}<i>분</i></b>
        {/* 경기별 실제 교체 기록이 있으면 모든 대회 합계지만, 없으면
            시즌 통계(리그 전용)를 쓴 값이라 라벨을 구분해 준다. */}
        <span>{p.realMinutes ? '출전 시간' : '리그 출전 시간'}</span>
      </div>
      <div className="pcard__ap num" data-on={p.points > 0}>
        <b>{p.points}</b>
        <span>공격 포인트</span>
      </div>
    </div>

    <div className="pcard__cards">
      <span>카드</span>
      <Cards yellow={p.yellow} red={p.red} zero />
    </div>

    {p.byComp.length > 0 && (
      <div className="pcard__comps">
        <span className="eyebrow">대회별</span>
        {p.byComp.map((c) => (
          <div className="pcard__comp" key={c.competition}>
            <CompCrest k={c.competition} size={14} />
            <span className="pcard__cn">{palette.name(c.competition)}</span>
            <span className="pcard__ca num">
              <b>{c.apps}</b>경기<i>(선발 <b>{c.starts}</b>)</i>
            </span>
            <span className="pcard__cg num">
              <span className="g" data-zero={c.goals === 0}><b>{c.goals}</b>G</span>
              <span className="a" data-zero={c.assists === 0}><b>{c.assists}</b>A</span>
            </span>
          </div>
        ))}
      </div>
    )}
    </>
  );
}

const STATE_KO: Record<GameState, string> = { L: '리드', D: '동점', T: '열세' };
const ORDER: GameState[] = ['L', 'D', 'T'];

/**
 * 교체 자원 요약 — 주로 벤치에서 나오는 선수만(isBenchRegular).
 * 골·도움이 없는 미드필더·수비수도 읽을 거리가 있게, 투입 시각과 함께
 * "들어갔을 때의 경기 상황이 나올 때(또는 종료 때) 어떻게 바뀌었나" 를 보여 준다.
 */
export function BenchLine({ p }: { p: PlayerSeason }) {
  const b = p.bench;
  if (!b || !isBenchRegular(p)) return null;
  const tally = { 1: 0, 0: 0, [-1]: 0 } as Record<-1 | 0 | 1, number>;
  const grid = { L: { L: 0, D: 0, T: 0 }, D: { L: 0, D: 0, T: 0 }, T: { L: 0, D: 0, T: 0 } } as Record<GameState, Record<GameState, number>>;
  for (const c of b.changes) {
    tally[stateDelta(c.from, c.to)]++;
    grid[c.from][c.to]++;
  }
  const subGoals = p.recent.filter((g) => !g.started).reduce((a, g) => a + g.goals, 0);
  const subAssists = p.recent.filter((g) => !g.started).reduce((a, g) => a + g.assists, 0);
  return (
    <div className="bench">
      <div className="bench__head">
        <span className="eyebrow">교체 출전</span>
        <span className="bench__note num">팀 {b.team}경기 기준</span>
      </div>
      {/* 위 카드의 출전·선발 칸과 같은 모양 — 숫자는 같은 글꼴·크기, 이름표는 아래 */}
      <div className="pcard__stats bench__stats">
        <div><b className="num">{b.subs}</b><span>교체 출전</span></div>
        <div><b className="num">{b.avgIn}&apos;</b><span>평균 투입</span></div>
        <div><b className="num">{b.minutes}<i>분</i></b><span>교체로 뛴 시간</span></div>
        <div data-tint={subGoals + subAssists > 0 || undefined} title={`교체로 ${subGoals}골 ${subAssists}도움`}>
          <b className="num">{subGoals + subAssists}</b>
          <span>교체 공격P</span>
        </div>
      </div>
      {b.changes.length > 0 && (
        <>
          <div className="bench__head">
            <span className="eyebrow" title="투입 순간의 스코어(리드·동점·열세)가 교체 아웃 또는 경기 종료 때 어떻게 바뀌었나">투입 후</span>
          </div>
          <div className="bench__sum">
            <span className="bench__pill" data-d="1" title="열세→동점·리드, 동점→리드"><i>▲ 개선</i><b className="num">{tally[1]}</b></span>
            <span className="bench__pill" data-d="0" title="들어갈 때와 같은 상황으로 끝남"><i>= 유지</i><b className="num">{tally[0]}</b></span>
            <span className="bench__pill" data-d="-1" title="리드→동점·열세, 동점→열세"><i>▼ 악화</i><b className="num">{tally[-1]}</b></span>
          </div>
          {/* 3×3 — 세로 = 들어갈 때, 가로 = 나올 때. 경기 수가 늘어도 크기가 같다.
              대각선 = 유지, 왼쪽 아래 = 개선(초록), 오른쪽 위 = 악화(빨강) */}
          <div className="bench__mx" role="table" aria-label="투입 시 상황별 종료 시 상황">
            <span className="bench__cap" role="cell" title="종료 시 = 다시 교체돼 나간 시점, 끝까지 뛰었으면 경기 종료">투입 시 ↓ · 종료 시 →</span>
            {ORDER.map((to) => (
              <span key={to} className="bench__h" data-s={to} role="columnheader">{STATE_KO[to]}</span>
            ))}
            {ORDER.map((from) => (
              <Fragment key={from}>
                <span className="bench__r" data-s={from} role="rowheader">{STATE_KO[from]}에서</span>
                {ORDER.map((to) => {
                  const n = grid[from][to];
                  const d = stateDelta(from, to);
                  return (
                    <span
                      key={to}
                      className="bench__c num"
                      role="cell"
                      data-d={d}
                      data-zero={n === 0 || undefined}
                      title={`${STATE_KO[from]}에서 투입 → 종료 시 ${STATE_KO[to]} · ${n}회`}
                    >
                      {n || '·'}
                    </span>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * 그 경기에서 선 자리 — 선발이면 "LAM", 교체면 자리 없이 "←이름"(누구 대신).
 * 교체 선수가 나간 선수의 자리를 그대로 맡는다는 보장이 없어 자리는 적지 않는다
 * (비니시우스가 아놀드와 바뀌었다고 RB 가 되지는 않는다).
 */
export function PosTag({ g }: { g: RecentGame }) {
  const forLast = g.forName?.split(' ').slice(-1)[0];
  if (!g.started) {
    if (!forLast) return <span className="ptag" data-none="true" aria-hidden="true">—</span>;
    return (
      <span className="ptag" data-sub="true" title={`${g.subIn !== undefined ? `${g.subIn}분 ` : ''}교체 · ${g.forName} 대신`}>
        <i>←{forLast}</i>
      </span>
    );
  }
  if (!g.pos) return <span className="ptag" data-none="true" aria-hidden="true">—</span>;
  return (
    <span className="ptag" title={`선발 · ${g.pos}`}>
      <b>{g.pos}</b>
    </span>
  );
}

/** 경기 한 줄 — 결과·대회·날짜·상대·스코어·출전 방식·골/도움/카드 */
export function GameRow({ g }: { g: RecentGame }) {
  const palette = usePalette();
  return (
    <div className="pcard__g">
      <i className="fchip" data-r={g.result}>{g.result}</i>
      <span className="pcard__gc">
        <CompCrest k={g.competition} size={13} />
        {palette.name(g.competition)}
      </span>
      <span className="pcard__when num">{kstShortDate(g.kickoffUtc)}</span>

      <span className="pcard__opp">
        {/* 상대 표기는 항상 "vs" 로 통일하고 홈/원정은 배지로 —
            일정 탭의 최근 경기 폼과 같은 규칙이다. */}
        <i className="hachip" data-side={g.homeAway === '홈' ? 'H' : 'A'}>
          {g.homeAway === '홈' ? 'H' : 'A'}
        </i>
        vs
        <Crest
          team={{
            id: g.opponentId,
            name: g.opponentName,
            shortName: g.opponentName,
            abbr: g.opponent,
            logo: g.opponentLogo ?? '',
          }}
          size={16}
        />
        <b>{g.opponentName}</b>
      </span>
      <span className="pcard__sc num">{g.scoreline}</span>

      <span className="pcard__ga num">
        <PosTag g={g} />
        {/* 선발이면 "선발 90'", 교체면 "교체 60'(30)" —
            몇 분에 들어가 몇 분을 뛰었는지가 한눈에 보인다. */}
        {g.started
          ? `선발 · ${g.minutes}'`
          : g.subIn !== undefined
            ? `교체 ${g.subIn}'(${g.minutes})`
            : `교체 · ${g.minutes}'`}
      </span>
      <span className="pcard__gb">
        {g.goals > 0 && <em className="pcard__gg">{g.goals}G</em>}
        {g.assists > 0 && <em className="pcard__aa">{g.assists}A</em>}
        {/* 카드 없음 "–" 은 평점이 없을 때만 — 평점 옆에 붙으면 빼기 기호처럼 읽힌다 */}
        {(g.yellow > 0 || g.red > 0 || g.rating == null) && <Cards yellow={g.yellow} red={g.red} />}
        <RatingBadge v={g.rating} cls="rtg--sm" title="FotMob 경기 평점" />
      </span>
    </div>
  );
}
