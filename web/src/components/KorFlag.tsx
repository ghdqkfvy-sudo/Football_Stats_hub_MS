import crestKor from '../assets/crest-kor.png';

/**
 * 코리안리거 표시 — 이름 옆 작은 태극기.
 * 소속팀 화면의 베스트 11·선수 목록과 Summary 주간 일정 이름표가 같이 쓴다.
 */
export function KorFlag({ className = '' }: { className?: string }) {
  return <img className={`korflag ${className}`} src={crestKor} alt="" aria-hidden="true" draggable={false} />;
}
