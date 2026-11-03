import { useEffect, useState } from "react";
import { deleteTemplate, listTemplates, saveTemplate } from "../../api";
import type { TemplateRecord } from "../../types";

type TemplatesPickerProps = {
  projectId: string;
  currentBody: unknown;
  onApply: (body: unknown, templateName: string) => void;
  onClose: () => void;
};

export function TemplatesPicker({
  projectId,
  currentBody,
  onApply,
  onClose,
}: TemplatesPickerProps) {
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [status, setStatus] = useState("");

  const refresh = async () => {
    setTemplates(await listTemplates(projectId));
  };

  useEffect(() => {
    void refresh();
  }, [projectId]);

  const saveCurrent = async (scope: "app" | "project") => {
    const name = window.prompt(
      scope === "app" ? "App template name" : "Project template name",
      "Untitled template",
    );
    if (name === null) return;
    await saveTemplate({
      name,
      body: currentBody,
      scope,
      projectId: scope === "project" ? projectId : null,
    });
    setStatus(`Saved “${name.trim()}” (${scope})`);
    await refresh();
  };

  const remove = async (t: TemplateRecord) => {
    if (!window.confirm(`Delete template “${t.name}”?`)) return;
    await deleteTemplate(t.id, t.scope, t.projectId);
    await refresh();
  };

  return (
    <div className="embed-picker templates-picker" role="dialog" aria-label="Templates">
      <p className="muted tiny">
        Save the current page as a template, or replace this page’s body from a
        template.
      </p>
      <div className="templates-actions">
        <button type="button" className="primary" onClick={() => void saveCurrent("project")}>
          Save as project template
        </button>
        <button type="button" onClick={() => void saveCurrent("app")}>
          Save as app template
        </button>
      </div>
      {status && <p className="muted tiny">{status}</p>}
      <ul className="templates-list">
        {templates.length === 0 && (
          <li className="muted tiny">No templates yet.</li>
        )}
        {templates.map((t) => (
          <li key={`${t.scope}-${t.id}`}>
            <div className="template-row">
              <div>
                <strong>{t.name}</strong>{" "}
                <span className="muted tiny">{t.scope}</span>
              </div>
              <div className="template-row-actions">
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    onApply(t.body, t.name);
                    onClose();
                  }}
                >
                  Apply
                </button>
                <button type="button" className="ghost" onClick={() => void remove(t)}>
                  Delete
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <button type="button" className="ghost" onClick={onClose}>
        Close
      </button>
    </div>
  );
}
