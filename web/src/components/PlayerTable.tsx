import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PlayerSeason } from '../lib/squad';
import { usePalette } from '../lib/palette';
import { Headshot } from './Headshot';
import { Crest } from './Crest';
import { CompCrest } from './CompCrest';
import { kstShortDate } from '../lib/kst';

const POS_LABEL: Record<string, string> = { G: 'GK', D: 'DF', M: 'MF', F: 'FW' };
const FILTERS: { id: string; label: string }[] = [
  { id: 'ALL', label: '전체' },
  { id: 'G', label: 'GK' },
  { id: 'D', label: 'DF' },
  { id: 'M', label: 'MF' },
  { id: 'F', label: 'FW' },
];

/** 정렬 가능한 열 — 머리글을 누르면 그 값 기준 내림차순부터 시작한다 */
type SortKey = 'apps' | 'starts' | 'minutes' | 'goals' | 'assists' | 'points';
const NUM_OF: Record<SortKey, (p: PlayerSeason) => number> = {
  apps: (p) => p.apps,
  starts: (p) => p.starts,
  minutes: (p) => p.minutes,
  goals: (p) => p.goals,
  assists: (p) => p.assists,
  points: (p) => p.points,
};

interface Props {
  players: PlayerSeason[];
  activeId: string | null;
  onHover: (id: string | null) => void;
}

export function PlayerTable({ players, activeId, onHover }: Props) {
  const [filter, setFilter] = useState('ALL');

  /* 정렬을 걸지 않았을 때의 기본 순서는 "베스트 11 먼저, 그다음 기여도 순"
     이다(PlayersTab 에서 만들어 넘겨 준다). 머리글을 누르면 그 열 기준
     내림차순, 한 번 더 누르면 오름차순, 세 번째에 기본으로 돌아간다. */
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean } | null>(null);
  const clickSort = (key: SortKey) =>
    setSort((s) => (s?.key !== key ? { key, desc: true } : s.desc ? { key, desc: false } : null));

  const rows = useMemo(() => {
    const base = filter === 'ALL' ? players : players.filter((p) => p.pos === filter);
    if (!sort) return base;
    const val = NUM_OF[sort.key];
    // 같은 값이면 원래 순서를 지킨다(정렬이 목록을 흔들지 않게)
    return base
      .map((p, i) => ({ p, i }))
      .sort((a, b) => (sort.desc ? val(b.p) - val(a.p) : val(a.p) - val(b.p)) || a.i - b.i)
      .map((x) => x.p);
  }, [players, filter, sort]);

  /* 골·도움 게이지의 기준은 스쿼드 최고 기록이다. 절대값이 아니라
     팀 안에서의 비중으로 읽혀야 한 줄만 봐도 누가 해결사인지 보인다. */
  const maxG = Math.max(1, ...players.map((p) => p.goals));
  const maxA = Math.max(1, ...players.map((p) => p.assists));

  /* 호버 카드는 스크롤 영역 밖(fixed)에 그린다.
     리스트에 overflow 를 걸면 카드가 잘리기 때문이다. */
  const [card, setCard] = useState<{ p: PlayerSeason; top: number; left: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());

  /*
   * 머리글과 본문 열을 맞춘다.
   * 목록에만 스크롤바가 생기므로 본문의 폭이 그만큼 좁아지고, 결과적으로
   * 모든 숫자 열이 머리글보다 왼쪽으로 밀린다(실측 10px). 스크롤바 두께는
   * 브라우저·OS 마다 다르니 값을 적어 두지 않고 실제로 재서 머리글에
   * 같은 만큼 오른쪽 여백을 준다.
   */
  const wrapRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = listRef.current;
    const wrap = wrapRef.current;
    if (!el || !wrap) return;
    const sync = () => wrap.style.setProperty('--pt-gutter', `${el.offsetWidth - el.clientWidth}px`);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rows.length]);

  /** 카드를 그 줄 옆에 놓는다 (호버 상태는 건드리지 않는다) */
  const placeCard = (p: PlayerSeason, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const lr = listRef.current?.getBoundingClientRect();
    setCard({ p, top: r.top + r.height / 2, left: (lr?.left ?? r.left) - 12 });
  };

  const openCard = (p: PlayerSeason, el: HTMLElement) => {
    placeCard(p, el);
    onHover(p.id);
  };
  const closeCard = () => {
    setCard(null);
    onHover(null);
  };

  /*
   * 포메이션에서 선수를 고르면(또는 그 위에 마우스를 올리면) 목록도 같이
   * 반응해야 한다 — 그 줄로 스크롤하고 호버 카드를 그대로 띄운다.
   * 목록 자체의 호버로 이미 같은 선수가 열려 있으면 아무것도 하지 않는다.
   */
  useEffect(() => {
    if (!activeId) {
      setCard(null);
      return;
    }
    const p = rows.find((x) => x.id === activeId);
    const el = rowRefs.current.get(activeId);
    if (!p || !el) return;
    el.scrollIntoView({ block: 'nearest' });
    // 스크롤이 끝난 뒤의 좌표로 카드를 놓는다
    const id = requestAnimationFrame(() => placeCard(p, el));
    return () => cancelAnimationFrame(id);
  }, [activeId, rows]);

  return (
    <div className="pt" ref={wrapRef}>
      <div className="pt__bar">
        <div className="pt__filters">
          {FILTERS.map((f) => (
            <button key={f.id} aria-pressed={f.id === filter} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
        <span className="pt__count num">{rows.length}명</span>
      </div>

      <div className="pt__head">
        <span>선수</span>
        {([
          ['apps', '출전'], ['starts', '선발'], ['minutes', '분'],
        ] as const).map(([k, label]) => (
          <SortHead key={k} k={k} label={label} sort={sort} onClick={clickSort} />
        ))}
        <span>골 / 도움</span>
        {([
          ['goals', 'G'], ['assists', 'A'], ['points', 'P'],
        ] as const).map(([k, label]) => (
          <SortHead key={k} k={k} label={label} sort={sort} onClick={clickSort} />
        ))}
        <span className="num">카드</span>
      </div>

      <div className="pt__list" ref={listRef}>
        {rows.map((p) => (
          <div
            className="pt__row"
            key={p.id}
            ref={(el) => {
              if (el) rowRefs.current.set(p.id, el);
              else rowRefs.current.delete(p.id);
            }}
            data-active={p.id === activeId}
            onMouseEnter={(e) => openCard(p, e.currentTarget)}
            onMouseLeave={closeCard}
            tabIndex={0}
            onFocus={(e) => openCard(p, e.currentTarget)}
            onBlur={closeCard}
          >
            <span className="pt__who">
              <Headshot id={p.id} src={p.photo} jersey={p.jersey} size={30} />
              <b>{p.name}</b>
              <em data-pos={p.pos}>{POS_LABEL[p.pos]}</em>
            </span>
            <span className="num">{p.apps}</span>
            <span className="num">{p.starts}</span>
            <span className="num pt__min">{p.minutes}</span>
            <span className="pt__gauge" aria-hidden="true">
              <i className="g"><u style={{ width: `${(p.goals / maxG) * 100}%` }} /></i>
              <i className="a"><u style={{ width: `${(p.assists / maxA) * 100}%` }} /></i>
            </span>
            <span className="num pt__g" data-on={p.goals > 0}>{p.goals}</span>
            <span className="num pt__a" data-on={p.assists > 0}>{p.assists}</span>
            <span className="num pt__p" data-on={p.points > 0}>{p.points}</span>
            <span className="pt__cards"><Cards yellow={p.yellow} red={p.red} /></span>
          </div>
        ))}
        {rows.length === 0 && <p className="nogoal" style={{ padding: 16 }}>해당 포지션 기록이 없습니다.</p>}
      </div>

      {card && <PlayerCard p={card.p} top={card.top} left={card.left} onClose={closeCard} />}
    </div>
  );
}

/** 경고·퇴장 — 없으면 줄표 하나로 조용히 둔다 */
function Cards({ yellow, red, zero = false }: { yellow: number; red: number; zero?: boolean }) {
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

/** 정렬 머리글 — 지금 기준인 열에만 화살표가 뜬다 */
function SortHead({
  k, label, sort, onClick,
}: {
  k: SortKey;
  label: string;
  sort: { key: SortKey; desc: boolean } | null;
  onClick: (k: SortKey) => void;
}) {
  const on = sort?.key === k;
  return (
    <button
      type="button"
      className="num pt__sort"
      data-on={on}
      aria-sort={on ? (sort!.desc ? 'descending' : 'ascending') : 'none'}
      title={on && !sort!.desc ? '눌러서 기본 순서로' : '눌러서 내림차순'}
      onClick={() => onClick(k)}
    >
      {label}
      {on && <i aria-hidden="true">{sort!.desc ? '▼' : '▲'}</i>}
    </button>
  );
}

/**
 * 호버 카드 — 기본 스탯(왼쪽)과 최근 3경기(오른쪽)를 나란히 놓는다.
 * 한 장에 세로로 쌓으면 카드가 화면 높이를 넘겨 최근 경기가 잘렸다.
 * 리스트 스크롤 밖에 fixed 로 뜬다.
 */
function PlayerCard({
  p, top, left, onClose,
}: {
  p: PlayerSeason;
  top: number;
  left: number;
  onClose: () => void;
}) {
  const palette = usePalette();
  const recent = p.recent.slice(0, 3);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: left, y: top });

  /* 카드는 목록 왼쪽에 붙인다. 최근 경기 패널이 붙어 폭이 두 배가 되면서
     그대로 두면 화면 왼쪽 밖으로 나가 버린다 — 재서 화면 안으로 끌어온다. */
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const half = el.offsetHeight / 2;
    setPos({
      x: Math.max(12, Math.min(window.innerWidth - 12 - w, left - w)),
      y: Math.max(12 + half, Math.min(window.innerHeight - 12 - half, top)),
    });
  }, [top, left, p.id]);

  return (
    <div
      className="pcard"
      role="tooltip"
      ref={ref}
      style={{ top: pos.y, left: pos.x, transform: 'translateY(-50%)' }}
    >
      {/* 손가락으로는 마우스를 치울 수가 없다 — 닫기 단추를 준다 */}
      <button className="pcard__x" aria-label="닫기" onClick={onClose}>✕</button>
      <div className="pcard__main">
        <div className="pcard__top">
          <Headshot id={p.id} src={p.photo} jersey={p.jersey} size={46} className="pcard__hs" />
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
      </div>

      {recent.length > 0 && (
        <div className="pcard__side">
          <div className="pcard__sideh">
            <b>최근 {recent.length}경기</b>
            <span>{p.name.split(' ').slice(-1)[0]}</span>
          </div>
          {recent.map((g) => (
            <div className="pcard__g" key={g.matchId}>
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
          ))}
        </div>
      )}
    </div>
  );
}
