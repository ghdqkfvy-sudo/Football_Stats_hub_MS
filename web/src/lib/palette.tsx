import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { comp, type Target } from '../config/targets';

/**
 * 대회 색을 화면 전체에서 하나로 통일한다.
 *
 * 캘린더 막대, 대회 배지, 범례가 전부 이 한 곳에서 색을 받아 가므로
 * "같은 대회인데 자리마다 색이 다른" 문제가 생기지 않는다.
 * 팀을 바꾸면 팔레트도 그 팀 기준으로 통째로 바뀐다.
 */
interface PaletteApi {
  color: (competition: string) => string;
  name: (competition: string) => string;
  logo: (competition: string) => string | undefined;
}

const Ctx = createContext<PaletteApi>({
  color: (k) => comp(k).color,
  name: (k) => comp(k).name,
  logo: (k) => comp(k).logo,
});

export function PaletteProvider({ target, children }: { target: Target; children: ReactNode }) {
  const api = useMemo<PaletteApi>(
    () => ({
      color: (k) => target.palette[k] ?? comp(k).color,
      name: (k) => comp(k).name,
      logo: (k) => comp(k).logo,
    }),
    [target],
  );
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export const usePalette = () => useContext(Ctx);
