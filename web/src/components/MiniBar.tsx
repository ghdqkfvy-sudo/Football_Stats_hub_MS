/**
 * 폰 전용 미니 막대 — 헤더가 화면 위로 사라지면 위에 붙는다.
 *
 *   [엠블럼] 일정 순위 선수 Future 뉴스 [↑]      ← 팀 화면
 *   [★] 다음 경기 · 주간 · 순위 · 결과  [↑]      ← Summary
 *
 * 긴 페이지를 내려간 뒤 탭을 바꾸거나 다른 구역으로 가려고 맨 위까지
 * 되돌아 올라갈 필요가 없게 한다. 엠블럼과 ↑ 는 맨 위로.
 * 헤더가 보이는 동안에는 위로 숨어 있고(inert — 눌리지도 초점을 받지도 않는다),
 * 넓은 화면에서는 아예 그리지 않는다(App 이 useIsMobile 로 고른다).
 */
const JUMPS: [string, string][] = [
  ['sum-next', '다음 경기'],
  ['sum-week', '주간'],
  ['sum-table', '순위'],
  ['sum-results', '결과'],
];

interface Props {
  show: boolean;
  summary: boolean;
  crest: string;
  darkCrest: boolean;
  name: string;
  tabs: { id: string; label: string; short?: string }[];
  tab: string;
  onTab: (id: string) => void;
  /** 데스크톱 막대의 팀 전환 엠블럼 줄 (폰에서는 CSS 가 숨긴다) */
  teams?: { id: string; name: string; crest: string; darkCrest?: boolean }[];
  activeTeamId?: string | null;
  onTeam?: (id: string) => void;
  onSummary?: () => void;
}

const toTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

export function MiniBar({
  show, summary, crest, darkCrest, name, tabs, tab, onTab, teams, activeTeamId, onTeam, onSummary,
}: Props) {
  return (
    <div className="mbar" data-show={show || undefined} inert={!show}>
      <button className="mbar__id" onClick={toTop} aria-label={`${name} · 맨 위로`}>
        {summary
          ? <span className="mbar__star">★</span>
          : <img src={crest} alt="" className={darkCrest ? 'crest' : undefined} />}
      </button>
      {/* 넓은 화면에서만 — 지금 어느 팀 화면인지 */}
      <b className="mbar__name">{name}</b>

      {summary ? (
        <nav className="mbar__nav" aria-label="Summary 구역">
          {JUMPS.map(([id, label]) => (
            <button
              key={id}
              className="mbar__b"
              onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              {label}
            </button>
          ))}
        </nav>
      ) : (
        <nav className="mbar__nav" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              className="mbar__b"
              role="tab"
              aria-selected={t.id === tab}
              onClick={() => {
                onTab(t.id);
                /* 새 탭은 첫머리부터 — 그 전 탭의 스크롤 깊이에 떨어지면 길을 잃는다.
                   본문 첫머리가 막대 바로 아래 오도록 순간 이동한다. */
                requestAnimationFrame(() => {
                  const main = document.querySelector('main');
                  if (!main) return;
                  const y = main.getBoundingClientRect().top + window.scrollY - 52;
                  if (window.scrollY > y) window.scrollTo({ top: y });
                });
              }}
            >
              {/* 넓은 화면은 전체 이름, 좁은 화면(≤980px)은 짧은 이름 — styles/topbar.css */}
              {t.short ? (
                <>
                  <span className="mbar__full">{t.label}</span>
                  <span className="mbar__short">{t.short}</span>
                </>
              ) : t.label}
            </button>
          ))}
        </nav>
      )}

      {/* 넓은 화면에서만 — 스크롤한 자리에서 바로 다른 팀으로 */}
      {teams && (
        <div className="mbar__teams" role="group" aria-label="팀 전환">
          <button
            className="mbar__team mbar__team--sum"
            aria-pressed={summary}
            aria-label="Summary"
            title="Summary"
            onClick={onSummary}
          >
            ★
          </button>
          {teams.map((t) => (
            <button
              key={t.id}
              className="mbar__team"
              aria-pressed={!summary && t.id === activeTeamId}
              aria-label={t.name}
              title={t.name}
              onClick={() => onTeam?.(t.id)}
            >
              <img src={t.crest} alt="" className={t.darkCrest ? 'crest' : undefined} />
            </button>
          ))}
        </div>
      )}

      <button className="mbar__top" onClick={toTop} aria-label="맨 위로">↑</button>
    </div>
  );
}
