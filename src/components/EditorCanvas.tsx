import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import FontFamily from "@tiptap/extension-font-family";
import { TextStyle } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createRgdSheet,
  flowchartExists,
  listFlowcharts,
  listRgdSheets,
  loadDocument,
  loadFlowchart,
  loadRgdSheet,
  saveDocument,
  saveFlowchart,
  saveRgdSheet,
} from "../api";
import { emitFlowchartSaved } from "../lib/flowchartEvents";
import { emitRgdSheetSaved } from "../lib/rgdEvents";
import type {
  DocVariable,
  FlowchartSummary,
  ProjectRecord,
  RgdSheetSummary,
} from "../types";
import { DocumentMap } from "./editor/DocumentMap";
import { FlowchartEmbed } from "./editor/flowchartEmbedExtension";
import {
  FONT_FAMILY_OPTIONS,
  FONT_SIZE_OPTIONS,
  FontSize,
} from "./editor/fontSize";
import { migrateRgdBlocksInDocument } from "./editor/rgd/migrateRgdBlocks";
import { RgdBlock } from "./editor/rgd/rgdBlockExtension";
import { RgdSheetEmbed } from "./editor/rgd/rgdSheetEmbedExtension";
import {
  emptyRgdSheetDocument,
  normalizeRgdSheet,
} from "./editor/rgd/rgdSheetModel";
import { VariableEmbed } from "./editor/variableEmbedExtension";
import { VariablesPanel } from "./editor/VariablesPanel";

type EditorCanvasProps = {
  project: ProjectRecord;
  onOpenFlowchart?: (flowchartId: string) => void;
  onOpenRgdSheet?: (sheetId: string) => void;
};

function ToolbarDivider() {
  return <span className="toolbar-divider" aria-hidden />;
}

export function EditorCanvas({
  project,
  onOpenFlowchart,
  onOpenRgdSheet,
}: EditorCanvasProps) {
  const [status, setStatus] = useState("Loading…");
  const [flowcharts, setFlowcharts] = useState<FlowchartSummary[]>([]);
  const [rgdSheets, setRgdSheets] = useState<RgdSheetSummary[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [rgdPickerOpen, setRgdPickerOpen] = useState(false);
  const saveTimer = useRef<number | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const migratedRef = useRef(false);

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
        RgdSheetEmbed.configure({
          projectId: project.id,
          onOpenRgdSheet,
        }),
        // Legacy node — migrate-on-open replaces these with sheet cards.
        RgdBlock.configure({
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
    [project.id, onOpenFlowchart, onOpenRgdSheet],
  );

  editorRef.current = editor;

  useEffect(() => {
    migratedRef.current = false;
  }, [project.id]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [doc, list, sheets] = await Promise.all([
          loadDocument(project.id),
          listFlowcharts(project.id),
          listRgdSheets(project.id),
        ]);
        if (cancelled || !editor) return;
        setFlowcharts(list);
        setRgdSheets(sheets);

        let content = doc;
        let didMigrate = false;
        if (!migratedRef.current) {
          const migration = migrateRgdBlocksInDocument(doc, {
            sheetName: `${project.name} — Migrated RGD`,
            sheetId: "migrated-rgd",
          });
          if (migration.migrated) {
            for (const sheet of migration.sheets) {
              const existing = sheets.find((s) => s.id === sheet.id);
              if (!existing) {
                await saveRgdSheet(project.id, sheet.id, sheet);
                emitRgdSheetSaved(project.id, sheet.id, sheet);
              } else {
                const loaded = normalizeRgdSheet(
                  await loadRgdSheet(project.id, sheet.id),
                );
                const merged = normalizeRgdSheet({
                  ...loaded,
                  steps: { ...loaded.steps, ...sheet.steps },
                });
                await saveRgdSheet(project.id, sheet.id, merged);
                emitRgdSheetSaved(project.id, sheet.id, merged);
              }
            }
            content = migration.document;
            await saveDocument(project.id, content);
            setRgdSheets(await listRgdSheets(project.id));
            didMigrate = true;
          }
          migratedRef.current = true;
        }

        if (cancelled) return;
        editor.commands.setContent(content as object);
        setStatus(
          didMigrate ? "Migrated legacy RGD blocks into a sheet" : "Ready",
        );
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
  }, [project.id, project.name, editor]);

  const refreshFlowcharts = useCallback(async () => {
    setFlowcharts(await listFlowcharts(project.id));
  }, [project.id]);

  const refreshRgdSheets = useCallback(async () => {
    setRgdSheets(await listRgdSheets(project.id));
  }, [project.id]);

  const insertFlowchart = async (flowchartId: string) => {
    if (!(await flowchartExists(project.id, flowchartId))) {
      const doc = await loadFlowchart(project.id, flowchartId);
      await saveFlowchart(project.id, flowchartId, doc);
      emitFlowchartSaved(project.id, flowchartId, doc);
    }
    editor?.chain().focus().insertFlowchartEmbed(flowchartId).run();
    setPickerOpen(false);
    const named =
      flowcharts.find((f) => f.id === flowchartId)?.name ?? flowchartId;
    setStatus(`Embedded flowchart “${named}”`);
  };

  const insertVariable = (variable: DocVariable) => {
    editor
      ?.chain()
      .focus()
      .insertVariableEmbed(variable.id, variable.name)
      .run();
    setStatus(`Inserted {{${variable.name}}}`);
  };

  const insertRgdSheet = async (sheetId: string) => {
    editor?.chain().focus().insertRgdSheetEmbed(sheetId).run();
    setRgdPickerOpen(false);
    const named = rgdSheets.find((s) => s.id === sheetId)?.name ?? sheetId;
    setStatus(`Embedded RGD “${named}”`);
  };

  const createAndInsertRgdSheet = async () => {
    const name = window.prompt("New RGD sheet name", "Untitled gameplay");
    if (name === null) return;
    const created = await createRgdSheet(project.id, name);
    const sheet = emptyRgdSheetDocument(created.id, created.name);
    await saveRgdSheet(project.id, created.id, sheet);
    emitRgdSheetSaved(project.id, created.id, sheet);
    await refreshRgdSheets();
    await insertRgdSheet(created.id);
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
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 1 }).run()
            }
            aria-pressed={editor.isActive("heading", { level: 1 })}
          >
            H1
          </button>
          <button
            type="button"
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
            aria-pressed={editor.isActive("heading", { level: 2 })}
          >
            H2
          </button>
          <button
            type="button"
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 3 }).run()
            }
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
            setRgdPickerOpen(false);
            void refreshFlowcharts().then(() => setPickerOpen(true));
          }}
        >
          Insert flowchart
        </button>
        <button
          type="button"
          aria-expanded={rgdPickerOpen}
          aria-haspopup="dialog"
          onClick={() => {
            setPickerOpen(false);
            void refreshRgdSheets().then(() => setRgdPickerOpen((o) => !o));
          }}
        >
          Insert RGD…
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

      {rgdPickerOpen && (
        <div
          className="embed-picker rgd-insert-menu"
          role="dialog"
          aria-label="Insert RGD sheet"
        >
          <p className="muted tiny">
            Embed a compact card that references an RGD sheet (edit under the
            RGD tab).
          </p>
          <ul>
            {rgdSheets.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => void insertRgdSheet(s.id)}>
                  {s.name} <span className="muted tiny">({s.id})</span>
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="primary"
            onClick={() => void createAndInsertRgdSheet()}
          >
            New sheet + insert card
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => setRgdPickerOpen(false)}
          >
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
