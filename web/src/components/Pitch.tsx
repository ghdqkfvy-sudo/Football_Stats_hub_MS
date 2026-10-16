import { lineKind, lineLabels, LINE_COLOR, type PlayerSeason, type Slot } from '../lib/squad';
import { Headshot } from './Headshot';
import { PitchMarkings } from './PitchMarkings';
import { HAS_HOVER } from '../lib/useMedia';
import { KorFlag } from './KorFlag';

interface Props {
  slots: Slot[];
  formation: string;
  verified: boolean;
  /** 라인업이 확보된 경기 수 — 헤더의 n/n경기 와 화학력 계산에 쓴다 */
  covered: number;
  chem: number;
  activeId: string | null;
  onHover: (id: string | null) => void;
  /** 포메이션별 채택 경기 수 — 왜 이 포메이션인지 근거로 보여 준다 */
  tally?: { shape: string; n: number }[];
  /** 클릭으로 고정 선택된 선수 — 마우스를 치워도 하이라이트가 남는다 */
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  /** 코리안리거(id → 한국어 이름) — 칩에 태극기를 달고 한국어 이름으로 (소속팀 화면) */
  marks?: ReadonlyMap<string, string>;
}

/** 세로 축구장 — 아래가 골키퍼, 위가 공격 */
export function Pitch({
  slots, formation, verified, covered, chem, activeId, onHover, selectedId, onSelect, tally, marks,
}: Props) {
  const picked = tally?.find((x) => x.shape === formation)?.n;
  const total = tally?.reduce((a, x) => a + x.n, 0) ?? 0;
  const rowCount = Math.max(...slots.map((s) => s.row)) + 1;

  return (
    <div className="pitch">
      <div className="pitch__head">
        <span className="pitch__t">
          베스트 <b>11</b>
        </span>
        <b
          className="pitch__f num"
          title={tally?.length ? `채택 내역 — ${tally.map((x) => `${x.shape} ${x.n}경기`).join(' · ')}` : undefined}
        >
          {formation}
        </b>
        <span className="pitch__note num">
          {picked !== undefined ? `${picked}/${total}경기 채택` : `${covered}경기`}
        </span>
      </div>

      <div className="pitch__chem" tabIndex={0} aria-label={`팀 조직력 ${chem} — 설명 보기`}>
        {/* ⓘ — 설명 말풍선(chem__tip)이 있다는 표시. 마우스를 올리거나 초점을 주면 뜬다 */}
        <span>팀 조직력 <em className="pitch__info" aria-hidden="true">i</em></span>
        <i>
          <u style={{ width: `${chem}%` }} />
        </i>
        <b className="num">{chem}</b>

        <div className="chem__tip" role="tooltip">
          <b>같은 11명이 얼마나 꾸준히 함께 선발됐는지</b>를 0~100 으로 나타낸 값입니다.
          <code>평균( 각 선수의 선발 횟수 ÷ 라인업 확보 경기 수 ) × 100</code>
          베스트 11 열한 명 각각이 전체 경기 중 몇 번이나 선발로 나섰는지를
          평균 낸 것이라, 주전이 고정된 팀일수록 100 에 가까워지고 로테이션이
          잦으면 낮아집니다. (기준 경기 수 {covered}경기)
        </div>
      </div>

      <div className="pitch__field">
        <PitchMarkings />

        {Array.from({ length: rowCount }, (_, r) => rowCount - 1 - r).map((r) => {
          const row = slots.filter((s) => s.row === r);
          const kind = lineKind(r, rowCount);
          const labels = lineLabels(kind, row.length);
          return (
            <div className="pitch__row" key={r}>
              {row.map((s, i) => (
                <PlayerChip
                  key={`${r}-${i}`}
                  p={s.player}
                  tag={labels[i] ?? ''}
                  color={LINE_COLOR[kind]}
                  active={!!s.player && s.player.id === activeId}
                  selected={!!s.player && s.player.id === selectedId}
                  onHover={onHover}
                  onSelect={onSelect}
                  ko={s.player ? marks?.get(s.player.id) : undefined}
                />
              ))}
            </div>
          );
        })}
      </div>

      {!verified && <div className="pitch__warn">포지션 그룹 기준 배치 (라인업 기록 부족)</div>}
    </div>
  );
}

function PlayerChip({
  p, tag, color, active, selected, onHover, onSelect, ko,
}: {
  p: PlayerSeason | null;
  tag: string;
  color: string;
  active: boolean;
  selected: boolean;
  onHover: (id: string | null) => void;
  onSelect?: (id: string | null) => void;
  /** 코리안리거면 한국어 이름 */
  ko?: string;
}) {
  if (!p) return <div className="chipbox" aria-hidden="true" />;

  const last = ko ?? p.name.split(' ').slice(-1)[0];
  return (
    <div
      className={`chipbox${ko ? ' chipbox--kor' : ''}`}
      data-active={active}
      data-selected={selected}
      style={{ ['--pc' as string]: color }}
      /* ⚠️ 터치에서는 호버를 달지 않는다 — 탭 한 번에 가짜 mouseenter 와 click 이
         같이 온다. 터치는 탭 = 선수 상세 열기 하나뿐이다. */
      {...(HAS_HOVER
        ? {
          onMouseEnter: () => onHover(p.id),
          onMouseLeave: () => onHover(null),
          onFocus: () => onHover(p.id),
          onBlur: () => onHover(null),
        }
        : {})}
      // 누르면 선수 목록에서 누른 것과 같은 선수 상세 창이 뜬다(PlayersTab)
      onClick={() => onSelect?.(p.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect?.(p.id);
        }
      }}
      role="button"
      aria-haspopup="dialog"
      tabIndex={0}
      title={`${p.name} · ${p.apps}경기(선발 ${p.starts}) ${p.goals}골 ${p.assists}도움`}
    >
      {tag && <span className="chipbox__tag">{tag}</span>}
      <span className="chipbox__ring">
        {/* 등번호는 칩 자체 배지(chipbox__no)로만 그린다 —
            Headshot 에도 배지를 맡기면 같은 숫자가 두 번 찍힌다. */}
        <Headshot
          id={p.id}
          src={p.photo}
          kind={p.photoKind}
          sofa={p.sofascoreId}
          label={String(p.jersey)}
          size={44}
          className="chipbox__hs"
        />
        {p.jersey !== undefined && <span className="chipbox__no num">{p.jersey}</span>}
        {ko && <KorFlag className="chipbox__flag" />}
      </span>
      <span className="chipbox__name">{last}</span>
      {/*
        칩의 기록은 **한 줄을 넘지 않는다.**
        예전에는 "출전 6 선발 5 ⚽4 A1" 을 다 넣어서 줄이 갈라졌고, 그 줄바꿈
        때문에 칩 높이가 제각각이라 배치가 어수선했다. 선발 수는 오른쪽
        선수 목록과 호버 카드에 이미 있으므로 칩에서는 뺀다.
        칩에 남기는 건 "몇 경기 뛰었고, 얼마나 해결했나" 두 가지뿐이다.
      */}
      <span className="chipbox__stat num">
        <em className="p">{p.apps}<small>경기</small></em>
        {p.goals > 0 && <em className="g">⚽{p.goals}</em>}
        {p.assists > 0 && <em className="a">A{p.assists}</em>}
      </span>
    </div>
  );
}
