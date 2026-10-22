#!/usr/bin/env node
/**
 * 점검 — FotMob 경기 상세의 선수별 경기 기록(슈팅 · 패스 · xG …) 모양 (2026-10-22). **로그만 남긴다.**
 * 오늘의 경기 호버 카드에 "슈팅 3 · 키패스 2 · 패스 87%" 를 넣으려면 어디에 어떤 이름으로 오는지 알아야 한다.
 * 사용: node scripts/probe-player-stats.mjs [FotMob 경기 id=5795484(토트넘 10-19)]
 */
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const id = process.argv[2] ?? '5795484';
const res = await fetch(`https://www.fotmob.com/api/data/matchDetails?matchId=${id}`, { headers: { accept: 'application/json', 'user-agent': UA } });
const md = await res.json();
const ps = md?.content?.playerStats;
console.log('content 키:', Object.keys(md?.content ?? {}).join(', '));
console.log('playerStats:', ps ? `${Object.keys(ps).length}명` : '없음');
const one = ps && (Object.values(ps).find((x) => !x.isGoalkeeper && x.stats?.length) ?? Object.values(ps)[0]);
const gk = ps && Object.values(ps).find((x) => x.isGoalkeeper && x.stats?.length);
if (gk) console.log('골키퍼 항목:', JSON.stringify(gk.stats).slice(0, 2500));
if (one) {
  console.log('선수 칸:', Object.keys(one).join(', '));
  console.log(JSON.stringify(one).slice(0, 6000));
}
const st = md?.content?.lineup?.homeTeam?.starters?.[1];
console.log('\n라인업 선수 performance 칸:', Object.keys(st?.performance ?? {}).join(', '));
console.log(JSON.stringify(st?.performance ?? {}).slice(0, 3000));
