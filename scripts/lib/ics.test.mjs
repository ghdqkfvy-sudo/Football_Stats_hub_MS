import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, fold, eventLines, scheduleToIcs } from './ics.mjs';

const ev = (over = {}) => ({
  id: '42', date: '2026-10-14T19:00Z', timeValid: true,
  league: { name: 'UEFA Champions League', abbreviation: 'UCL' },
  competitions: [{
    venue: { fullName: 'Olimpico' },
    status: { type: { state: 'pre' } },
    competitors: [
      { homeAway: 'home', team: { displayName: 'AS Roma' } },
      { homeAway: 'away', team: { displayName: 'Real Madrid' } },
    ],
  }],
  ...over,
});

test('이스케이프 — 쉼표·세미콜론·줄바꿈', () => {
  assert.equal(esc('a,b;c\nd'), 'a\\,b\\;c\\nd');
});

test('75 옥텟에서 접는다 (한글 3바이트 포함)', () => {
  const line = 'SUMMARY:' + '가'.repeat(40);
  for (const part of fold(line).split('\r\n')) assert.ok(Buffer.byteLength(part) <= 75);
});

test('예정 경기 — UTC 시각, 2시간, 장소', () => {
  const ls = eventLines(ev(), 0);
  assert.ok(ls.includes('DTSTART:20261014T190000Z'));
  assert.ok(ls.includes('DTEND:20261014T210000Z'));
  assert.ok(ls.some((l) => l.startsWith('SUMMARY:') && l.includes('AS Roma vs Real Madrid')));
  assert.ok(ls.includes('LOCATION:Olimpico'));
});

test('시각 미정 — KST 날짜 하루 종일', () => {
  const ls = eventLines(ev({ date: '2026-10-14T19:00Z', timeValid: false }), 0);
  assert.ok(ls.includes('DTSTART;VALUE=DATE:20261015'));   // UTC 19시 = KST 다음날 04시
  assert.ok(ls.includes('DTEND;VALUE=DATE:20261016'));
});

test('종료 경기 — 스코어가 제목에', () => {
  const e = ev();
  e.competitions[0].status.type.state = 'post';
  e.competitions[0].competitors[0].score = { value: 1, displayValue: '1' };
  e.competitions[0].competitors[1].score = { value: 2, displayValue: '2' };
  assert.ok(eventLines(e, 0).some((l) => l.includes('AS Roma 1-2 Real Madrid')));
});

test('달력 전체 — 중복 id 는 한 번만', () => {
  const ics = scheduleToIcs({ events: [ev(), ev()] }, 'Real Madrid', 0);
  assert.equal(ics.match(/BEGIN:VEVENT/g).length, 1);
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
});
