import { useEffect, useState } from 'react';
import type { Target } from '../config/targets';
import { CLAUSE_COLOR, CLAUSE_LABEL, futureFor, type ClauseKind, type FuturePlayer } from '../data/future';
import { loadFuturePlayers } from '../lib/api';
import type { KoreanPlayer } from '../types/feedTypes';
import { visibleComps } from '../lib/comps';
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
  /* undefined = 아직 받는 중, 없는 키 = 이번 시즌 기록/프로필을 못 받음 */
  const [feedById, setFeedById] = useState<Record<string, KoreanPlayer> | undefined>(undefined);
  const [filter, setFilter] = useState<ClauseKind | 'ALL'>('ALL');
  const [openId, setOpenId] = useState<string | null>(null);

  /* 코리안리거와 같은 피드 모양 — 한 파일에 전원이 들어 있어 한 번만 받는다 */
  useEffect(() => {
    let alive = true;
    loadFuturePlayers().then((r) => {
      if (alive) setFeedById(Object.fromEntries(r.data.map((x) => [String(x.id), x])));
    });
    return () => { alive = false; };
  }, []);

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
                      feed={feedById === undefined ? undefined : feedById[p.id] ?? null}
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

/**
 * 조항 선수 카드 — **코리안리거 탭과 같은 카드**(헤드샷 · 소속 엠블럼 · 나이 ·
 * 리그 앰블럼 · 대회별 출전 줄(챔스·유로파·컨퍼런스 포함) · 최근 3경기).
 * 다른 점은 오른쪽 위 조항 배지(바이백·셀온·임대) 하나다.
 */
function FutureCard({
  p, feed, open, onHover,
}: {
  p: FuturePlayer;
  /** undefined = 받는 중 · null = 피드에 없음 */
  feed?: KoreanPlayer | null;
  open: boolean;
  onHover: (v: boolean) => void;
}) {
  /* 지금 뛰는 리그·팀은 피드(ESPN 프로필)가 알려 준다 — 큐레이션 파일의 값이
     낡아도(이적) 화면은 따라간다. */
  const league = feed?.league || p.league;
  const comps: CompLine[] = feed
    ? visibleComps(feed.stats, league).map((s) => ({
      competition: s.competition,
      label: s.label,
      logo: s.logo,
      apps: s.apps,
      starts: s.starts,
      goals: s.goals,
      assists: s.assists,
    }))
    : [];
  const recent: RecentLine[] = (feed?.recent ?? []).map((gm) => ({
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
  }));

  return (
    <StatCard
      id={p.id}
      name={p.name}
      posLabel={POS[feed?.pos && feed.clubId !== '0' ? feed.pos : p.pos ?? 'M']}
      photo={feed?.photo}
      photoKind={feed?.photoKind}
      fallbackLabel={p.name.slice(0, 1)}
      clubId={feed?.clubId && feed.clubId !== '0' ? feed.clubId : undefined}
      club={feed?.club || p.club}
      age={feed?.age || undefined}
      league={league}
      leagueName={feed?.leagueName || league}
      leagueLogo={feed?.leagueLogo}
      comps={comps}
      recent={recent}
      tag={CLAUSE_LABEL[p.kind]}
      emptyNote={
        feed === undefined
          ? '기록을 불러오는 중입니다.'
          : '이번 시즌 출전 기록이 아직 없습니다.'
      }
      recentNote="경기별 기록은 소속 클럽의 경기 라인업에서 가져옵니다. 다음 갱신 회차에 채워집니다."
      open={open}
      onHover={onHover}
    />
  );
}
