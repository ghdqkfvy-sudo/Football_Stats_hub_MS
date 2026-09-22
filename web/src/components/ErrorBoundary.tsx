import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * 탭 하나가 터져도 앱 전체가 흰 화면이 되지 않게 막는다.
 *
 * ⚠️ 왜 필요한가: 이 앱의 모든 값은 문서도 버전도 없는 ESPN 비공식 API 에서
 * 온다. README 가 여러 번 적어 둔 대로 ESPN 은 응답 모양을 말없이 바꾸고,
 * 실제로 그때마다 파싱이 깨졌다(gamelog 갈래가 사라진 일, athlete 에 team
 * 키가 없던 일…). 방어적 파싱을 이만큼 해 두고도 최후 방어선이 없어서,
 * 한 군데서 던지면 화면 전체가 빈 페이지가 됐다.
 *
 * 여기서 잡으면 다른 탭은 그대로 쓸 수 있고, 무엇이 터졌는지도 보인다 —
 * "데이터가 없으면 없다고 말한다" 는 이 프로젝트의 원칙과 같은 태도다.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode; label?: string },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 콘솔에는 원본을 그대로 남긴다 — 화면 문구로는 원인을 못 찾는다
    console.error(`[${this.props.label ?? 'app'}] 렌더 중 오류`, error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="page">
        <div className="empty">
          <h3>{this.props.label ? `${this.props.label} 화면을 그리지 못했습니다` : '화면을 그리지 못했습니다'}</h3>
          <p>
            받아 온 데이터가 예상과 다른 모양이라 이 화면만 멈췄습니다. 다른 탭은 그대로 쓸 수 있습니다.
            <br />
            <code>{error.message}</code>
          </p>
          <p>
            <button className="tab" onClick={() => this.setState({ error: null })}>
              다시 시도
            </button>
          </p>
        </div>
      </div>
    );
  }
}
