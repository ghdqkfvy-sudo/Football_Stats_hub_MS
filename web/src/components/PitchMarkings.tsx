/**
 * 실제 경기장 규격(105 × 68 m)을 세로로 눕힌 라인 마킹.
 * 골라인이 아래, 공격 방향이 위다. 좌표는 모두 미터 단위라
 * 페널티 박스·아크·코너 호의 비율이 실제와 같다.
 */
export function PitchMarkings() {
  const W = 68;
  const H = 105;
  const PA_W = 40.32;   // 페널티 에어리어 폭
  const PA_D = 16.5;    // 페널티 에어리어 깊이
  const GA_W = 18.32;   // 골 에어리어 폭
  const GA_D = 5.5;
  const SPOT = 11;      // 페널티 마크
  const R = 9.15;       // 센터 서클 반지름

  const paX = (W - PA_W) / 2;
  const gaX = (W - GA_W) / 2;

  return (
    <svg
      className="pitch__svg"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        {/* 잔디 줄무늬 — 레퍼런스처럼 밝은 초록에 결이 또렷하게 보인다 */}
        <pattern id="turf" width={W} height={H / 9} patternUnits="userSpaceOnUse">
          <rect width={W} height={H / 18} fill="rgba(255,255,255,.055)" />
        </pattern>
        <linearGradient id="grass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2F9455" />
          <stop offset="48%" stopColor="#2A8A4F" />
          <stop offset="100%" stopColor="#248046" />
        </linearGradient>
        {/* 가장자리 그늘 — 조명 아래 잔디처럼 가운데가 밝다 */}
        <radialGradient id="vig" cx="50%" cy="46%" r="72%">
          <stop offset="55%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#04180E" stopOpacity=".38" />
        </radialGradient>
      </defs>

      <rect width={W} height={H} fill="url(#grass)" />
      <rect width={W} height={H} fill="url(#turf)" />
      <rect width={W} height={H} fill="url(#vig)" />

      <g fill="none" stroke="rgba(255,255,255,.62)" strokeWidth=".42" vectorEffect="non-scaling-stroke">
        {/* 터치라인 */}
        <rect x=".6" y=".6" width={W - 1.2} height={H - 1.2} />
        {/* 하프라인 + 센터 서클 */}
        <line x1=".6" y1={H / 2} x2={W - 0.6} y2={H / 2} />
        <circle cx={W / 2} cy={H / 2} r={R} />

        {/* 아래(우리 진영) 페널티 에어리어 */}
        <rect x={paX} y={H - PA_D} width={PA_W} height={PA_D} />
        <rect x={gaX} y={H - GA_D} width={GA_W} height={GA_D} />
        {/* 페널티 아크 — 박스 밖으로 나오는 부분만 */}
        <path
          d={`M ${W / 2 - 7.0} ${H - PA_D} A ${R} ${R} 0 0 0 ${W / 2 + 7.0} ${H - PA_D}`}
        />

        {/* 위(상대 진영) */}
        <rect x={paX} y="0" width={PA_W} height={PA_D} />
        <rect x={gaX} y="0" width={GA_W} height={GA_D} />
        <path d={`M ${W / 2 - 7.0} ${PA_D} A ${R} ${R} 0 0 1 ${W / 2 + 7.0} ${PA_D}`} />

        {/* 코너 호 */}
        <path d={`M .6 3.6 A 3 3 0 0 0 3.6 .6`} />
        <path d={`M ${W - 3.6} .6 A 3 3 0 0 0 ${W - 0.6} 3.6`} />
        <path d={`M .6 ${H - 3.6} A 3 3 0 0 1 3.6 ${H - 0.6}`} />
        <path d={`M ${W - 3.6} ${H - 0.6} A 3 3 0 0 1 ${W - 0.6} ${H - 3.6}`} />
      </g>

      {/* 페널티 마크 · 센터 마크 */}
      <g fill="rgba(255,255,255,.34)">
        <circle cx={W / 2} cy={H / 2} r=".6" />
        <circle cx={W / 2} cy={H - SPOT} r=".6" />
        <circle cx={W / 2} cy={SPOT} r=".6" />
      </g>

      {/* 골대 */}
      <g fill="none" stroke="rgba(255,255,255,.78)" strokeWidth=".55" vectorEffect="non-scaling-stroke">
        <rect x={W / 2 - 3.66} y={H - 0.6} width="7.32" height="1.6" />
        <rect x={W / 2 - 3.66} y={-1} width="7.32" height="1.6" />
      </g>
    </svg>
  );
}
