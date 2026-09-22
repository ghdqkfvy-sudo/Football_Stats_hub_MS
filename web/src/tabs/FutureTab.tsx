import { useEffect, useState } from 'react';
import type { Target } from '../config/targets';
import { CLAUSE_COLOR, CLAUSE_LABEL, futureFor, type ClauseKind, type FuturePlayer } from '../data/future';
import { loadFutureStat, type FutureStat } from '../lib/api';
import { usePalette } from '../lib/palette';
import { StatCard, type CompLine, type RecentLine } from '../components/StatCard';

const POS: Record<string, string> = { G: 'GK', D: 'DF', M: 'MF', F: 'FW' };

/** 조항이 무슨 뜻인지 — 종류만 보여 주기로 했으니 설명은 여기 한 줄로 */
const CLAUSE_DESC: Record<ClauseKind, string> = {
  buyback: '원 소속 구단이 정해진 조건으로 다시 데려올 수 있다',
  sellon: '이 선수가 다시 팔릴 때 원 소속 구단이 이익을 나눠 받는다',
  loan: '임대로 나가 있고 계약은 원 소속 구단에 남아 있다',
};

export function FutureTab({ target }: { target: Target }) {
  const rows = futureFor(target.espnTeamId);
  const [stats, setStats] = useState<Record<string, FutureStat | null>>({});
  const [filter, setFilter] = useState<ClauseKind | 'ALL'>('ALL');
  const [openId, setOpenId] = useState<string | null>(null);

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
            조항 종류만 표기 · 소속팀과 기록은 ESPN 에서
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
                {/* 코리안리거 탭과 **같은 격자·같은 카드** 를 쓴다 */}
                <div className="kr__grid">
                  {group.map((p) => (
                    <FutureCard
                      key={p.id}
                      p={p}
                      stat={stats[p.id]}
                      open={openId === p.id}
                      onHover={(v) => setOpenId(v ? p.id : null)}
                    />
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

function FutureCard({
  p, stat, open, onHover,
}: {
  p: FuturePlayer;
  stat?: FutureStat | null;
  open: boolean;
  onHover: (v: boolean) => void;
}) {
  const palette = usePalette();
  /* 지금 뛰는 리그·팀은 조회 결과가 알려 준다 — 큐레이션 파일의 값이
     낡아도(이적) 화면은 따라간다. */
  const league = stat?.league ?? p.league;
  const club = stat?.club ?? p.club;

  const comps: CompLine[] = stat && stat.apps > 0
    ? [{
      competition: league,
      label: palette.name(league) === league ? league : palette.name(league),
      apps: stat.apps,
      starts: stat.starts ?? 0,
      goals: stat.goals,
      assists: stat.assists,
    }]
    : [];

  const recent: RecentLine[] = (stat?.recent ?? []).map((g): RecentLine => ({
    competition: league,
    opponent: g.opponent,
    score: g.score,
    goals: g.goals,
    assists: g.assists,
  }));

  return (
    <StatCard
      id={p.id}
      name={p.name}
      posLabel={p.pos ? POS[p.pos] : undefined}
      fallbackLabel={p.name.slice(0, 1)}
      club={club}
      league={league}
      leagueName={palette.name(league)}
      comps={comps}
      recent={recent}
      tag={CLAUSE_LABEL[p.kind]}
      emptyNote={
        stat === undefined
          ? '기록을 불러오는 중입니다.'
          : '이번 시즌 출전 기록이 아직 없습니다.'
      }
      recentNote="이번 시즌 출전한 경기가 아직 없습니다."
      open={open}
      onHover={onHover}
    />
  );
}
