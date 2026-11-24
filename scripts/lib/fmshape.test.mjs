import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lineupShape } from './fmshape.mjs';

/* 레알 vs PSV(2026-11-24) FotMob 좌표 그대로 — ESPN 은 이 경기를 4-3-3 으로 줬다 */
const p = (name, x, y) => ({ id: name, name, verticalLayout: { x, y } });
const rma = {
  content: {
    lineup: {
      homeTeam: {
        id: 8633, formation: '4-2-3-1',
        starters: [
          p('Courtois', 0.5, 0.1),
          p('Valverde', 0.13, 0.292), p('Militao', 0.38, 0.292), p('Rudiger', 0.63, 0.292), p('Cucurella', 0.88, 0.292),
          p('Silva', 0.3, 0.485), p('Tchouameni', 0.7, 0.485),
          p('Diomande', 0.16, 0.678), p('Guler', 0.5, 0.678), p('Vinicius', 0.84, 0.678),
          p('Mbappe', 0.5, 0.87),
        ],
      },
      awayTeam: { id: 8640, formation: '4-4-2', starters: [] },
    },
  },
};
const abbr = (shape, n) => shape.players.find((x) => x.name === n)?.abbr;

test('4-2-3-1 — 더블 볼란치는 ESPN 처럼 LM·RM, x 가 큰 쪽이 왼쪽', () => {
  const s = lineupShape(rma, 8633);
  assert.equal(s.formation, '4-2-3-1');
  assert.equal(abbr(s, 'Tchouameni'), 'LM');
  assert.equal(abbr(s, 'Silva'), 'RM');
  assert.equal(abbr(s, 'Cucurella'), 'LB');
  assert.equal(abbr(s, 'Valverde'), 'RB');
  assert.equal(abbr(s, 'Rudiger'), 'CD-L');
  assert.equal(abbr(s, 'Vinicius'), 'AM-L');
  assert.equal(abbr(s, 'Guler'), 'AM');
  assert.equal(abbr(s, 'Diomande'), 'AM-R');
  assert.equal(abbr(s, 'Mbappe'), 'F');
  assert.equal(abbr(s, 'Courtois'), 'G');
});

test('4-3-3 · 3-4-2-1 · 4-1-4-1 줄 약어', () => {
  const mk = (formation, rows) => {
    const starters = [p('GK', 0.5, 0.1)];
    rows.forEach((n, i) => { for (let k = 0; k < n; k++) starters.push(p(`r${i}c${k}`, 1 - (k + 0.5) / n, 0.3 + i * 0.15)); });
    return lineupShape({ content: { lineup: { homeTeam: { id: 1, formation, starters } } } }, 1);
  };
  assert.deepEqual(mk('4-3-3', [4, 3, 3]).players.map((x) => x.abbr).slice(5, 11), ['CM-L', 'CM', 'CM-R', 'LF', 'F', 'RF']);
  assert.deepEqual(mk('3-4-2-1', [3, 4, 2, 1]).players.map((x) => x.abbr).slice(1), ['CD-L', 'CD', 'CD-R', 'LM', 'CM-L', 'CM-R', 'RM', 'AM-L', 'AM-R', 'F']);
  assert.deepEqual(mk('4-1-4-1', [4, 1, 4, 1]).players.map((x) => x.abbr).slice(5, 10), ['DM', 'LM', 'CM-L', 'CM-R', 'RM']);
});

test('줄 수 · 인원이 포메이션과 안 맞거나 좌표가 없으면 null', () => {
  const bad = structuredClone(rma);
  bad.content.lineup.homeTeam.formation = '4-3-3';
  assert.equal(lineupShape(bad, 8633), null);
  const noXY = structuredClone(rma);
  delete noXY.content.lineup.homeTeam.starters[3].verticalLayout;
  assert.equal(lineupShape(noXY, 8633), null);
  assert.equal(lineupShape(rma, 999), null);
});
