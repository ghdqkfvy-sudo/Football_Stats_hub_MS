import { useEffect, useState } from 'react';
import type { Target } from '../config/targets';
import { CLAUSE_COLOR, CLAUSE_LABEL, futureFor, type ClauseKind, type FuturePlayer } from '../data/future';
import { loadFutureStat, type FutureStat } from '../lib/api';
import { Headshot } from '../components/Headshot';
import { kstShortDate } from '../lib/kst';

const POS: Record<string, string> = { G: 'GK', D: 'DF', M: 'MF', F: 'FW' };

/** 조항이 무슨 뜻인지 — 종류만 보여 주기로 했으니 설명은 여기 한 줄로 */
const CLAUSE_DESC: Record<ClauseKind, string> = {
  buyback: '원 소속 구단이 정해진 조건으로 다시 데려올 수 있다',
  sellon: '이 선수가 다시 팔릴 때 원 소속 구단이 이익을 나눠 받는다',
  loan: '임대로 나가 있고 계약은 원 소속 구단에 남아 있다',
};

const LEAGUE_LABEL: Record<string, string> = {
  'esp.1': 'La Liga', 'eng.1': 'Premier League', 'ita.1': 'Serie A',
  'ger.1': 'Bundesliga', 'fra.1': 'Ligue 1', 'por.1': 'Primeira Liga',
  'ned.1': 'Eredivisie', 'eng.2': 'Championship', 'usa.1': 'MLS',
};

export function FutureTab({ target }: { target: Target }) {
  const rows = futureFor(target.espnTeamId);
  const [stats, setStats] = useState<Record<string, FutureStat | null>>({});
  const [filter, setFilter] = useState<ClauseKind | 'ALL'>('ALL');

  useEffect(() => {
    let alive = true;
    setStats({});
    /* 예전에는 여기서 프록시가 없으면 그냥 돌아갔다. 그런데 loadFutureStat
       자체가 정적 피드(future.json) 폴백을 갖고 있어서, 프록시가 없는 배포
       (GitHub Pages)에서는 기록이 영영 안 뜨는 상태였다. */
    for (const p of rows) {
      loadFutureStat(p.league, p.id).then((s) => {
        if (alive) setStats((m) => ({ ...m, [p.id]: s }));
      });
    }
    return () => {
      alive = false;
    };
    // rows 는 target 에서 파생되므로 target 하나만 본다
  }, [target.espnTeamId]);

  if (!rows.length) {
    return (
      <div className="page">
        <div className="empty">
          <h3>{target.nameEn} 의 조항 선수가 등록되어 있지 않습니다</h3>
          <p>
            이적 조항(바이백·셀온·임대)은 무료 API 에 존재하지 않아
            <code> web/src/data/future.ts </code> 에 선수와 조항 종류만 적어 둡니다.
            선수를 추가하면 현 소속팀과 기록은 ESPN 에서 자동으로 붙습니다.
          </p>
        </div>
      </div>
    );
  }

  const list = filter === 'ALL' ? rows : rows.filter((p) => p.kind === filter);
  const count = (k: ClauseKind) => rows.filter((p) => p.kind === k).length;

  return (
    <div className="page">
      <section>
        <div className="sec__head">
          <h2 className="sec__title">Future Resources</h2>
          <span className="sec__note">
            조항 종류만 표기 · 소속팀과 기록은 ESPN 실시간
          </span>
        </div>

        <nav className="nf" aria-label="조항 필터">
          <button aria-pressed={filter === 'ALL'} onClick={() => setFilter('ALL')}>
            전체
          </button>
          {(['buyback', 'sellon', 'loan'] as const).map((k) => (
            <button
              key={k}
              aria-pressed={filter === k}
              onClick={() => setFilter(k)}
              style={{ ['--c' as string]: CLAUSE_COLOR[k] }}
            >
              {CLAUSE_LABEL[k]}
              <em className="num">{count(k)}</em>
            </button>
          ))}
          <span className="nf__count num">{list.length}명</span>
        </nav>

        {/* 조항 종류별로 영역을 갈라 놓는다 — 배지 색만으로는 카드가 섞여
            "누가 바이백이고 누가 임대인지" 를 매번 다시 읽어야 했다. */}
        {(['buyback', 'sellon', 'loan'] as const)
          .filter((k) => filter === 'ALL' || filter === k)
          .map((k) => {
            const group = list.filter((p) => p.kind === k);
            if (!group.length) return null;
            return (
              <section className="fgroup" key={k} style={{ ['--c' as string]: CLAUSE_COLOR[k] }}>
                <header className="fgroup__h">
                  <i aria-hidden="true" />
                  <h3>{CLAUSE_LABEL[k]}</h3>
                  <span className="num">{group.length}명</span>
                  <p>{CLAUSE_DESC[k]}</p>
                </header>
                <div className="fgrid">
                  {group.map((p) => (
                    <FutureCard key={p.id} p={p} stat={stats[p.id]} />
                  ))}
                </div>
              </section>
            );
          })}

        <p className="fnote">
          이적 조항은 ESPN 을 포함한 어떤 무료 API 에도 없습니다. 그래서 여기서는
          <b> 조항의 종류(바이백·셀온·임대)만 </b> 표시합니다 — 금액·비율·기한처럼
          출처를 댈 수 없는 값은 적지 않습니다. 선수 명단만
          <code> future.ts </code> 에 두고, 현 소속팀·출전·득점·최근 경기는
          athleteId 로 ESPN 에서 받아 붙입니다. 선수가 팀을 옮겨도 ID 만 맞으면
          화면은 따라갑니다.
        </p>
      </section>
    </div>
  );
}

function FutureCard({ p, stat }: { p: FuturePlayer; stat?: FutureStat | null }) {
  const club = stat?.club ?? p.club;
  return (
    <article className="fcard" style={{ ['--c' as string]: CLAUSE_COLOR[p.kind] }}>
      <header className="fcard__top">
        <Headshot id={p.id} size={46} className="fcard__hs" label={p.name.slice(0, 1)} />
        <div className="fcard__id">
          <b>{p.name}</b>
          <span>
            {p.pos && <em>{POS[p.pos]}</em>}
            {club}
          </span>
        </div>
        <span className="fcard__tag">{CLAUSE_LABEL[p.kind]}</span>
      </header>

      <div className="fcard__league">
        {/* 지금 뛰는 리그는 조회 결과가 알려 준다 — 큐레이션 파일의 값이
            낡아도(이적) 화면은 따라간다. */}
        {LEAGUE_LABEL[stat?.league ?? p.league] ?? stat?.league ?? p.league}
        {stat === undefined ? ' · 불러오는 중' : stat === null ? ' · 이번 시즌 기록 없음' : ''}
      </div>

      <div className="fcard__stats">
        {([
          ['출전', stat?.apps],
          ['골', stat?.goals],
          ['도움', stat?.assists],
          ['공격P', stat ? stat.goals + stat.assists : undefined],
        ] as const).map(([k, v]) => (
          <div key={k} data-on={!!v}>
            <b className="num">{v === undefined ? '–' : v}</b>
            <span>{k}</span>
          </div>
        ))}
      </div>

      {stat && stat.recent.length > 0 && (
        <div className="fcard__recent">
          <span className="eyebrow">최근 {stat.recent.length}경기</span>
          {stat.recent.map((g, i) => (
            <div className="fcard__g" key={i}>
              <span className="fcard__gd num">{g.date ? kstShortDate(g.date) : '-'}</span>
              <span className="fcard__go">{g.opponent || '—'}</span>
              {g.score && <span className="fcard__gs num">{g.score}</span>}
              <span className="fcard__ga num">
                {g.goals > 0 && <em className="g">{g.goals}G</em>}
                {g.assists > 0 && <em className="a">{g.assists}A</em>}
                {g.goals === 0 && g.assists === 0 && <i>-</i>}
              </span>
            </div>
          ))}
        </div>
      )}

    </article>
  );
}
