/**
 * national.mjs 검증 — 로스터 조각은 실제 ESPN summary 응답에서 떠 온 것이다
 * (2026-10, 한국-에콰도르 401905196 / fifa.friendly, 한국 451).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clockMinute, fullLength, nationalFor, nationalLineup } from './national.mjs';

const st = (o) => Object.entries(o).map(([name, value]) => ({ name, value }));
const play = (dv, substitution) => ({ clock: { displayValue: dv }, substitution });

const SUMMARY = {
  header: { competitions: [{ status: { type: { detail: 'FT', shortDetail: 'FT', description: 'Full Time' } } }] },
  rosters: [{
    team: { id: '451' },
    roster: [
      // 선발 → 75' 교체 아웃, 도움 1 (54' 득점 play 는 substitution:false)
      { athlete: { id: '157688' }, starter: true, subbedIn: false, subbedOut: true,
        plays: [play("54'", false), play("75'", true)],
        stats: st({ appearances: 1, totalGoals: 0, goalAssists: 1, yellowCards: 0, redCards: 0 }) },
      // 선발 풀타임
      { athlete: { id: '274197' }, starter: true, subbedIn: false, subbedOut: false, plays: [],
        stats: st({ appearances: 1, totalGoals: 0, goalAssists: 0, yellowCards: 0 }) },
      // 85' 교체 투입 → 86' 득점
      { athlete: { id: '271702' }, starter: false, subbedIn: true, subbedOut: false,
        plays: [play("85'", true), play("86'", false)],
        stats: st({ appearances: 1, totalGoals: 1, goalAssists: 0 }) },
      // 경고 시각이 "45'+1'" — 교체가 아니므로 시간 계산에 끼면 안 된다
      { athlete: { id: '297788' }, starter: true, subbedIn: false, subbedOut: true,
        plays: [play("45'+1'", false), play("65'", true)],
        stats: st({ appearances: 1, yellowCards: 1 }) },
      // 명단에만 든 선수
      { athlete: { id: '362208' }, starter: false, subbedIn: false, subbedOut: false, plays: [],
        stats: st({ appearances: 0 }) },
    ],
  }, {
    team: { id: '209' },
    roster: [{ athlete: { id: '999' }, starter: true, subbedIn: false, subbedOut: false, plays: [], stats: [] }],
  }],
};

test('clockMinute — 추가시간은 버리고 분만', () => {
  assert.equal(clockMinute("75'"), 75);
  assert.equal(clockMinute("45'+1'"), 45);
  assert.equal(clockMinute(''), undefined);
});

test('fullLength — 연장전이면 120', () => {
  assert.equal(fullLength(SUMMARY), 90);
  assert.equal(fullLength({ header: { competitions: [{ status: { type: { detail: 'AET' } } }] } }), 120);
});

test('nationalLineup — 뛴 선수만, 출전 시간은 교체 시각으로', () => {
  const l = nationalLineup(SUMMARY, '451');
  assert.deepEqual(Object.keys(l).sort(), ['157688', '271702', '274197', '297788']);
  assert.deepEqual(l['157688'], { started: true, minutes: 75, goals: 0, assists: 1, yellow: false, red: false });
  assert.equal(l['274197'].minutes, 90);
  assert.deepEqual(l['271702'], { started: false, subIn: 85, minutes: 5, goals: 1, assists: 0, yellow: false, red: false });
  assert.equal(l['297788'].minutes, 65);
  assert.equal(l['297788'].yellow, true);
  assert.equal(l['999'], undefined, '상대 팀 선수는 넣지 않는다');
});

test('nationalFor — 합계는 올해만, 최근 경기는 연도 무관', () => {
  const games = [
    { eventId: '3', date: '2026-10-02T11:00Z', competition: 'fifa.friendly', opponent: 'Venezuela', opponentId: '1', score: '0 : 0', result: 'D',
      lineup: { a: { started: true, minutes: 90, goals: 0, assists: 0, yellow: false } } },
    { eventId: '2', date: '2026-09-24T11:00Z', competition: 'fifa.friendly', opponent: 'Ecuador', opponentId: '2', score: '3 : 0', result: 'W',
      lineup: { a: { started: false, subIn: 60, minutes: 30, goals: 1, assists: 1, yellow: false } } },
    { eventId: '1', date: '2025-11-18T11:00Z', competition: 'fifa.friendly', opponent: 'Ghana', opponentId: '3', score: '1 : 0', result: 'W',
      lineup: { a: { started: true, minutes: 90, goals: 1, assists: 0, yellow: false } } },
  ];
  const n = nationalFor(games, 'a', 2026);
  assert.equal(n.apps, 2);
  assert.equal(n.starts, 1);
  assert.equal(n.goals, 1);
  assert.equal(n.assists, 1);
  assert.deepEqual(n.recent.map((g) => g.eventId), ['3', '2', '1']);
  assert.equal(n.recent[1].subIn, 60);
  assert.equal(nationalFor(games, 'nobody', 2026).apps, 0);
});
