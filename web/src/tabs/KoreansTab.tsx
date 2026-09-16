import { useEffect, useMemo, useState } from 'react';
import { LEAGUE_ORDER, PINNED } from '../config/koreans';
import type { KoreanPlayer, KoreanStat } from '../types/feedTypes';
import { loadKoreans, type Source } from '../lib/api';
import { CREST } from '../config/targets';
import { usePalette } from '../lib/palette';
import { Headshot } from '../components/Headshot';
import { Crest } from '../components/Crest';
import { tintOf } from '../config/crestTint';

const POS_LABEL: Record<string, string> = { G: 'GK', D: 'DF', M: 'MF', F: 'FW' };

/** 리그 + 유럽대항전만 노출한다 (컵대회·친선은 뺀다) */
const SHOWN = new Set(['uefa.champions', 'uefa.europa', 'uefa.europa.conf']);
const visibleStats = (p: KoreanPlayer) =>
  p.stats.filter((s) => (s.competition === p.league || SHOWN.has(s.competition)) && s.apps > 0);

const sum = (rows: KoreanStat[], k: 'goals' | 'assists' | 'apps' | 'minutes') =>
  rows.reduce((a, r) => a + r[k], 0);

export function KoreansTab() {
  /* 명단과 정렬 규칙만 코드에 있고, 기록은 전부 네트워크에서 온다 */
  const [KOREANS, setKoreans] = useState<KoreanPlayer[] | null>(null);
  const [source, setSource] = useState<Source>('none');
  const [takenAt, setTakenAt] = useState('');

  useEffect(() => {
    let alive = true;
    loadKoreans().then((r) => {
      if (!alive) return;
      setKoreans(r.data);
      setSource(r.source);
      setTakenAt(r.fetchedAt);
    });
    return () => {
      alive = false;
    };
  }, []);

  const all = KOREANS ?? [];
  const leagues = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of all) if (!seen.has(p.league)) seen.set(p.league, p.leagueName);
    return [...seen.entries()].sort(
      (a, b) => (LEAGUE_ORDER[a[0]] ?? 99) - (LEAGUE_ORDER[b[0]] ?? 99),
    );
  }, [all]);

  const [league, setLeague] = useState('ALL');
  const [openId, setOpenId] = useState<string | null>(null);

  /**
   * 정렬: 손흥민·이강인·김민재 고정 → 분데스리가 → 강한 리그 순.
   * 같은 리그 안에서는 공격포인트, 출전시간 순.
   */
  const list = useMemo(() => {
    const list = league === 'ALL' ? all : all.filter((p) => p.league === league);
    const pinIndex = (p: KoreanPlayer) => {
      const i = PINNED.indexOf(p.id);
      return i === -1 ? Infinity : i;
    };
    return [...list].sort((a, b) => {
      const pa = pinIndex(a);
      const pb = pinIndex(b);
      if (pa !== pb) return pa - pb;
      const la = LEAGUE_ORDER[a.league] ?? 99;
      const lb = LEAGUE_ORDER[b.league] ?? 99;
      if (la !== lb) return la - lb;
      const sa = visibleStats(a);
      const sb = visibleStats(b);
      const pts = sum(sb, 'goals') + sum(sb, 'assists') - (sum(sa, 'goals') + sum(sa, 'assists'));
      if (pts !== 0) return pts;
      return sum(sb, 'minutes') - sum(sa, 'minutes');
    });
  }, [league, all]);

  const totals = useMemo(() => {
    let goals = 0;
    let assists = 0;
    let apps = 0;
    for (const p of list) {
      const s = visibleStats(p);
      goals += sum(s, 'goals');
      assists += sum(s, 'assists');
      apps += sum(s, 'apps');
    }
    return { goals, assists, apps };
  }, [list]);

  if (KOREANS === null) {
    return (
      <div className="page">
        <div className="skel" style={{ height: 120, borderRadius: 16 }} />
        <div className="skel" style={{ height: 480 }} />
      </div>
    );
  }

  if (!all.length) {
    return (
      <div className="page">
        <div className="empty">
          <h3>코리안리거 기록을 불러오지 못했습니다</h3>
          <p>
            명단과 정렬 규칙만 <code>src/config/koreans.ts</code> 에 있고,
            소속팀·출전·골·도움은 전부 ESPN 에서 받아옵니다.
            프록시(<code>VITE_API_BASE</code>)나 정적 피드(<code>/data/koreans.json</code>)
            중 하나는 연결되어 있어야 합니다.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <section>
        <div className="sec__head">
          <h2 className="sec__title">코리안리거</h2>
          <span className="sec__note">
            해외 리그 소속 {all.length}명 · 리그와 유럽대항전 기록
            {takenAt && ` · ${new Date(takenAt).toLocaleString('ko-KR', {
              month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
            })} 기준`}
            {source === 'live' ? ' · 실시간' : source === 'feed' ? ' · 자동 갱신' : ''}
          </span>
        </div>

        <div className="kr__totals">
          {([
            ['총 득점', totals.goals],
            ['총 도움', totals.assists],
            ['공격 포인트', totals.goals + totals.assists],
            ['총 출전', totals.apps],
          ] as const).map(([k, v]) => (
            <div className="kr__tile" key={k}>
              <b className="num">{v}</b>
              <span>{k}</span>
            </div>
          ))}
        </div>

        <nav className="kr__filters" aria-label="리그 필터">
          <button aria-pressed={league === 'ALL'} onClick={() => setLeague('ALL')}>
            전체
          </button>
          {leagues.map(([slug, name]) => (
            <button key={slug} aria-pressed={league === slug} onClick={() => setLeague(slug)}>
              {name}
            </button>
          ))}
        </nav>

        <div className="kr__grid">
          {list.map((p) => (
            <KoreanCard
              p={p}
              key={p.id}
              open={openId === p.id}
              onHover={(v) => setOpenId(v ? p.id : null)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function KoreanCard({
  p, open, onHover,
}: { p: KoreanPlayer; open: boolean; onHover: (v: boolean) => void }) {
  const palette = usePalette();
  const [bg, fg] = tintOf(p.clubId);
  const shown = visibleStats(p);
  const g = sum(shown, 'goals');
  const a = sum(shown, 'assists');
  const max = Math.max(1, ...shown.map((r) => r.goals + r.assists));

  return (
    <article
      className="krc"
      style={{ ['--club' as string]: bg, ['--clubfg' as string]: fg }}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      tabIndex={0}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
    >
      <div className="krc__top">
        <Headshot id={p.id} src={p.photo} label={p.nameKo.slice(0, 1)} size={46} className="krc__hs" />
        <div className="krc__id">
          <b>
            {p.nameKo}
            <em>{POS_LABEL[p.pos]}</em>
          </b>
          <span className="krc__club">
            <Crest
              team={{ id: p.clubId, name: p.club, shortName: p.club, abbr: p.club.slice(0, 3).toUpperCase(), logo: p.clubId === '0' ? '' : CREST(p.clubId) }}
              size={15}
            />
            {p.club} · {p.age}세
          </span>
          <span className="krc__lg">{p.leagueName}</span>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="krc__none">이번 시즌 리그 출전 기록이 아직 없습니다.</p>
      ) : (
        <>
          <div className="krc__label">대회별 공격포인트</div>
          <div className="krc__comps">
            {shown.map((s) => (
              <div className="krcc" key={s.competition} style={{ ['--c' as string]: palette.color(s.competition) }}>
                <i />
                <span className="krcc__n">{s.label}</span>
                <span className="krcc__bar">
                  <b style={{ width: `${((s.goals + s.assists) / max) * 100}%` }} />
                </span>
                <span className="krcc__a num">
                  {s.apps}경기 <em>(선발 {s.starts})</em>
                </span>
                <span className="krcc__ga num">
                  <b data-on={s.goals > 0}>{s.goals}</b>
                  <i className="krcc__sl">/</i>
                  <b data-on={s.assists > 0}>{s.assists}</b>
                </span>
                <span className="krcc__p num">{s.goals + s.assists}</span>
              </div>
            ))}
          </div>

          <div className="krc__foot">
            <span>합계</span>
            <span className="krc__sum num">
              <em>G</em> {g}
              <em>A</em> {a}
              <b>AP {g + a}</b>
            </span>
          </div>
        </>
      )}

      {open && <RecentPanel p={p} />}
    </article>
  );
}

/** 호버 — 최근 3경기 기록 */
function RecentPanel({ p }: { p: KoreanPlayer }) {
  const palette = usePalette();

  return (
    <div className="krr" role="tooltip">
      <div className="krr__h">
        <span className="eyebrow">최근 3경기 기록</span>
        <b>{p.nameKo}</b>
      </div>

      {p.recent.length === 0 ? (
        <p className="krr__none">
          경기별 기록은 소속 클럽의 경기 라인업에서 가져옵니다. 실시간 모드(Worker 연결)에서
          자동으로 채워지며, 스냅샷 프리뷰에는 일부 선수만 담겨 있습니다.
        </p>
      ) : (
        p.recent.map((gm, i) => (
          <div className="krr__g" key={i}>
            <i className="fchip" data-r={gm.result}>{gm.result}</i>
            <i className="krr__c" style={{ background: palette.color(gm.competition) }} />
            <span className="krr__opp">vs {gm.opponent}</span>
            <span className="krr__sc num">{gm.score}</span>
            <span className="krr__m num">
              {/* 선발/교체·출전시간은 경기 로스터에서 온 실제 값일 때만 적는다.
                  없으면 "-" — 예전처럼 0분으로 꾸미지 않는다. */}
              {gm.started === undefined
                ? '-'
                : gm.started
                  ? `선발 ${gm.minutes ?? 90}'`
                  : gm.subIn !== undefined
                    ? `교체 ${gm.subIn}'(${gm.minutes ?? 0})`
                    : '교체'}
              {gm.goals > 0 && <em className="krr__gg">{gm.goals}G</em>}
              {gm.assists > 0 && <em className="krr__aa">A{gm.assists}</em>}
              {gm.yellow && <em className="krr__y" />}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
