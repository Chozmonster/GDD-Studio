import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { defaultProjectsDir, pickDirectory } from "../api";

type NewProjectDialogProps = {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, parentDir: string) => Promise<void>;
};

export function NewProjectDialog({
  open,
  onClose,
  onCreate,
}: NewProjectDialogProps) {
  const [name, setName] = useState("");
  const [parentDir, setParentDir] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setError(null);
    void defaultProjectsDir().then(setParentDir).catch(() => setParentDir(""));
  }, [open]);

  if (!open) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onCreate(name, parentDir);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <form
        className="modal-panel"
        role="dialog"
        aria-labelledby="new-project-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void submit(e)}
      >
        <h2 id="new-project-title">New Project</h2>
        <label className="field">
          <span>Name</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Game Design Doc"
            required
          />
        </label>
        <label className="field">
          <span>Location</span>
          <div className="path-row">
            <input
              value={parentDir}
              onChange={(e) => setParentDir(e.target.value)}
              required
            />
            <button
              type="button"
              onClick={() =>
                void pickDirectory(parentDir || undefined).then((p) => {
                  if (p) setParentDir(p);
                })
              }
            >
              Browse…
            </button>
          </div>
        </label>
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={busy || !name.trim()}>
            {busy ? "Creating…" : "Create & Open"}
          </button>
        </div>
      </form>
    </div>
  );
}
