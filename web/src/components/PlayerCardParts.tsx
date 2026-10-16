import type { PlayerSeason, RecentGame } from '../lib/squad';
import { usePalette } from '../lib/palette';
import { kstShortDate } from '../lib/kst';
import { Headshot } from './Headshot';
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
      <Headshot id={p.id} src={p.photo} kind={p.photoKind} jersey={p.jersey} size={46} className="pcard__hs" />
      <div>
        <b>{p.name}</b>
        <span>
          <em className="pcard__pos" data-pos={p.pos}>{POS_LABEL[p.pos]}</em>
          {` #${p.jersey}`}
          {p.age ? ` · ${p.age}세` : ''}
        </span>
      </div>
    </div>

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
            <span className="pcard__ca num">{c.apps}경기<i>선발 {c.starts}</i></span>
            <span className="pcard__cg num">
              <b>{c.goals}</b>G <b>{c.assists}</b>A
            </span>
          </div>
        ))}
      </div>
    )}
    </>
  );
}

/**
 * 그 경기에서 선 자리 — "LAM", 교체면 "RAM ←무뇨즈".
 * 교체 선수의 자리는 경기 요약의 교체 기록(누구 대신)으로 정한다. 기록이 없으면
 * 자리를 지어내지 않고 비워 둔다.
 */
export function PosTag({ g }: { g: RecentGame }) {
  if (!g.pos) return <span className="ptag" data-none="true" aria-hidden="true">—</span>;
  const forLast = g.forName?.split(' ').slice(-1)[0];
  return (
    <span
      className="ptag"
      data-sub={!g.started || undefined}
      title={g.started ? `선발 · ${g.pos}` : `${g.subIn ?? ''}${g.subIn !== undefined ? '분 ' : ''}교체 · ${g.pos}${g.forName ? ` (${g.forName} 대신)` : ''}`}
    >
      <b>{g.pos}</b>
      {forLast && <i>←{forLast}</i>}
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
        <Cards yellow={g.yellow} red={g.red} />
      </span>
    </div>
  );
}
