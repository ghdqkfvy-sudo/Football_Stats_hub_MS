import { useEffect, useMemo, useState } from 'react';
import { LEAGUE_ORDER, PINNED } from '../config/koreans';
import type { KoreanPlayer } from '../types/feedTypes';
import { loadKoreans, type Source } from '../lib/api';
import { visibleComps } from '../lib/comps';
import { usePalette } from '../lib/palette';
import { StatCard, type CompLine, type RecentLine } from '../components/StatCard';

const POS_LABEL: Record<string, string> = { G: 'GK', D: 'DF', M: 'MF', F: 'FW' };

/**
 * 보여 줄 대회 줄.
 * 유럽대항전은 0경기라도 남긴다 — 스냅샷이 "이 클럽은 그 대회 출전 팀" 을
 * 확인해 넣어 둔 줄이라, 지우면 "안 나가는 팀" 과 구분이 사라진다.
 * (규칙과 근거는 lib/comps.ts)
 */
const shownStats = (p: KoreanPlayer) => visibleComps(p.stats, p.league);

const sum = (rows: { goals: number; assists: number; apps: number }[], k: 'goals' | 'assists' | 'apps') =>
  rows.reduce((a, r) => a + r[k], 0);

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
    return [...rows].sort((a, b) => {
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
  }, [league, all]);

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
              {/* 아는 대회면 사람이 읽는 이름으로 (피드의 leagueName 은 비면 슬러그다) */}
              {palette.name(slug) === slug ? name : palette.name(slug)}
            </button>
          ))}
        </nav>

        <div className="kr__grid">
          {list.map((p) => (
            <StatCard
              key={p.id}
              id={p.id}
              name={p.nameKo}
              posLabel={POS_LABEL[p.pos]}
              photo={p.photo}
              photoKind={p.photoKind}
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
              recent={p.recent.map((gm): RecentLine => ({
                competition: gm.competition,
                result: gm.result,
                opponent: gm.opponent,
                score: gm.score,
                started: gm.started,
                minutes: gm.minutes,
                subIn: gm.subIn,
                goals: gm.goals,
                assists: gm.assists,
                yellow: gm.yellow,
              }))}
              emptyNote="이번 시즌 리그 출전 기록이 아직 없습니다."
              recentNote="경기별 기록은 소속 클럽의 경기 라인업에서 가져옵니다. 다음 갱신 회차에 채워집니다."
              open={openId === p.id}
              onHover={(v) => setOpenId(v ? p.id : null)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
