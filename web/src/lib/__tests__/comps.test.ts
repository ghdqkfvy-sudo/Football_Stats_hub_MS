import { describe, expect, it } from 'vitest';
import { visibleComps } from '../comps';

const row = (competition: string, apps: number) => ({ competition, apps });

describe('visibleComps', () => {
  it('유럽대항전은 0경기라도 줄을 남긴다', () => {
    /* ⚠️ 이게 핵심. 스냅샷은 "이 클럽이 챔스 출전 팀이다" 를 알고 0경기 줄을
       넣어 두는데, 예전 UI 가 apps>0 으로 걸러 통째로 지웠다. 그러면
       "챔스에 안 나가는 팀" 과 "나가는데 아직 출전이 없는 선수" 가 같아진다. */
    const rows = [row('ger.1', 3), row('uefa.champions', 0)];
    expect(visibleComps(rows, 'ger.1').map((r) => r.competition))
      .toEqual(['ger.1', 'uefa.champions']);
  });

  it('유로파·컨퍼런스도 같다', () => {
    const rows = [row('uefa.europa', 0), row('uefa.europa.conf', 0)];
    expect(visibleComps(rows, 'eng.1').length).toBe(2);
  });

  it('소속 리그가 0경기면 뺀다 — 카드가 따로 안내한다', () => {
    expect(visibleComps([row('ger.1', 0)], 'ger.1')).toEqual([]);
  });

  it('소속 리그가 아니고 유럽대항전도 아닌 대회는 뺀다 (컵·친선)', () => {
    const rows = [row('eng.1', 5), row('eng.fa', 2), row('club.friendly', 3)];
    expect(visibleComps(rows, 'eng.1').map((r) => r.competition)).toEqual(['eng.1']);
  });

  it('출전이 생기면 그 줄이 그대로 채워진다', () => {
    const rows = [row('ger.1', 4), row('uefa.champions', 2)];
    expect(visibleComps(rows, 'ger.1').map((r) => r.apps)).toEqual([4, 2]);
  });
});
