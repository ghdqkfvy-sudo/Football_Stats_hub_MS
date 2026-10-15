import { describe, expect, it } from 'vitest';
import { outcomeOf, runLabel } from '../dispatch';

describe('outcomeOf — GitHub 응답 상태', () => {
  it('204 는 성공, 401 은 토큰 문제, 403/404 는 권한 문제', () => {
    expect(outcomeOf(204)).toBe('ok');
    expect(outcomeOf(200)).toBe('ok');
    expect(outcomeOf(401)).toBe('unauthorized');
    expect(outcomeOf(403)).toBe('forbidden');
    expect(outcomeOf(404)).toBe('forbidden');
    expect(outcomeOf(500)).toBe('error');
  });
});

describe('runLabel — 최근 실행 한 줄', () => {
  const now = Date.parse('2026-10-16T09:00:00Z');
  const run = (status: string, conclusion: string | null, at = '2026-10-16T08:48:00Z') =>
    ({ status, conclusion, createdAt: at, updatedAt: at });

  it('실행 중은 몇 분째인지', () => {
    expect(runLabel(run('in_progress', null), now)).toEqual({ text: '실행 중 · 12분째', tone: 'busy' });
  });
  it('대기·완료·실패', () => {
    expect(runLabel(run('queued', null), now).text).toBe('대기 중');
    expect(runLabel(run('completed', 'success'), now)).toEqual({ text: '완료 · 12분 전', tone: 'ok' });
    expect(runLabel(run('completed', 'failure', '2026-10-16T06:30:00Z'), now)).toEqual({ text: '실패 · 2시간 전', tone: 'bad' });
  });
  it('기록 없음', () => {
    expect(runLabel(null, now).tone).toBe('idle');
  });
});
