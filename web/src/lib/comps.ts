/** 선수 카드에 어떤 대회 줄을 보여 줄 것인가 — 순수 규칙이라 따로 둔다. */

/** 유럽대항전 — 소속 클럽이 출전 팀이면 0경기라도 줄을 남긴다 */
export const EURO_COMPS = new Set(['uefa.champions', 'uefa.europa', 'uefa.europa.conf']);

export interface CompRowLike {
  competition: string;
  apps: number;
}

/**
 * 보여 줄 대회 줄을 고른다.
 *
 * ⚠️ 예전에는 `apps > 0` 하나로 걸렀다. 그래서 스냅샷이 "이 클럽은 챔스에
 * 나가는데 이 선수는 아직 출전이 없다" 를 구분해 0경기 줄로 넣어 뒀는데도
 * 화면에서 통째로 사라졌다 — "챔스에 안 나가는 팀" 과 구분이 안 됐다.
 *
 * 이제 유럽대항전 줄은 0경기라도 남긴다(나중에 출전하면 그 줄이 채워진다).
 * 소속 리그는 0경기면 뺀다 — 그건 "아직 리그 데뷔 전" 이고, 카드가
 * `emptyNote` 로 그 사실을 이미 말해 준다.
 */
export function visibleComps<T extends CompRowLike>(rows: T[], leagueSlug: string): T[] {
  return rows.filter((s) => (EURO_COMPS.has(s.competition) ? true : s.competition === leagueSlug && s.apps > 0));
}
