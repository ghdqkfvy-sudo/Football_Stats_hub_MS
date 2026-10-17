import type { PlayerSeason } from '../lib/squad';
import { Headshot } from './Headshot';
import { CardShape } from './InjuryMark';
import { SusWhat } from './DisciplineLines';
import { susNote } from '../lib/discipline';

const POS_LABEL: Record<string, string> = { G: 'GK', D: 'DF', M: 'MF', F: 'FW' };

/**
 * 출전 정지 명단 — 부상자 명단 위. **다음 경기만이 아니라 모든 대회의 정지를 전부**
 * 대회 이름과 함께 보여 준다(포메이션 · 목록의 레드카드는 바로 다음 경기 정지만).
 * 한 선수가 두 대회에서 걸리면 줄이 둘이다. 가까운 경기 순.
 */
export function SuspensionList({ players, onOpen }: { players: PlayerSeason[]; onOpen: (p: PlayerSeason) => void }) {
  const rows = players
    .flatMap((p) => (p.disc?.all ?? []).map((s) => ({ p, s })))
    .sort((a, b) => (a.s.match?.kickoffUtc ?? '').localeCompare(b.s.match?.kickoffUtc ?? ''));
  if (!rows.length) return null;
  const people = new Set(rows.map((r) => r.p.id)).size;
  return (
    <section className="injl injl--sus">
      <div className="sec__head">
        <h2 className="sec__title">출전 정지</h2>
        <span className="sec__note num">{people}명 · 대회별 · FotMob · 카드 기록 기준</span>
      </div>
      <ol className="injl__list">
        {rows.map(({ p, s }) => (
          <li
            key={`${p.id}-${s.competition}`}
            className="injl__row"
            data-open
            role="button"
            tabIndex={0}
            onClick={() => onOpen(p)}
            onKeyDown={(e) => { if (e.key === 'Enter') onOpen(p); }}
          >
            <span className="injl__hs">
              <Headshot id={p.id} src={p.photo} kind={p.photoKind} sofa={p.sofascoreId} label={String(p.jersey)} size={34} />
              <i className="injl__card" aria-hidden="true"><CardShape color="red" w={10} /></i>
            </span>
            <span className="injl__who">
              <b>{p.name}</b>
              <span>
                <em className="pcard__pos" data-pos={p.pos}>{POS_LABEL[p.pos]}</em>
                <span className="num">#{p.jersey}</span>
              </span>
            </span>
            <span className="injl__ret injl__ret--sus">
              <b><SusWhat s={s} /></b>
              <small>{susNote(s)}</small>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
