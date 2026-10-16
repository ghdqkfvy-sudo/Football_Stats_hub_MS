import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normName, parseSubText, substitutionsFrom } from './subs.mjs';

const R = (id, name, starter = true) => ({ athlete: { id, displayName: name }, starter });
const ROSTER = [
  R('1', 'Alexander Isak'), R('2', 'Víctor Muñoz'), R('3', 'Cody Gakpo'),
  R('4', 'Bradley Barcola', false), R('5', 'Federico Chiesa', false), R('6', 'Rio Ngumoha', false),
];

test('normName: 악센트·대소문자 무시', () => {
  assert.equal(normName('Víctor Muñoz'), 'victor munoz');
});

test('parseSubText: 들어간 선수가 앞, 나간 선수가 뒤 (부상 꼬리말 포함)', () => {
  assert.deepEqual(parseSubText('Substitution, Liverpool. Bradley Barcola replaces Alexander Isak.'),
    { inName: 'Bradley Barcola', outName: 'Alexander Isak' });
  assert.deepEqual(parseSubText('Substitution, Liverpool. Federico Chiesa replaces Cody Gakpo because of an injury.'),
    { inName: 'Federico Chiesa', outName: 'Cody Gakpo' });
  assert.equal(parseSubText('Goal! Liverpool 1, Ipswich 0.'), null);
});

test('substitutionsFrom: 같은 분 두 명 교체도 문장으로 정확히 가른다 (2026-10 리버풀 09-04)', () => {
  const sum = {
    keyEvents: [
      { type: { type: 'substitution', text: 'Substitution' }, clock: { displayValue: "64'" },
        text: 'Substitution, Liverpool. Bradley Barcola replaces Víctor Muñoz.',
        participants: [{ athlete: { id: '2' } }, { athlete: { id: '4' } }] },   // 참가자 순서는 믿지 않는다
      { type: { text: 'Substitution' },
        text: 'Substitution, Liverpool. Federico Chiesa replaces Alexander Isak.' },
      { type: { text: 'Goal' }, text: 'Goal! Liverpool 1.' },
    ],
  };
  const m = substitutionsFrom(sum, ROSTER);
  assert.equal(m.get('4'), '2');
  assert.equal(m.get('5'), '1');
  assert.equal(m.size, 2);
});

test('substitutionsFrom: 이름 표기가 달라도 성으로 맞추고, 남은 한 명은 참가자로 채운다', () => {
  const sum = { commentary: [
    { text: 'Substitution, Liverpool. R. Ngumoha replaces C. Gakpo.',
      participants: [{ athlete: { id: '6' } }, { athlete: { id: '3' } }] },
  ] };
  assert.equal(substitutionsFrom(sum, ROSTER).get('6'), '3');
});

test('substitutionsFrom: 로스터의 subbedInFor 가 있으면 그것을 쓴다 · 상대 팀 교체는 무시', () => {
  const roster = [...ROSTER.slice(0, 3), { ...R('4', 'Bradley Barcola', false), subbedInFor: { athlete: { id: '3' } } }];
  const sum = { keyEvents: [{ type: { text: 'Substitution' }, text: 'Substitution, Ipswich. Liam Delap replaces George Hirst.' }] };
  const m = substitutionsFrom(sum, roster);
  assert.equal(m.get('4'), '3');
  assert.equal(m.size, 1);
});
