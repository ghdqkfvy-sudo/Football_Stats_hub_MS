/**
 * 팀 표기는 ESPN이 주는 영문 명칭을 그대로 쓴다.
 * 이 표는 ESPN의 `shortDisplayName` 이 없거나 어색할 때만 덮어쓰는 예외 목록이다.
 * (한국어로 음차하지 않는다 — 축구 팀명은 영문 표기가 원문이고 오독이 적다.)
 */
const SHORT_OVERRIDE: Record<string, string> = {
  '86': 'Real Madrid',
  '101': 'Rayo',
  '110': 'Inter',
  '244': 'Betis',
  '89': 'Sociedad',
  '1068': 'Atlético',
  '87': 'Racing',
  '104': 'Roma',
  '124': 'Leipzig',
  '887': 'AEK',
  '2950': 'Schalke',
  '103': 'Milan',
  '331': 'Brighton',
  '349': 'Bournemouth',
  '357': 'Leeds',
  '360': 'Man United',
  '367': 'Tottenham',
  '392': 'Luton',
  '393': "Nott'm Forest",
  '382': 'Man City',
  'nat-uae': 'UAE',
  'nat-tri': 'Trinidad',
  'nat-rsa': 'South Africa',
};

/** 긴 이름을 자동으로 줄인다 (예외 목록에 없을 때) */
function shorten(name: string): string {
  return name
    .replace(/^(AFC|FC|SC|CF|AS|RC|CD|SD|UD|RCD)\s+/i, '')
    .replace(/\s+(FC|CF|AFC|SC)$/i, '')
    .replace(/\s+&\s+Hove Albion$/i, '')
    .replace(/\s+United$/i, (m) => m)
    .trim();
}

/**
 * @param id            ESPN team id
 * @param displayName   ESPN displayName (정식 표기)
 * @param shortFromApi  ESPN shortDisplayName (있으면 우선)
 * @returns [정식 표기, 축약 표기]
 */
export function teamName(id: string, displayName: string, shortFromApi?: string): [string, string] {
  const full = displayName;
  const short = SHORT_OVERRIDE[id] ?? shortFromApi ?? shorten(displayName);
  return [full, short];
}
