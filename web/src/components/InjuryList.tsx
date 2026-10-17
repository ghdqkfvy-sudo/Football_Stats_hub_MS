import type { InjuryEntry } from '../types/feedTypes';
import type { PlayerSeason } from '../lib/squad';
import { Headshot } from './Headshot';
import { InjuryGlyph } from './InjuryMark';
import { fotmobImage, seasonFromInjury } from '../lib/injury';

const POS_LABEL: Record<string, string> = { G: 'GK', D: 'DF', M: 'MF', F: 'FW' };

/**
 * 부상자 명단 — 팀의 부상 선수 전부(FotMob).
 *
 * 선수 목록 · 베스트 11 은 경기에 나온 선수로 만들어서, 시즌 내내 빠진 장기 부상자
 * (사비 시몬스 · 쿨루셉스키 …)는 거기에 없다. 이 명단이 그들까지 보여 준다.
 * 순서: 출전 불투명 → 단기 → 장기. 누르면 상세 — 우리 목록에 없는 선수는 기록 0 · 부상 정보만.
 */
export function InjuryList({ list, players, onOpen }: {
  list: InjuryEntry[];
  players: PlayerSeason[];
  onOpen: (p: PlayerSeason) => void;
}) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const n = { doubt: list.filter((x) => x.doubtful).length, long: list.filter((x) => x.long).length };
  return (
    <section className="injl">
      <div className="sec__head">
        <h2 className="sec__title">부상자 명단</h2>
        <span className="sec__note num">
          {list.length}명{n.long ? ` · 장기 ${n.long}` : ''}{n.doubt ? ` · 출전 불투명 ${n.doubt}` : ''} · FotMob 기준
        </span>
      </div>
      <ol className="injl__list">
        {list.map((x) => {
          const p = x.espnId ? byId.get(x.espnId) : undefined;
          /* 우리 목록에 없는 선수(시즌 내내 결장)도 상세를 연다 — 기록 0 · 부상 정보만 */
          const open = () => onOpen(p ?? seasonFromInjury(x));
          const jersey = p?.jersey ?? x.jersey ?? undefined;
          const pos = p?.pos ?? x.pos ?? undefined;
          return (
            <li
              key={`${x.fm ?? x.name}`}
              className="injl__row"
              data-doubt={x.doubtful || undefined}
              data-long={x.long || undefined}
              data-open
              role="button"
              tabIndex={0}
              onClick={open}
              onKeyDown={(e) => { if (e.key === 'Enter') open(); }}
            >
              <span className="injl__hs">
                <Headshot
                  id={p?.id ?? `fm-${x.fm ?? x.name}`}
                  src={p?.photo ?? (x.fm ? fotmobImage(x.fm) : undefined)}
                  kind={p?.photoKind ?? 'espn'}
                  sofa={p?.sofascoreId}
                  label={jersey !== undefined ? String(jersey) : x.name.slice(0, 1)}
                  size={34}
                />
                <i className="injb" data-doubt={x.doubtful || undefined} aria-hidden="true"><InjuryGlyph inj={x} size={9} /></i>
              </span>
              <span className="injl__who">
                <b>{p?.name ?? x.name}</b>
                <span>
                  {pos && <em className="pcard__pos" data-pos={pos}>{POS_LABEL[pos]}</em>}
                  {jersey !== undefined && <span className="num">#{jersey}</span>}
                </span>
              </span>
              <span className="injl__ret">
                <span className="injl__retl">
                  <b>{x.doubtful ? '출전 불투명' : x.ko}</b>
                  {x.long && <em className="pinj__long">장기</em>}
                </span>
                {x.injName && <small className="injl__what">{x.injName}</small>}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
