import { useEffect, useMemo, useState } from 'react';
import { LEAGUE_ORDER, PINNED } from '../config/koreans';
import type { KoreanGame, KoreanPlayer } from '../types/feedTypes';
import { loadKoreans, type Source } from '../lib/api';
import { visibleComps } from '../lib/comps';
import { usePalette } from '../lib/palette';
import { StatCard, type CompLine, type NationalLine, type RecentLine } from '../components/StatCard';
import crestKor from '../assets/crest-kor.png';
import { Swap } from '../components/Swap';
import { lastMatchTag } from '../lib/form';

const POS_LABEL: Record<string, string> = { G: 'GK', D: 'DF', M: 'MF', F: 'FW' };

/**
 * 보여 줄 대회 줄.
 * 유럽대항전은 0경기라도 남긴다 — 스냅샷이 "이 클럽은 그 대회 출전 팀" 을
 * 확인해 넣어 둔 줄이라, 지우면 "안 나가는 팀" 과 구분이 사라진다.
 * (규칙과 근거는 lib/comps.ts)
 */
const shownStats = (p: KoreanPlayer) => visibleComps(p.stats, p.league);

const toRecent = (gm: KoreanGame): RecentLine => ({
  competition: gm.competition,
  date: gm.date,
  result: gm.result,
  opponent: gm.opponent,
  opponentId: gm.opponentId,
  score: gm.score,
  started: gm.started,
  minutes: gm.minutes,
  subIn: gm.subIn,
  goals: gm.goals,
  assists: gm.assists,
  yellow: gm.yellow,
  rating: gm.rating,
});

/** A매치 줄 — 예전 피드(national 없음)면 줄을 그리지 않는다 */
const nationalOf = (p: KoreanPlayer): NationalLine | undefined =>
  p.national && {
    year: p.national.year,
    apps: p.national.apps,
    starts: p.national.starts,
    goals: p.national.goals,
    assists: p.national.assists,
    crest: crestKor,
    recent: p.national.recent.map(toRecent),
  };

const sum = (rows: { goals: number; assists: number; apps: number }[], k: 'goals' | 'assists' | 'apps') =>
  rows.reduce((a, r) => a + r[k], 0);

type SortKey = 'default' | 'recent' | 'points' | 'apps' | 'form';
const SORTS: [SortKey, string][] = [
  ['default', '기본'],
  ['recent', '최근 출전'],
  ['points', '공격P'],
  ['apps', '출전'],
  ['form', '최근 폼'],
];

const pointsOf = (p: KoreanPlayer) => {
  const s = shownStats(p);
  return sum(s, 'goals') + sum(s, 'assists');
};
const appsOf = (p: KoreanPlayer) => sum(shownStats(p), 'apps');
const startsOf = (p: KoreanPlayer) => shownStats(p).reduce((a, r) => a + r.starts, 0);
/** 마지막으로 뛴 경기의 킥오프(ms) — 클럽 · 대표팀 중 늦은 쪽. 명단에만 든 경기는 뺀다. 없으면 0 */
const lastPlayedOf = (p: KoreanPlayer) =>
  Math.max(0, ...[...p.recent, ...(p.national?.recent ?? [])]
    .filter((g) => g.date && (g.started !== false || g.subIn !== undefined))
    .map((g) => Date.parse(g.date!) || 0));
/** 최근 경기(최신순 3경기)의 골+도움 */
const formOf = (p: KoreanPlayer) => p.recent.reduce((a, g) => a + g.goals + g.assists, 0);
/** 클럽도 대표팀도 이번 시즌 한 경기도 안 뛴 선수 — 큰 카드 대신 칩으로 접는다 */
const isIdle = (p: KoreanPlayer) => appsOf(p) === 0 && !(p.national && p.national.apps > 0);


export function KoreansTab() {
  const palette = usePalette();
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
    /* 리그 이름이 비어 오는 선수가 있다(ESPN 이 defaultLeague 이름을 안 주는
       경우). 그대로 두면 글자 없는 빈 칩이 하나 생기므로 슬러그로 대신한다. */
    for (const p of all) {
      const slug = String(p.league ?? '').trim();
      if (!slug || seen.has(slug)) continue;
      seen.set(slug, String(p.leagueName ?? '').trim() || slug);
    }
    return [...seen.entries()].sort(
      (a, b) => (LEAGUE_ORDER[a[0]] ?? 99) - (LEAGUE_ORDER[b[0]] ?? 99),
    );
  }, [all]);

  const [league, setLeague] = useState('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('default');
  const [openId, setOpenId] = useState<string | null>(null);

  /**
   * 정렬: 손흥민·이강인·김민재 고정 → 분데스리가 → 강한 리그 순.
   * 같은 리그 안에서는 공격포인트, 출전시간 순.
   */
  const list = useMemo(() => {
    const rows = league === 'ALL' ? all : all.filter((p) => p.league === league);
    const pinIndex = (p: KoreanPlayer) => {
      const i = PINNED.indexOf(p.id);
      return i === -1 ? Infinity : i;
    };
    /* 정렬 단추 — 기본 정렬은 동점일 때의 순서로 그대로 쓴다 */
    const by: Record<Exclude<SortKey, 'default'>, (p: KoreanPlayer) => number[]> = {
      recent: (p) => [lastPlayedOf(p), 0],
      points: (p) => [pointsOf(p), appsOf(p)],
      apps: (p) => [appsOf(p), startsOf(p)],
      form: (p) => [formOf(p), pointsOf(p)],
    };
    const base = [...rows].sort((a, b) => {
      const pa = pinIndex(a);
      const pb = pinIndex(b);
      if (pa !== pb) return pa - pb;
      const la = LEAGUE_ORDER[a.league] ?? 99;
      const lb = LEAGUE_ORDER[b.league] ?? 99;
      if (la !== lb) return la - lb;
      const sa = shownStats(a);
      const sb = shownStats(b);
      const pts = sum(sb, 'goals') + sum(sb, 'assists') - (sum(sa, 'goals') + sum(sa, 'assists'));
      if (pts !== 0) return pts;
      return sum(sb, 'apps') - sum(sa, 'apps');
    });
    if (sortKey === 'default') return base;
    const key = by[sortKey];
    return base
      .map((p, i) => ({ p, i, k: key(p) }))
      .sort((a, b) => (b.k[0] - a.k[0]) || (b.k[1] - a.k[1]) || (a.i - b.i))
      .map((x) => x.p);
  }, [league, all, sortKey]);
  const active = useMemo(() => list.filter((p) => !isIdle(p)), [list]);
  const idle = useMemo(() => list.filter(isIdle), [list]);

  const totals = useMemo(() => {
    let goals = 0;
    let assists = 0;
    let apps = 0;
    for (const p of list) {
      const s = shownStats(p);
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
            해외 리그 소속 {all.length}명 · 리그와 유럽대항전 기록 · 게이지는 선발 비율
            {/* 날짜·시각은 한 덩어리로 — 폰에서 "10. 13." / "오전 01:23" 으로 갈렸다 */}
            {takenAt && <> · <span className="nowrap">{new Date(takenAt).toLocaleString('ko-KR', {
              month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
            })} 기준</span></>}
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

        <div className="kr__bar">
        <nav className="kr__filters" aria-label="리그 필터">
          <button aria-pressed={league === 'ALL'} onClick={() => setLeague('ALL')}>
            전체
          </button>
          {leagues.map(([slug, name]) => (
            <button key={slug} aria-pressed={league === slug} onClick={() => setLeague(slug)}>
              {/* 아는 대회면 사람이 읽는 이름으로 (피드의 leagueName 은 비면 슬러그다) */}
              {palette.name(slug) === slug ? name : palette.name(slug)}
            </button>
          ))}
        </nav>
        <div className="kr__sort" role="group" aria-label="정렬">
          <span>정렬</span>
          {SORTS.map(([k, label]) => (
            <button key={k} aria-pressed={sortKey === k} onClick={() => setSortKey(k)}>
              {label}
            </button>
          ))}
        </div>
        </div>

        <Swap k={`${league}-${sortKey}`}>
        <div className="kr__grid">
          {active.map((p) => (
            <StatCard
              key={p.id}
              id={p.id}
              name={p.nameKo}
              posLabel={POS_LABEL[p.pos]}
              pos={p.pos}
              tint="league"
              compLabel={false}
              hot={lastMatchTag(p.recent)}
              rating={p.rating}
              national={nationalOf(p)}
              photo={p.photo}
              photoKind={p.photoKind}
              sofascoreId={p.sofascoreId}
              fallbackLabel={p.nameKo.slice(0, 1)}
              clubId={p.clubId}
              club={p.club}
              age={p.age}
              league={p.league}
              leagueName={p.leagueName}
              leagueLogo={p.leagueLogo}
              comps={shownStats(p).map((s): CompLine => ({
                competition: s.competition,
                label: s.label,
                logo: s.logo,
                apps: s.apps,
                starts: s.starts,
                goals: s.goals,
                assists: s.assists,
              }))}
              recent={p.recent.map(toRecent)}
              emptyNote="이번 시즌 리그 출전 기록이 아직 없습니다."
              recentNote="경기별 기록은 소속 클럽의 경기 라인업에서 가져옵니다. 다음 갱신 회차에 채워집니다."
              open={openId === p.id}
              onHover={(v) => setOpenId(v ? p.id : null)}
            />
          ))}
        </div>
        {idle.length > 0 && (
          <div className="kr__idle">
            <h3>이번 시즌 출전 기록 없음 · {idle.length}명</h3>
            <ul>
              {idle.map((p) => (
                <li key={p.id}>
                  <b>{p.nameKo}</b>
                  <span>
                    {[p.club, p.league && (palette.name(p.league) === p.league ? p.leagueName : palette.name(p.league))]
                      .filter(Boolean).join(' · ')}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        </Swap>
      </section>
    </div>
  );
}
