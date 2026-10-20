import { useEffect, useMemo, useState } from 'react';
import { KOREAN_CLUBS, TARGETS, themeVarsOf, type Target, type TargetId } from '../config/targets';
import type { Match } from '../lib/types';
import type { LiveMatch } from '../types/feedTypes';
import { loadSchedule } from '../lib/api';
import { kstTime } from '../lib/kst';
import { orderToday } from '../lib/live';
import { PaletteProvider } from '../lib/palette';
import { Crest } from '../components/Crest';
import { KorFlag } from '../components/KorFlag';
import { LiveMatchView } from '../components/LiveMatch';
import { Swap, dirOf, type SwapDir } from '../components/Swap';

/**
 * 대한민국 › 오늘의 경기 (2026-10-20) — 대표팀 · 코리안리거 소속팀(뮌헨 · 아틀레티코 · LAFC)의 오늘 경기.
 *
 * 예전엔 소속팀 탭 안에 펼쳤는데 그 화면이 너무 복잡해져서 여기로 뺐다. 오늘 경기가 둘 이상이면
 * 위 전환 단추로 고른다(소속팀 탭과 같은 모양). 처음엔 진행 중 → 곧 시작 → 방금 끝난 경기 순.
 * 어떤 경기를 "오늘" 로 볼지는 App 이 정해 넘긴다(isTodayLive · 라인업 발표 전 예정 경기는 뺀다).
 */
const TEAMS: Target[] = [...TARGETS.filter((t) => t.kind === 'national'), ...KOREAN_CLUBS];

const stateOf = (l: LiveMatch) =>
  l.phase === 'live' ? `LIVE ${l.clock ?? ''}`.trim()
    : l.phase === 'done' ? `종료 ${l.score[0]}:${l.score[1]}`
      : `${kstTime(l.kickoffUtc)} 킥오프`;

export function KoreaTodayTab({ lives, pick, onPick }: {
  /** 오늘의 경기(이미 고른 것) — 순서는 여기서 정한다 */
  lives: LiveMatch[];
  pick: TargetId | null;
  onPick: (id: TargetId) => void;
}) {
  const list = useMemo(() => orderToday(lives), [lives]);
  const cur = list.find((l) => l.slug === pick) ?? list[0];

  /* 그 팀 일정 — 엠블럼 · 선수 상세 카드(스쿼드 잇기)에 쓴다 */
  const [feeds, setFeeds] = useState<Record<string, Match[]>>({});
  const slugs = list.map((l) => l.slug).join(',');
  useEffect(() => {
    let alive = true;
    for (const s of slugs ? slugs.split(',') : []) {
      const t = TEAMS.find((x) => x.id === s);
      if (!t) continue;
      loadSchedule(t.espnTeamId).then((r) => { if (alive) setFeeds((f) => ({ ...f, [s]: r.data })); });
    }
    return () => { alive = false; };
  }, [slugs]);

  const [dir, setDir] = useState<SwapDir>('fade');
  if (!cur) return null;
  const team = TEAMS.find((t) => t.id === cur.slug);
  const matches = feeds[cur.slug];
  const choose = (id: string) => {
    if (id === cur.slug) return;
    setDir(dirOf(list.findIndex((l) => l.slug === cur.slug), list.findIndex((l) => l.slug === id)));
    onPick(id as TargetId);
  };

  return (
    <div className="page ktoday">
      {list.length > 1 && (
        <section>
          <div className="sec__head">
            <h2 className="sec__title">오늘의 경기</h2>
            <span className="sec__note">대표팀 · 코리안리거 소속팀 · {list.length}경기</span>
          </div>
          <div className="kclub__sw" role="tablist" aria-label="경기 고르기" style={{ gridTemplateColumns: `repeat(${list.length}, minmax(0, 1fr))` }}>
            {list.map((l) => {
              const t = TEAMS.find((x) => x.id === l.slug);
              const kor = t && 'koreans' in t ? (t as (typeof KOREAN_CLUBS)[number]).koreans : null;
              const opp = l.ours ? l[l.ours === 'home' ? 'away' : 'home'].name : null;
              return (
                <button
                  key={l.slug}
                  role="tab"
                  aria-selected={l.slug === cur.slug}
                  data-on={l.slug === cur.slug || undefined}
                  className="kclub__b ktoday__b"
                  style={t ? { ['--club' as string]: t.theme.accent } : undefined}
                  onClick={() => choose(l.slug)}
                >
                  {t && <Crest team={{ id: t.espnTeamId, name: t.name, shortName: t.name, abbr: t.abbr, logo: t.crest }} size={22} glow={false} />}
                  <span className="kclub__bt">
                    <b>{t?.kind === 'national' ? '대한민국' : t?.name ?? l.slug}{opp && <em className="ktoday__vs"> vs {opp}</em>}</b>
                    <small>
                      <span className="ktoday__st" data-phase={l.phase}>{l.phase === 'live' && <i aria-hidden="true" />}{stateOf(l)}</span>
                      {kor?.map((k) => <span key={k.id}><KorFlag />{k.nameKo}</span>)}
                    </small>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <Swap k={cur.slug} dir={dir}>
        {team ? (
          <PaletteProvider target={team}>
            <div style={themeVarsOf(team)}>
              <LiveMatchView live={cur} match={matches?.find((m) => m.id === cur.espnId)} teamId={team.espnTeamId} matches={matches} />
            </div>
          </PaletteProvider>
        ) : <LiveMatchView live={cur} />}
      </Swap>
    </div>
  );
}
