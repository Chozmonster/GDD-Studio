import { useEffect, useState } from "react";
import { isOptionsWindowRoute, setWindowRole } from "./api";
import { EditorShell } from "./components/EditorShell";
import { Launcher } from "./components/Launcher";
import { OptionsPanel } from "./components/OptionsPanel";
import type { ProjectRecord } from "./types";
import "./App.css";

function MainApp() {
  const [active, setActive] = useState<ProjectRecord | null>(null);

  useEffect(() => {
    void setWindowRole(active ? "editor" : "launcher");
  }, [active]);

  if (active) {
    return (
      <EditorShell project={active} onBack={() => setActive(null)} />
    );
  }

  return <Launcher onOpenProject={setActive} />;
}

function App() {
  if (isOptionsWindowRoute()) {
    return (
      <div className="options-route">
        <OptionsPanel asWindow />
      </div>
    );
  }

  return <MainApp />;
}

export default App;
