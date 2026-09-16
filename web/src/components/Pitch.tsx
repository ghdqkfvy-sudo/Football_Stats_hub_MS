import { lineKind, lineLabels, LINE_COLOR, type PlayerSeason, type Slot } from '../lib/squad';
import { Headshot } from './Headshot';
import { PitchMarkings } from './PitchMarkings';

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
}

/** 세로 축구장 — 아래가 골키퍼, 위가 공격 */
export function Pitch({
  slots, formation, verified, covered, chem, activeId, onHover, selectedId, onSelect, tally,
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

      <div className="pitch__chem">
        <span>팀 조직력</span>
        <i>
          <u style={{ width: `${chem}%` }} />
        </i>
        <b className="num">{chem}</b>
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
  p, tag, color, active, selected, onHover, onSelect,
}: {
  p: PlayerSeason | null;
  tag: string;
  color: string;
  active: boolean;
  selected: boolean;
  onHover: (id: string | null) => void;
  onSelect?: (id: string | null) => void;
}) {
  if (!p) return <div className="chipbox" aria-hidden="true" />;

  const last = p.name.split(' ').slice(-1)[0];
  return (
    <div
      className="chipbox"
      data-active={active}
      data-selected={selected}
      style={{ ['--pc' as string]: color }}
      onMouseEnter={() => onHover(p.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(p.id)}
      onBlur={() => onHover(null)}
      // 클릭하면 선택이 고정된다 — 오른쪽 선수 목록도 그 선수로 따라간다
      onClick={() => onSelect?.(selected ? null : p.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect?.(selected ? null : p.id);
        }
      }}
      role="button"
      aria-pressed={selected}
      tabIndex={0}
      title={`${p.name} · ${p.apps}경기 ${p.goals}골 ${p.assists}도움`}
    >
      {tag && <span className="chipbox__tag">{tag}</span>}
      <span className="chipbox__ring">
        <Headshot id={p.id} src={p.photo} jersey={p.jersey} size={44} className="chipbox__hs" />
        {p.jersey !== undefined && <span className="chipbox__no num">{p.jersey}</span>}
      </span>
      <span className="chipbox__name">{last}</span>
      <span className="chipbox__stat num">
        출전 {p.apps}
        <em className="s">선발 {p.starts}</em>
        {p.goals > 0 && <em className="g">⚽{p.goals}</em>}
        {p.assists > 0 && <em className="a">A{p.assists}</em>}
      </span>
    </div>
  );
}
