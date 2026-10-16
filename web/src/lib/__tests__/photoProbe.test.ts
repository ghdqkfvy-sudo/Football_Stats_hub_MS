import { describe, expect, it } from 'vitest';
import { claimValue, fotmobImage, pickFootballer, sofascoreImage } from '../photoProbe';

describe('사진 소스 비교 (위키데이터 → FotMob · SofaScore)', () => {
  it('이름 검색 결과에서 축구 선수 항목만 고른다', () => {
    expect(pickFootballer([
      { id: 'Q1', description: 'South Korean singer' },
      { id: 'Q2', description: 'South Korean association football player' },
    ])).toBe('Q2');
    expect(pickFootballer([{ id: 'Q9', description: 'politician' }])).toBeNull();
    expect(pickFootballer(undefined)).toBeNull();
  });

  it('속성의 첫 문자열 값을 꺼낸다 — 없거나 속성을 못 찾았으면 null', () => {
    const ent = { claims: { P99: [{ mainsnak: { datavalue: { value: ' 212867 ' } } }] } };
    expect(claimValue(ent, 'P99')).toBe('212867');
    expect(claimValue(ent, 'P1')).toBeNull();
    expect(claimValue(ent, null)).toBeNull();
    expect(claimValue({ claims: { P99: [{ mainsnak: { datavalue: { value: 5 } } }] } }, 'P99')).toBeNull();
  });

  it('이미지 주소', () => {
    expect(fotmobImage('212867')).toBe('https://images.fotmob.com/image_resources/playerimages/212867.png');
    expect(sofascoreImage('96626')).toBe('https://img.sofascore.com/api/v1/player/96626/image');
  });
});
