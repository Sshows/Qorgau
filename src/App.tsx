import { Component, lazy, Suspense, useState } from "react";
import type { ReactNode } from "react";
import LiveWorkspace from "./LiveWorkspace";
const DemoWorkspace = lazy(() => import("./DemoWorkspace"));
class Boundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="live-failure">
        <h1>Не удалось открыть раздел</h1>
        <button onClick={() => location.reload()}>Обновить</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
export default function App() {
  const [demo, setDemo] = useState(false);
  return (
    <Boundary>
      {demo ? (
        <>
          <div className="live-demo-banner">
            <strong>DEMO · учебные данные</strong>
            <span>
              События этого режима не являются реальными происшествиями.
            </span>
            <button
              onClick={() => {
                setDemo(false);
                location.hash = "#overview";
              }}
            >
              Вернуться к реальным источникам
            </button>
          </div>
          <Suspense fallback={<p>Открываем учебный режим…</p>}>
            <DemoWorkspace />
          </Suspense>
        </>
      ) : (
        <LiveWorkspace
          onDemo={() => {
            setDemo(true);
            location.hash = "#overview";
          }}
        />
      )}
    </Boundary>
  );
}
