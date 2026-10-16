import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PlayerSeason } from '../lib/squad';
import { Headshot } from './Headshot';
import { Swap } from './Swap';
import { Cards, GameRow, PlayerSummary } from './PlayerCardParts';

const POS_LABEL: Record<string, string> = { G: 'GK', D: 'DF', M: 'MF', F: 'FW' };

/** 실제 마우스가 있는 기기인지 — 터치 기기는 "호버" 개념이 없다 (Calendar 와 같은 판정) */
const HAS_HOVER =
  typeof window !== 'undefined' && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;
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
  /** 카드의 ✕ */
  onClose?: () => void;
  /** 선수 상세(시즌 전 경기) 열기 — 포메이션에서 눌러도 같은 창이 뜨도록 PlayersTab 이 가진다 */
  onOpen: (p: PlayerSeason) => void;
}

export function PlayerTable({ players, activeId, onHover, onClose, onOpen }: Props) {
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

  /*
   * 목록 아래에 가려진 선수 수. 목록은 고정 높이라 마지막 행이 반쯤 잘린 것
   * 말고는 "아래에 더 있다" 는 신호가 없었다 — 아래 끝을 흐리고 남은 수를 적는다.
   * 행의 절반 이상이 목록 아래로 나가 있으면 "가려진" 것으로 센다.
   */
  const [below, setBelow] = useState(0);
  const syncBelow = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const bottom = list.getBoundingClientRect().bottom;
    let n = 0;
    for (const el of rowRefs.current.values()) {
      const r = el.getBoundingClientRect();
      if (r.top + r.height / 2 > bottom) n++;
    }
    setBelow(n);
  }, []);
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    syncBelow();
    const ro = new ResizeObserver(syncBelow);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rows, syncBelow]);
  const scrollMore = () => {
    const list = listRef.current;
    if (list) list.scrollBy({ top: list.clientHeight * 0.8, behavior: 'smooth' });
  };

  /** 카드를 그 줄 옆에 놓는다 (호버 상태는 건드리지 않는다) */
  /*
   * 카드 자리.
   *  · 목록의 줄에서 연 카드 → 목록 **왼쪽**(그 줄 옆). 보고 있는 줄을 가리지 않는다.
   *  · 포메이션에서 연 카드 → 목록 **위, 오른쪽 끝에 붙여**. 왼쪽에 두면 카드가
   *    포메이션을 덮어서, 방금 누른 선수와 주변 자리가 가려졌다.
   * ⚠️ 경기장과 목록이 나란한 넓은 화면에서만 갈라 쓴다 — 좁은 화면은 CSS 가 카드를
   *    따로 놓는다(styles/players.css · mobile.css).
   */
  const fromRow = useRef<string | null>(null);
  const placeCard = (p: PlayerSeason, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const lr = listRef.current?.getBoundingClientRect();
    const overList = fromRow.current !== p.id && !!lr && lr.left > window.innerWidth * 0.3;
    setCard({ p, top: r.top + r.height / 2, left: overList ? lr!.right - 12 : (lr?.left ?? r.left) - 12 });
  };

  const openCard = (p: PlayerSeason, el: HTMLElement) => {
    fromRow.current = p.id;
    placeCard(p, el);
    onHover(p.id);
  };
  const closeCard = () => {
    fromRow.current = null;
    setCard(null);
    onHover(null);
  };
  /* 선수 상세(시즌 전 경기) — 행을 누르거나 Enter */
  const openDetail = (p: PlayerSeason) => {
    setCard(null);
    onOpen(p);
  };

  const dismissCard = () => {
    closeCard();
    onClose?.();
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
    if (fromRow.current !== activeId) fromRow.current = null;   // 포메이션에서 고른 선수
    if (!p || !el) return;
    /* 목록 **안에서만** 그 줄이 보이게 스크롤한다. scrollIntoView 는 페이지까지
       끌어내려서, 폰에서 포메이션 칩을 누르면 화면이 목록으로 훅 내려갔다
       (카드는 화면 아래 고정이라 페이지를 움직일 이유가 없다). */
    const list = listRef.current;
    if (list) {
      const top = el.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
      if (top < list.scrollTop) list.scrollTop = top;
      else if (top + el.offsetHeight > list.scrollTop + list.clientHeight) {
        list.scrollTop = top + el.offsetHeight - list.clientHeight;
      }
    }
    // 스크롤이 끝난 뒤의 좌표로 카드를 놓는다
    const id = requestAnimationFrame(() => placeCard(p, el));
    return () => cancelAnimationFrame(id);
  }, [activeId, rows]);

  return (
    <>
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

      <div className="pt__list" ref={listRef} onScroll={syncBelow} data-more={below > 0 || undefined}>
        {/* 포지션 필터를 바꾸면 목록이 한 번 페이드로 바뀐다 (정렬만 바꿀 때는 그대로) */}
        <Swap k={filter}>
        {rows.map((p) => (
          <div
            className="pt__row"
            key={p.id}
            ref={(el) => {
              if (el) rowRefs.current.set(p.id, el);
              else rowRefs.current.delete(p.id);
            }}
            data-active={p.id === activeId}
            /* 호버 카드는 마우스가 있는 기기에서만. 폰은 탭 한 번에 진입·초점·클릭
               신호가 한꺼번에 와서 카드와 상세 시트가 같이 떴다 — 폰은 시트만. */
            {...(HAS_HOVER ? {
              onMouseEnter: (e: React.MouseEvent<HTMLDivElement>) => openCard(p, e.currentTarget),
              onMouseLeave: closeCard,
              onFocus: (e: React.FocusEvent<HTMLDivElement>) => openCard(p, e.currentTarget),
              onBlur: closeCard,
            } : {})}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Escape') closeCard();
              else if (e.key === 'Enter') openDetail(p);
            }}
            onClick={() => openDetail(p)}
            title="눌러서 시즌 전 경기 기록 보기"
          >
            <span className="pt__who">
              <Headshot id={p.id} src={p.photo} kind={p.photoKind} jersey={p.jersey} size={30} />
              {/* 폰에서는 "João Pe…" 처럼 거의 모두 잘렸다 — 포메이션 그림과 같은
                  성(마지막 단어)만. 전체 이름은 눌러서 여는 상세에 있다. */}
              <b title={p.name}>
                <span className="m-full">{p.name}</span>
                <span className="m-short">{p.name.split(' ').slice(-1)[0]}</span>
              </b>
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
        </Swap>
      </div>
      {below > 0 && (
        <button className="pt__more" onClick={scrollMore} aria-label={`아래로 ${below}명 더 보기`}>
          <span className="num">{below}</span>명 더 <i aria-hidden="true">↓</i>
        </button>
      )}
    </div>

    {/*
      * ⚠️ 카드는 .pt **바깥**에 그린다. .pt 에는 backdrop-filter 가 있어서, 안에 두면
      * position:fixed 의 기준이 화면이 아니라 .pt 상자가 된다. 폰에서는 카드가
      * "화면 아래" 가 아니라 "선수 목록 아래" 에 붙어 화면 밖(아래)에 떠 있었다 —
      * 포메이션 칩을 눌러도 카드가 안 보이던 원인. 목록을 끝까지 내려야만 보였다.
      */}
    {card && <PlayerCard p={card.p} top={card.top} left={card.left} onClose={dismissCard} />}
    </>
  );
}

/** 경고·퇴장 — 없으면 줄표 하나로 조용히 둔다 */

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
        <PlayerSummary p={p} />
      </div>

      {recent.length > 0 && (
        <div className="pcard__side">
          <div className="pcard__sideh">
            <b>최근 {recent.length}경기</b>
            <span>{p.name.split(' ').slice(-1)[0]}</span>
          </div>
          {recent.map((g) => <GameRow key={g.matchId} g={g} />)}
        </div>
      )}
    </div>
  );
}
