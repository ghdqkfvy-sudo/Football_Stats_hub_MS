/**
 * 팀 일정 → iCalendar(.ics).
 *
 * 폰 캘린더에 "구독" 하면 새벽 경기 시각이 알아서 들어오고, 일정이 바뀌면
 * 캘린더가 주기적으로 다시 받아 따라간다. 파일은 배포 빌드 때
 * web/public/data/schedule-*.json(ESPN 원본)에서 만든다 — scripts/build-ics.mjs.
 *
 * 시각은 UTC(…Z)로 적는다. 캘린더 앱이 기기 시간대(한국이면 KST)로 바꿔 보여 준다.
 * 킥오프 시각이 미정(timeValid false)인 경기는 **하루 종일** 일정으로 —
 * ESPN 이 임의로 채운 시각을 진짜처럼 넣으면 알림이 엉뚱한 때 울린다.
 */

const KST_MS = 9 * 60 * 60 * 1000;
const MATCH_MS = 2 * 60 * 60 * 1000;   // 경기 길이 — 하프타임 포함 2시간

/** RFC 5545 텍스트 이스케이프 */
export const esc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');

/** 75 옥텟 줄 접기 (UTF-8 기준, 이어지는 줄은 공백 하나로 시작) */
export function fold(line) {
  const out = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}

const stamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const kstDate = (ms) => new Date(ms + KST_MS).toISOString().slice(0, 10).replace(/-/g, '');

/** ESPN 일정 이벤트 하나 → VEVENT 줄들. 필요한 값이 없으면 null */
export function eventLines(ev, now = Date.now()) {
  const c = ev?.competitions?.[0];
  const t = Date.parse(ev?.date ?? c?.date ?? '');
  if (!c || !Number.isFinite(t)) return null;
  const side = (h) => c.competitors?.find((x) => x.homeAway === h);
  const home = side('home');
  const away = side('away');
  if (!home || !away) return null;
  const name = (x) => x.team?.displayName ?? x.team?.name ?? '?';
  const state = c.status?.type?.state;
  const done = state === 'post';
  const score = (x) => x.score?.displayValue ?? x.score?.value;
  const vs = done && score(home) != null && score(away) != null
    ? `${name(home)} ${score(home)}-${score(away)} ${name(away)}`
    : `${name(home)} vs ${name(away)}`;
  const league = ev.league?.abbreviation || ev.league?.name || '';
  const timeValid = ev.timeValid !== false && c.timeValid !== false;

  const lines = [
    'BEGIN:VEVENT',
    `UID:${ev.id}@ms-stats-hub`,
    `DTSTAMP:${stamp(now)}`,
  ];
  if (timeValid) {
    lines.push(`DTSTART:${stamp(t)}`, `DTEND:${stamp(t + MATCH_MS)}`);
  } else {
    const d = kstDate(t);
    const next = kstDate(t + 24 * 60 * 60 * 1000);
    lines.push(`DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${next}`);
  }
  lines.push(`SUMMARY:${esc(`⚽ ${vs}${league ? ` · ${league}` : ''}`)}`);
  if (c.venue?.fullName) lines.push(`LOCATION:${esc(c.venue.fullName)}`);
  const notes = [league && `대회: ${ev.league?.name ?? league}`, !timeValid && '킥오프 시각 미정'].filter(Boolean);
  if (notes.length) lines.push(`DESCRIPTION:${esc(notes.join('\n'))}`);
  if (state === 'post') lines.push('STATUS:CONFIRMED');
  lines.push('END:VEVENT');
  return lines;
}

/** 일정 피드 JSON 전체 → .ics 본문 */
export function scheduleToIcs(json, calName, now = Date.now()) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MS Stats Hub//KO',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(calName)}`,
    'X-WR-TIMEZONE:Asia/Seoul',
    /* 캘린더 앱에 "몇 시간마다 다시 받아라" — 지원하는 앱만 따른다 */
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
  ];
  const seen = new Set();
  for (const ev of json?.events ?? []) {
    if (!ev?.id || seen.has(ev.id)) continue;
    seen.add(ev.id);
    const ls = eventLines(ev, now);
    if (ls) lines.push(...ls);
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
