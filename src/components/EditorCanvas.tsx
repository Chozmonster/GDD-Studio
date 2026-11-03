import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import FontFamily from "@tiptap/extension-font-family";
import { TextStyle } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
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
import type { DocVariable, FlowchartSummary, ProjectRecord } from "../types";
import { DocumentMap } from "./editor/DocumentMap";
import { FlowchartEmbed } from "./editor/flowchartEmbedExtension";
import {
  FONT_FAMILY_OPTIONS,
  FONT_SIZE_OPTIONS,
  FontSize,
} from "./editor/fontSize";
import { VariableEmbed } from "./editor/variableEmbedExtension";
import { VariablesPanel } from "./editor/VariablesPanel";

type EditorCanvasProps = {
  project: ProjectRecord;
  onOpenFlowchart?: (flowchartId: string) => void;
};

function ToolbarDivider() {
  return <span className="toolbar-divider" aria-hidden />;
}

export function EditorCanvas({ project, onOpenFlowchart }: EditorCanvasProps) {
  const [status, setStatus] = useState("Loading…");
  const [flowcharts, setFlowcharts] = useState<FlowchartSummary[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const saveTimer = useRef<number | null>(null);
  const editorRef = useRef<Editor | null>(null);

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
        }),
        Underline,
        TextStyle,
        FontFamily,
        FontSize,
        TextAlign.configure({
          types: ["heading", "paragraph"],
        }),
        Placeholder.configure({
          placeholder: "Write your GDD here…",
        }),
        FlowchartEmbed.configure({
          projectId: project.id,
          onOpenFlowchart,
        }),
        VariableEmbed.configure({
          projectId: project.id,
        }),
      ],
      content: "",
      editorProps: {
        attributes: {
          class: "gdd-prose",
          "aria-label": "Document editor",
        },
        handleKeyDown: (_view, event) => {
          if (event.key !== "Tab") return false;
          const ed = editorRef.current;
          if (!ed?.isActive("listItem")) return false;
          event.preventDefault();
          if (event.shiftKey) {
            ed.chain().focus().liftListItem("listItem").run();
          } else {
            ed.chain().focus().sinkListItem("listItem").run();
          }
          return true;
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

  editorRef.current = editor;

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
    const named = flowcharts.find((f) => f.id === flowchartId)?.name ?? flowchartId;
    setStatus(`Embedded flowchart “${named}”`);
  };

  const insertVariable = (variable: DocVariable) => {
    editor?.chain().focus().insertVariableEmbed(variable.id, variable.name).run();
    setStatus(`Inserted {{${variable.name}}}`);
  };

  if (!editor) {
    return (
      <section className="editor-shell">
        <p className="muted">{status}</p>
      </section>
    );
  }

  const currentSize =
    (editor.getAttributes("textStyle").fontSize as string | undefined) ?? "";
  const currentFamily =
    (editor.getAttributes("textStyle").fontFamily as string | undefined) ?? "";

  return (
    <section className="editor-shell" aria-label={`Editing ${project.name}`}>
      <header className="editor-toolbar" role="toolbar" aria-label="Formatting">
        <div className="toolbar-group">
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
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            aria-pressed={editor.isActive("underline")}
          >
            Underline
          </button>
        </div>

        <ToolbarDivider />

        <div className="toolbar-group">
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            aria-pressed={editor.isActive("heading", { level: 1 })}
          >
            H1
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
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            aria-pressed={editor.isActive("heading", { level: 3 })}
          >
            H3
          </button>
        </div>

        <ToolbarDivider />

        <div className="toolbar-group">
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            aria-pressed={editor.isActive("bulletList")}
            title="Bullet list"
          >
            Bullets
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            aria-pressed={editor.isActive("orderedList")}
            title="Numbered list"
          >
            Numbered
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().sinkListItem("listItem").run()}
            disabled={!editor.can().sinkListItem("listItem")}
            title="Indent (Tab)"
          >
            Indent
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().liftListItem("listItem").run()}
            disabled={!editor.can().liftListItem("listItem")}
            title="Outdent (Shift+Tab)"
          >
            Outdent
          </button>
        </div>

        <ToolbarDivider />

        <div className="toolbar-group">
          <button
            type="button"
            onClick={() => editor.chain().focus().setTextAlign("left").run()}
            aria-pressed={editor.isActive({ textAlign: "left" })}
            title="Align left"
          >
            Left
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().setTextAlign("center").run()}
            aria-pressed={editor.isActive({ textAlign: "center" })}
            title="Align center"
          >
            Center
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().setTextAlign("right").run()}
            aria-pressed={editor.isActive({ textAlign: "right" })}
            title="Align right"
          >
            Right
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().setTextAlign("justify").run()}
            aria-pressed={editor.isActive({ textAlign: "justify" })}
            title="Justify"
          >
            Justify
          </button>
        </div>

        <ToolbarDivider />

        <label className="toolbar-select">
          <span className="visually-hidden">Font</span>
          <select
            aria-label="Font family"
            value={currentFamily}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) editor.chain().focus().unsetFontFamily().run();
              else editor.chain().focus().setFontFamily(v).run();
            }}
          >
            <option value="">Font</option>
            {FONT_FAMILY_OPTIONS.map((f) => (
              <option key={f.label} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>

        <label className="toolbar-select">
          <span className="visually-hidden">Size</span>
          <select
            aria-label="Font size"
            value={currentSize}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) editor.chain().focus().unsetFontSize().run();
              else editor.chain().focus().setFontSize(v).run();
            }}
          >
            <option value="">Size</option>
            {FONT_SIZE_OPTIONS.map((s) => (
              <option key={s.label} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <ToolbarDivider />

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
          <p className="muted tiny">
            Embed a live reference (updates when the flowchart is edited).
          </p>
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

      <div className="editor-body">
        <DocumentMap editor={editor} />
        <EditorContent editor={editor} className="editor-canvas" />
        <VariablesPanel projectId={project.id} onInsert={insertVariable} />
      </div>
    </section>
  );
}
