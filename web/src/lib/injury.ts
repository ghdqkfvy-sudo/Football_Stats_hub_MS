import type { Injury, InjuryEntry } from '../types/feedTypes';
import type { PlayerSeason } from './squad';
import type { Discipline } from './discipline';

/** 마우스를 올렸을 때 보이는 한 줄 — "부상 · 11월 중순 복귀 예상" */
export const injuryTitle = (inj: Injury) => {
  const what = inj.injName ? ` · ${inj.injName}` : '';
  return inj.doubtful ? `출전 불투명${what}` : `${inj.long ? '장기 부상' : '부상'}${what} · ${inj.ko}`;
};

/** 등번호 배지 자리의 마우스 올림 문구 */
export function badgeTitle(p: { inj?: Injury; disc?: Discipline }, kind: string): string | undefined {
  if (kind === 'red') return '다음 경기 출전 정지';
  if (kind === 'yellow') return '경고 누적 주의 — 1장 더 받으면 출전 정지';
  return p.inj ? injuryTitle(p.inj) : undefined;
}

export const fotmobImage = (id: string) => `https://images.fotmob.com/image_resources/playerimages/${id}.png`;

/**
 * 부상자 명단에만 있는 선수(시즌 내내 결장 — 호드리구 · 사비 시몬스 …) → 상세 카드용 선수.
 * 경기 기록은 0 이고, 이름 · 등번호 · 포지션 · 나이 · 국적 · 부상만 채운다.
 */
export function seasonFromInjury(x: InjuryEntry): PlayerSeason {
  return {
    id: `fm-${x.fm ?? x.name}`,
    name: x.name,
    jersey: x.jersey ?? 0,
    pos: x.pos ?? 'M',
    photo: x.fm ? fotmobImage(x.fm) : undefined,
    photoKind: 'espn',
    apps: 0, starts: 0, minutes: 0, goals: 0, assists: 0, points: 0, yellow: 0, red: 0,
    age: x.age ?? undefined,
    nat: x.nat ?? undefined,
    inj: { ret: x.ret, ko: x.ko, doubtful: x.doubtful, long: x.long, kind: x.kind, injName: x.injName },
    slots: {}, modalSlot: 0, posPlaces: {}, posAny: {}, modalPos: '',
    byComp: [], recent: [], realMinutes: false, score: 0,
  };
}
