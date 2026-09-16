import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PlayerSeason } from '../lib/squad';
import { usePalette } from '../lib/palette';
import { Headshot } from './Headshot';
import { kstShortDate } from '../lib/kst';

const POS_LABEL: Record<string, string> = { G: 'GK', D: 'DF', M: 'MF', F: 'FW' };
const FILTERS: { id: string; label: string }[] = [
  { id: 'ALL', label: '전체' },
  { id: 'G', label: 'GK' },
  { id: 'D', label: 'DF' },
  { id: 'M', label: 'MF' },
  { id: 'F', label: 'FW' },
];

interface Props {
  players: PlayerSeason[];
  activeId: string | null;
  onHover: (id: string | null) => void;
}

export function PlayerTable({ players, activeId, onHover }: Props) {
  const [filter, setFilter] = useState('ALL');
  const rows = useMemo(
    () => (filter === 'ALL' ? players : players.filter((p) => p.pos === filter)),
    [players, filter],
  );

  /* 골·도움 게이지의 기준은 스쿼드 최고 기록이다. 절대값이 아니라
     팀 안에서의 비중으로 읽혀야 한 줄만 봐도 누가 해결사인지 보인다. */
  const maxG = Math.max(1, ...players.map((p) => p.goals));
  const maxA = Math.max(1, ...players.map((p) => p.assists));

  /* 호버 카드는 스크롤 영역 밖(fixed)에 그린다.
     리스트에 overflow 를 걸면 카드가 잘리기 때문이다. */
  const [card, setCard] = useState<{ p: PlayerSeason; top: number; left: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());

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
    <div className="pt">
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
        <span className="num">출전</span>
        <span className="num">선발</span>
        <span className="num">분</span>
        <span>골 / 도움</span>
        <span className="num">G</span>
        <span className="num">A</span>
        <span className="num">P</span>
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
          </div>
        ))}
        {rows.length === 0 && <p className="nogoal" style={{ padding: 16 }}>해당 포지션 기록이 없습니다.</p>}
      </div>

      {card && <PlayerCard p={card.p} top={card.top} left={card.left} />}
    </div>
  );
}

/** 호버 카드 — 시즌 스탯 + 최근 3경기. 리스트 스크롤 밖에 fixed 로 뜬다. */
function PlayerCard({ p, top, left }: { p: PlayerSeason; top: number; left: number }) {
  const palette = usePalette();
  const recent = p.recent.slice(0, 3);
  const ref = useRef<HTMLDivElement>(null);
  const [y, setY] = useState(top);

  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 0;
    const half = h / 2;
    setY(Math.max(12 + half, Math.min(window.innerHeight - 12 - half, top)));
  }, [top, p.id]);

  return (
    <div
      className="pcard"
      role="tooltip"
      ref={ref}
      style={{ top: y, left, transform: 'translate(-100%, -50%)' }}
    >
      <div className="pcard__top">
        <Headshot id={p.id} src={p.photo} jersey={p.jersey} size={40} className="pcard__hs" />
        <div>
          <b>{p.name}</b>
          <span><em className="pcard__pos" data-pos={p.pos}>{POS_LABEL[p.pos]}</em> · 시즌 {p.apps}경기</span>
        </div>
      </div>

      <div className="pcard__stats">
        {([
          ['출전', p.apps, false],
          ['선발', p.starts, false],
          ['득점', p.goals, true],
          ['도움', p.assists, true],
        ] as const).map(([k, v, glow]) => (
          <div key={k} data-glow={glow && v > 0}>
            <b className="num">{v}</b>
            <span>{k}</span>
          </div>
        ))}
      </div>

      <div className="pcard__hero">
        <div className="pcard__mins num">
          <b>{p.minutes}</b>
          <span>출전 시간(분)</span>
        </div>
        <div className="pcard__ap num" data-on={p.points > 0}>
          <b>{p.points}</b>
          <span>공격 포인트</span>
        </div>
      </div>

      {p.byComp.length > 0 && (
        <div className="pcard__comps">
          <span className="eyebrow">대회별</span>
          {p.byComp.map((c) => (
            <div className="pcard__comp" key={c.competition}>
              <i style={{ background: palette.color(c.competition) }} />
              <span className="pcard__cn">{palette.name(c.competition)}</span>
              <span className="pcard__ca num">{c.apps}경기</span>
              <span className="pcard__cg num">
                <b>{c.goals}</b>G <b>{c.assists}</b>A
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="pcard__recent">
        <span className="eyebrow">최근 {recent.length}경기</span>
        {recent.map((g) => (
          <div className="pcard__g" key={g.matchId}>
            <i className="fchip" data-r={g.result}>{g.result}</i>
            <span className="pcard__opp">
              {g.homeAway === '홈' ? 'vs' : '@'} {g.opponent}
            </span>
            <span className="pcard__sc num">{g.scoreline}</span>
            <span className="pcard__when num">{kstShortDate(g.kickoffUtc)}</span>
            <span className="pcard__ga num">
              {g.started ? '선발' : '교체'} {g.minutes}'
              {g.goals > 0 && <em className="pcard__gg">{g.goals}G</em>}
              {g.assists > 0 && <em className="pcard__aa">{g.assists}A</em>}
            </span>
            <i className="pcard__c" style={{ background: palette.color(g.competition) }} />
          </div>
        ))}
      </div>
    </div>
  );
}
