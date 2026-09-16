import type { CompetitionKey } from '../lib/types';
import bgRma from '../assets/bg-rma.jpg';
import bgChe from '../assets/bg-che.jpg';
import bgKor from '../assets/bg-kor.png';

/* ──────────────────────────────────────────────────────────────
   추적 대상 (팀 스위처)
   ESPN team id 는 실제 응답으로 검증됨:
   Real Madrid 86 / Chelsea 363 / South Korea 451
   ────────────────────────────────────────────────────────────── */

export type TargetId = 'real-madrid' | 'chelsea' | 'korea';
export type TargetKind = 'club' | 'national';

export interface TargetTheme {
  /** 큰 면적을 칠하는 진짜 구단 컬러 */
  brand: string;
  /** 어두운 배경 위 텍스트/보더용으로 밝기를 올린 변형 */
  accent: string;
  /**
   * 보조 컬러 — 그 팀의 두 번째 상징색.
   * 게이지 그라데이션의 반대쪽 끝에 쓴다. accent 하나로만 칠하면
   * 막대 세 개가 전부 같아 보여 어떤 지표인지 구분이 안 된다.
   */
  secondary: string;
  /** accent 위에 올릴 글자색 */
  onAccent: string;
  /** 헤더 글로우 그라디언트 */
  glow: string;
}

export interface Target {
  id: TargetId;
  kind: TargetKind;
  espnTeamId: string;
  /** 한국어 뉴스 검색어 (구글 뉴스 RSS) */
  newsQuery?: string;
  name: string;
  nameEn: string;
  /** 엠블럼 폴백 배지에 쓰는 ESPN 약어 */
  abbr: string;
  subtitle: string;
  crest: string;
  /** 배경 아트워크 */
  bg: string;
  /** photo = 꽉 채움 / flag = 가운데 정렬해 위쪽에 배치 */
  bgKind: 'photo' | 'flag';
  theme: TargetTheme;
  /** 이 팀이 참가하는 대회 — 팀순위 탭의 표시 순서 */
  competitions: CompetitionKey[];
  /** 리그 (순위표에서 이 팀을 하이라이트) */
  league?: CompetitionKey;
  /**
   * 이 팀 화면에서 쓰는 대회 색.
   * 자기 리그는 팀 컬러를 그대로 받고, 나머지 대회는 그 팀 컬러와
   * 충돌하지 않는 색을 배정한다. 덕분에 캘린더가 팀마다 하나의
   * 색 체계로 읽힌다.
   */
  palette: Record<string, string>;
}

export const CREST = (id: string) => `https://a.espncdn.com/i/teamlogos/soccer/500/${id}.png`;
export const COUNTRY_CREST = (code: string) =>
  `https://a.espncdn.com/i/teamlogos/countries/500/${code}.png`;

/**
 * ESPN 이 주는 값이 아쉬운 팀만 교정한다.
 * 국가대표는 엠블럼 대신 **국기**가 알아보기 쉽고, 약어도 ESPN 은 'KR' 을
 * 주지만 축구에서는 'KOR' 이 통용된다.
 */
export const TEAM_OVERRIDE: Record<string, { abbr?: string; logo?: string }> = {
  '451': { abbr: 'KOR', logo: COUNTRY_CREST('kor') },
};

export const TARGETS: Target[] = [
  {
    id: 'real-madrid',
    kind: 'club',
    espnTeamId: '86',
    newsQuery: '레알 마드리드',
    name: 'Real Madrid',
    nameEn: 'Real Madrid',
    abbr: 'RMA',
    subtitle: 'LALIGA · Champions League',
    crest: CREST('86'),
    bg: bgRma,
    bgKind: 'photo',
    theme: {
      brand: '#FEBE10',
      accent: '#FFCF3D',
      secondary: '#8B7BFF',   // 레알의 두 번째 색 — 보라/남색 계열
      onAccent: '#1A1300',
      glow: 'radial-gradient(90rem 40rem at 50% -18rem, rgba(254,190,16,.22), transparent 60%)',
    },
    league: 'esp.1',
    competitions: ['esp.1', 'uefa.champions', 'esp.copa_del_rey', 'esp.super_cup'],
    palette: {
      'esp.1': '#F5333F',            // LALIGA 브랜드 레드
      'uefa.champions': '#4C8DFF',
      'esp.copa_del_rey': '#F2B23E',
      'esp.super_cup': '#C084FC',
      'fifa.cwc': '#E879A6',
      'uefa.super_cup': '#A78BFA',
      'club.friendly': '#6B7789',
    },
  },
  {
    id: 'chelsea',
    kind: 'club',
    espnTeamId: '363',
    newsQuery: '첼시 FC',
    name: 'Chelsea',
    nameEn: 'Chelsea',
    abbr: 'CHE',
    subtitle: 'Premier League · Champions League',
    crest: CREST('363'),
    bg: bgChe,
    bgKind: 'photo',
    theme: {
      brand: '#034694',
      accent: '#5B9BFF',
      secondary: '#F5C451',   // 첼시 엠블럼의 금색
      onAccent: '#04122B',
      glow: 'radial-gradient(90rem 40rem at 50% -18rem, rgba(59,130,246,.26), transparent 60%)',
    },
    league: 'eng.1',
    // 이번 시즌 첼시는 챔피언스리그에 나가지 않는다
    competitions: ['eng.1', 'eng.fa', 'eng.league_cup'],
    palette: {
      'eng.1': '#A855F7',            // Premier League 브랜드 퍼플
      'uefa.champions': '#4C8DFF',
      'eng.fa': '#2ED3B7',
      'eng.league_cup': '#FFA53D',
      'fifa.cwc': '#E879A6',
      'uefa.super_cup': '#A78BFA',
      'club.friendly': '#6B7789',
    },
  },
  {
    id: 'korea',
    kind: 'national',
    espnTeamId: '451',
    newsQuery: '축구 국가대표팀 손흥민 이강인',
    name: '대한민국',
    nameEn: 'South Korea',
    abbr: 'KOR',
    subtitle: 'National Team · Koreans Abroad',
    crest: COUNTRY_CREST('kor'),
    bg: bgKor,
    bgKind: 'flag',
    theme: {
      brand: '#C8102E',
      accent: '#FF5C71',
      secondary: '#4C8DFF',   // 태극기의 청색
      onAccent: '#2A0006',
      glow: 'radial-gradient(90rem 40rem at 50% -18rem, rgba(200,16,46,.26), transparent 60%)',
    },
    competitions: ['afc.asian.cup', 'fifa.world', 'fifa.friendly'],
    palette: {
      'fifa.world': '#FF5C71',
      'afc.asian.cup': '#4CC9F0',
      'fifa.worldq.afc': '#FFB443',
      'fifa.friendly': '#7E8CA3',
    },
  },
];

export const getTarget = (id: TargetId) => TARGETS.find((t) => t.id === id)!;

/* ──────────────────────────────────────────────────────────────
   대회 메타 — 캘린더/배지의 색 구분
   ────────────────────────────────────────────────────────────── */

export interface CompetitionMeta {
  key: CompetitionKey;
  name: string;      // 한국어 표시명
  short: string;     // 캘린더 배지용 초단축
  color: string;
  /** ESPN 리그 앰블럼 (어두운 배경용 화이트 버전). 없으면 컬러 도트로 폴백한다. */
  logo?: string;
}

/**
 * ESPN 리그 로고. 500-dark 는 어두운 UI 용 화이트 버전이다.
 * (일부 대회는 dark 판이 없어 컬러 원본을 쓴다)
 */
const LL = (id: number, dark = true) =>
  `https://a.espncdn.com/i/leaguelogos/soccer/${dark ? '500-dark' : '500'}/${id}.png`;

const COMPS: CompetitionMeta[] = [
  { key: 'esp.1',            name: 'La Liga',           short: 'LL',  color: '#F5333F', logo: LL(15) },
  { key: 'eng.1',            name: 'Premier League',    short: 'PL',  color: '#A855F7', logo: LL(23) },
  { key: 'uefa.champions',   name: 'Champions League',  short: 'UCL', color: '#4C8DFF', logo: LL(2) },
  { key: 'uefa.europa',      name: 'Europa League',     short: 'UEL', color: '#FF9F2E', logo: LL(2310) },
  { key: 'uefa.europa.conf', name: 'Conference League', short: 'UECL', color: '#3FD17A', logo: LL(20296) },
  { key: 'esp.copa_del_rey', name: 'Copa del Rey',      short: 'CDR', color: '#F2C14E', logo: LL(80) },
  { key: 'esp.super_cup',    name: 'Supercopa',         short: 'SUP', color: '#C084FC', logo: LL(431, false) },
  { key: 'eng.fa',           name: 'FA Cup',            short: 'FA',  color: '#3FD7C0', logo: LL(40) },
  { key: 'eng.league_cup',   name: 'EFL Cup',           short: 'EFL', color: '#8B7BFF', logo: LL(41) },
  { key: 'fifa.world',       name: 'FIFA World Cup',    short: 'WC',  color: '#FFD166', logo: LL(4) },
  { key: 'fifa.worldq.afc',  name: 'World Cup Qualifier', short: 'WCQ', color: '#F4A261', logo: LL(62) },
  { key: 'afc.asian.cup',    name: 'AFC Asian Cup',     short: 'AC',  color: '#4CC9F0', logo: LL(2243) },
  { key: 'fifa.friendly',    name: 'International Friendly', short: 'FRD', color: '#8FA0B8', logo: LL(53) },
  { key: 'club.friendly',    name: 'Club Friendly',     short: 'CF',  color: '#7A8699' },
  { key: 'fifa.cwc',         name: 'Club World Cup',    short: 'CWC', color: '#E879A6', logo: LL(1932) },
  { key: 'uefa.super_cup',   name: 'UEFA Super Cup',    short: 'USC', color: '#A78BFA', logo: LL(1272) },
];

const COMP_MAP = new Map(COMPS.map((c) => [c.key, c]));

export function comp(key: CompetitionKey): CompetitionMeta {
  return (
    COMP_MAP.get(key) ?? {
      key,
      name: key,
      short: key.slice(0, 3).toUpperCase(),
      color: '#8FA0B8',
    }
  );
}

export const ALL_COMPETITIONS = COMPS;

/** espnTeamId → 스냅샷 파일 슬러그. 데이터 파일 이름이 타깃 정의에서 나온다. */
export const SLUG_BY_TEAM_ID: Record<string, string> = Object.fromEntries(
  TARGETS.map((t) => [t.espnTeamId, t.id]),
);
