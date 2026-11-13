import { describe, expect, it } from 'vitest';
import { buildWeekly, minutesShare, ourScoreOf, weekLabel, weeksWithGames } from '../weekly';
import type { KoreanGame, KoreanPlayer } from '../../types/feedTypes';

const g = (date: string, over: Partial<KoreanGame> = {}): KoreanGame => ({
  eventId: date, competition: 'esp.1', date, opponent: 'X', opponentId: '1', score: '1-0', result: 'W',
  started: true, minutes: 90, goals: 0, assists: 0, yellow: false, ...over,
} as KoreanGame);
const p = (id: string, recent: KoreanGame[]): KoreanPlayer => ({
  id, name: id, nameKo: id, pos: 'M', age: 25, clubId: '1', club: 'C', league: 'esp.1', leagueName: 'La Liga', stats: [], recent,
});

/* 2026-11-03 은 화요일 — 한 주는 화~월(KST) */
const son = p('son', [g('', { goals: 2 })]);                                   // 날짜 없음 — 어느 주인지 모른다
const lee = p('lee', [g('2026-11-08T20:00Z', { minutes: 60, rating: 6.6 }), g('2026-11-03T20:00Z', { minutes: 31, rating: 5.9 }), g('2026-10-31T12:00Z')]);
const kim = p('kim', [g('2026-11-07T12:00Z', { goals: 1, minutes: 74, rating: 7.5 })]);
const um = p('um', [g('2026-11-07T12:00Z', { minutes: 20, rating: 9.0 })]);

describe('weeksWithGames', () => {
  it('기록이 있는 주를 최신순으로 — 일요일 밤 경기(KST 월요일 새벽)는 그 주말에 묶인다', () => {
    /* 11.8 20:00Z = KST 11.9(월) 05:00 → 11.3(화)~11.9(월) 주. 10.31 12:00Z = KST 10.31(토) → 10.27 주 */
    expect(weeksWithGames([son, lee, kim])).toEqual(['2026-11-03', '2026-10-27']);
  });
});

describe('buildWeekly', () => {
  const w = buildWeekly([son, lee, kim, um], '2026-11-03');
  it('그 주 경기만 모으고, 공격 포인트 → 평점 순', () => {
    /* 주간 최고(kim)가 맨 앞, 나머지는 공격 포인트 → 평점 순 */
    expect(w.rows.map((r) => r.player.id)).toEqual(['kim', 'um', 'lee']);
    expect(w.rows[2]).toMatchObject({ minutes: 91, rating: 6.3 });   // 11.3 + 11.8 두 경기
    expect(w.goals).toBe(1);
    expect(w.end).toBe('2026-11-09');
  });
  it('기록 없는 선수는 따로, 날짜 없는 경기는 세지 않는다', () => {
    expect(w.idle.map((x) => x.id)).toEqual(['son']);
  });
  it('주간 최고 — 60분 이상 뛴 선수 가운데 평점이 가장 높은 선수', () => {
    expect(w.best?.player.id).toBe('kim');   // um 은 9.0 이지만 20분
  });
  it('라벨', () => {
    expect(weekLabel(w)).toBe('11.3 ~ 11.9');
  });
});

describe('ourScoreOf / minutesShare', () => {
  it('승패로 우리 득점을 앞에 둔다', () => {
    expect(ourScoreOf({ score: '1 : 2', result: 'L' })).toBe('1-2');
    expect(ourScoreOf({ score: '1 : 2', result: 'W' })).toBe('2-1');
    expect(ourScoreOf({ score: '2 : 2', result: 'D' })).toBe('2-2');
    expect(ourScoreOf({ score: '', result: 'W' })).toBe('');
  });
  it('뛴 경기 전부 풀타임 대비 비율', () => {
    expect(minutesShare({ minutes: 135, games: [g('a'), g('b')] })).toBe(0.75);
    expect(minutesShare({ minutes: 0, games: [] })).toBe(0);
  });
  it('주간 최고가 공격 포인트 1위가 아니어도 맨 앞에 온다', () => {
    const scorer = p('s', [g('2026-11-07T12:00Z', { goals: 2, minutes: 90, rating: 7.0 })]);
    const star = p('t', [g('2026-11-07T12:00Z', { minutes: 90, rating: 8.8 })]);
    const w = buildWeekly([scorer, star], '2026-11-03');
    expect(w.rows.map((r) => r.player.id)).toEqual(['t', 's']);
  });
});
