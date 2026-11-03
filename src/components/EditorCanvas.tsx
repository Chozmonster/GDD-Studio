import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  listFlowcharts,
  loadDocument,
  loadFlowchart,
  saveDocument,
  saveFlowchart,
  flowchartExists,
} from "../api";
import { emitFlowchartSaved } from "../lib/flowchartEvents";
import type { FlowchartSummary, ProjectRecord } from "../types";
import { FlowchartEmbed } from "./editor/flowchartEmbedExtension";

type EditorCanvasProps = {
  project: ProjectRecord;
  onOpenFlowchart?: (flowchartId: string) => void;
};

export function EditorCanvas({ project, onOpenFlowchart }: EditorCanvasProps) {
  const [status, setStatus] = useState("Loading…");
  const [flowcharts, setFlowcharts] = useState<FlowchartSummary[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const saveTimer = useRef<number | null>(null);

  const editor = useEditor(
    {
      extensions: [
        StarterKit,
        Placeholder.configure({
          placeholder: "Write your GDD here…",
        }),
        FlowchartEmbed.configure({
          projectId: project.id,
          onOpenFlowchart,
        }),
      ],
      content: "",
      editorProps: {
        attributes: {
          class: "gdd-prose",
          "aria-label": "Document editor",
        },
      },
      onUpdate: ({ editor: ed }) => {
        if (saveTimer.current) window.clearTimeout(saveTimer.current);
        saveTimer.current = window.setTimeout(() => {
          void saveDocument(project.id, ed.getJSON())
            .then(() => setStatus(`Saved ${new Date().toLocaleTimeString()}`))
            .catch((e) =>
              setStatus(e instanceof Error ? e.message : String(e)),
            );
        }, 500);
      },
    },
    [project.id, onOpenFlowchart],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [doc, list] = await Promise.all([
          loadDocument(project.id),
          listFlowcharts(project.id),
        ]);
        if (cancelled) return;
        setFlowcharts(list);
        editor?.commands.setContent(doc as object);
        setStatus("Ready");
      } catch (e) {
        if (!cancelled) {
          setStatus(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [project.id, editor]);

  const refreshList = useCallback(async () => {
    setFlowcharts(await listFlowcharts(project.id));
  }, [project.id]);

  const insertFlowchart = async (flowchartId: string) => {
    if (!(await flowchartExists(project.id, flowchartId))) {
      const doc = await loadFlowchart(project.id, flowchartId);
      await saveFlowchart(project.id, flowchartId, doc);
      emitFlowchartSaved(project.id, flowchartId, doc);
    }
    editor?.chain().focus().insertFlowchartEmbed(flowchartId).run();
    setPickerOpen(false);
    setStatus(`Embedded flowchart “${flowchartId}”`);
  };

  if (!editor) {
    return (
      <section className="editor-shell">
        <p className="muted">{status}</p>
      </section>
    );
  }

  return (
    <section className="editor-shell" aria-label={`Editing ${project.name}`}>
      <header className="editor-toolbar" role="toolbar" aria-label="Formatting">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          aria-pressed={editor.isActive("bold")}
        >
          Bold
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          aria-pressed={editor.isActive("italic")}
        >
          Italic
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          aria-pressed={editor.isActive("heading", { level: 2 })}
        >
          H2
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          aria-pressed={editor.isActive("bulletList")}
        >
          List
        </button>
        <button
          type="button"
          className="primary"
          onClick={() => {
            void refreshList().then(() => setPickerOpen(true));
          }}
        >
          Insert flowchart
        </button>
        <span className="muted tiny toolbar-status">{status}</span>
      </header>

      {pickerOpen && (
        <div className="embed-picker" role="dialog" aria-label="Insert flowchart">
          <p className="muted tiny">Embed a live reference (updates when the flowchart is edited).</p>
          <ul>
            {flowcharts.map((f) => (
              <li key={f.id}>
                <button type="button" onClick={() => void insertFlowchart(f.id)}>
                  {f.name} <span className="muted tiny">({f.id})</span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="ghost" onClick={() => setPickerOpen(false)}>
            Cancel
          </button>
        </div>
      )}

      <EditorContent editor={editor} className="editor-canvas" />
    </section>
  );
}
