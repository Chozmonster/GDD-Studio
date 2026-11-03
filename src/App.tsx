import { useState } from "react";
import { isOptionsWindowRoute } from "./api";
import { EditorShell } from "./components/EditorShell";
import { Launcher } from "./components/Launcher";
import { OptionsPanel } from "./components/OptionsPanel";
import type { ProjectRecord } from "./types";
import "./App.css";

function App() {
  if (isOptionsWindowRoute()) {
    return (
      <div className="options-route">
        <OptionsPanel asWindow />
      </div>
    );
  }

  const [active, setActive] = useState<ProjectRecord | null>(null);

  if (active) {
    return (
      <EditorShell project={active} onBack={() => setActive(null)} />
    );
  }

  return <Launcher onOpenProject={setActive} />;
}

export default App;
