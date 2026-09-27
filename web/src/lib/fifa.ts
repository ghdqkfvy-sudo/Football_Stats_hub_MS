import { useEffect, useState } from 'react';
import { feed } from './feed';

/**
 * FIFA 남자 랭킹 — `fifa-ranking.json`(스냅샷이 위키백과 데이터 모듈에서 뜬다).
 *
 * 파일의 나라 이름은 FIFA 표기("Korea Republic", "IR Iran", "USA")이고 경기
 * 데이터는 ESPN 표기("South Korea", "Iran", "United States")다. 둘을 맞추려고
 * 이름을 정규화(소문자·악센트 제거·영숫자만)한 뒤 ESPN → FIFA 별칭을 한 번 거친다.
 * 모르는 나라는 undefined — 틀린 순위를 붙이느니 비워 둔다.
 */
const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** ESPN 표기 → FIFA 표기 (둘 다 norm 한 값) */
const ALIAS: Record<string, string> = {
  southkorea: 'korearepublic',
  korea: 'korearepublic',
  northkorea: 'koreadpr',
  iran: 'iriran',
  unitedstates: 'usa',
  turkey: 'turkiye',
  ivorycoast: 'cotedivoire',
  drcongo: 'congodr',
  congodemocraticrepublic: 'congodr',
  czechrepublic: 'czechia',
  china: 'chinapr',
  capeverde: 'caboverde',
  capeverdeislands: 'caboverde',
  ireland: 'republicofireland',
  kyrgyzstan: 'kyrgyzrepublic',
  newzealand: 'aotearoanewzealand',
  gambia: 'thegambia',
  hongkong: 'hongkongchina',
  brunei: 'bruneidarussalam',
  macedonia: 'northmacedonia',
  swaziland: 'eswatini',
  easttimor: 'timorleste',
  saotomeandprincipe: 'saotomeandprincipe',
  stkittsandnevis: 'stkittsandnevis',
  uae: 'unitedarabemirates',
};

interface FifaFile { updated: string; ranks: Record<string, number> }

let cache: Promise<{ updated: string; byName: Map<string, number> } | null> | null = null;
function load() {
  cache ??= feed('fifa-ranking.json')
    .then((f: FifaFile) => ({
      updated: f.updated,
      byName: new Map(Object.entries(f.ranks ?? {}).map(([k, v]) => [norm(k), v])),
    }))
    .catch(() => null);
  return cache;
}

export type FifaOf = (team: { name: string; shortName?: string }) => number | undefined;

/** 국가대표 순위 조회기. 파일을 받기 전·못 받으면 늘 undefined. */
export function useFifaRank(): { fifaOf: FifaOf; updated: string } {
  const [data, setData] = useState<{ updated: string; byName: Map<string, number> } | null>(null);
  useEffect(() => {
    let alive = true;
    load().then((d) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, []);
  const fifaOf: FifaOf = (team) => {
    if (!data) return undefined;
    for (const n of [team.name, team.shortName]) {
      if (!n) continue;
      const k = norm(n);
      const hit = data.byName.get(ALIAS[k] ?? k);
      if (hit !== undefined) return hit;
    }
    return undefined;
  };
  return { fifaOf, updated: data?.updated ?? '' };
}
