import { describe, expect, it } from 'vitest';
import { oursFirst } from '../form';

describe('oursFirst — ESPN 최근 5경기 스코어를 우리 득점부터', () => {
  it('패배는 작은 점수가 먼저', () => {
    expect(oursFirst('3-0', 'L')).toEqual([0, 3]);
    expect(oursFirst('2-1', 'L')).toEqual([1, 2]);
  });
  it('승리는 큰 점수가 먼저 (원정 승리 포함)', () => {
    expect(oursFirst('4-3', 'W')).toEqual([4, 3]);
  });
  it('무승부·값 없음', () => {
    expect(oursFirst('2-2', 'D')).toEqual([2, 2]);
    expect(oursFirst('', 'W')).toEqual([undefined, undefined]);
  });
});
