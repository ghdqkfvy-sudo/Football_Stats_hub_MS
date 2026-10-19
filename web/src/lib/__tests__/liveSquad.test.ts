import { describe, expect, it } from 'vitest';
import { matchLivePlayer } from '../liveSquad';
import type { LivePlayer } from '../../types/feedTypes';
import type { PlayerSeason } from '../squad';

const ps = (id: string, name: string, jersey: number) => ({ id, name, jersey }) as PlayerSeason;
const lp = (name: string, no: number | null, last = name.split(' ').slice(-1)[0]) =>
  ({ id: 'fm', name, last, no, goals: 0, og: 0, assists: 0, cards: [], rating: null }) as unknown as LivePlayer;

const pool = [ps('1', 'Bruno Fernandes', 8), ps('2', 'Lee Kang-In', 19), ps('3', 'Lisandro Martínez', 6), ps('4', 'Emiliano Martínez', 23)];

describe('matchLivePlayer', () => {
  it('등번호 + 성', () => expect(matchLivePlayer(lp('Bruno Fernandes', 8), pool)?.id).toBe('1'));
  it('이름 순서가 달라도', () => expect(matchLivePlayer(lp('Kang-In Lee', null, 'Lee'), pool)?.id).toBe('2'));
  it('발음 부호 무시 + 등번호로 동명 구분', () => expect(matchLivePlayer(lp('Lisandro Martinez', 6), pool)?.id).toBe('3'));
  it('후보가 둘이면 포기', () => expect(matchLivePlayer(lp('X Martinez', null), pool)).toBeNull());
  it('없는 선수', () => expect(matchLivePlayer(lp('Bukayo Saka', 7), pool)).toBeNull());
});
