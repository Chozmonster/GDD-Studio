import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import FontFamily from "@tiptap/extension-font-family";
import { TextStyle } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  BookOpen,
  FileDown,
  Heading1,
  Heading2,
  Heading3,
  FileStack,
  Image as ImageIcon,
  Indent,
  Italic,
  Layers,
  Link2,
  List,
  ListOrdered,
  Outdent,
  Underline as UnderlineIcon,
  Workflow,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createRgdSheet,
  flowchartExists,
  listFlowcharts,
  listRgdSheets,
  loadFlowchart,
  loadProjectDocument,
  loadRgdSheet,
  saveAssetFromFile,
  saveFlowchart,
  saveProjectDocument,
  saveRgdSheet,
} from "../api";
import { exportDocumentPdf } from "../lib/exportPdf";
import { emitFlowchartSaved } from "../lib/flowchartEvents";
import { emitRgdSheetSaved } from "../lib/rgdEvents";
import { getSpellEngine } from "../lib/spellcheck";
import { lookupWord } from "../lib/wordLookup";
import type {
  DocVariable,
  FlowchartSummary,
  ProjectDocument,
  ProjectRecord,
  RgdSheetSummary,
  WordDefinition,
} from "../types";
import { DocsSidebar } from "./editor/DocsSidebar";
import { DocumentMap } from "./editor/DocumentMap";
import { FlowchartEmbed } from "./editor/flowchartEmbedExtension";
import {
  FONT_FAMILY_OPTIONS,
  FONT_SIZE_OPTIONS,
  FontSize,
} from "./editor/fontSize";
import { MediaEmbed } from "./editor/mediaEmbedExtension";
import { migrateRgdBlocksInDocument } from "./editor/rgd/migrateRgdBlocks";
import { RgdBlock } from "./editor/rgd/rgdBlockExtension";
import { RgdSheetEmbed } from "./editor/rgd/rgdSheetEmbedExtension";
import {
  emptyRgdSheetDocument,
  normalizeRgdSheet,
} from "./editor/rgd/rgdSheetModel";
import { Spellcheck } from "./editor/spellcheckExtension";
import { TemplatesPicker } from "./editor/TemplatesPicker";
import { ToolbarIconButton } from "./editor/ToolbarIconButton";
import { VariableEmbed } from "./editor/variableEmbedExtension";
import { VariablesPanel } from "./editor/VariablesPanel";
import { WikiLink } from "./editor/wikiLinkExtension";
import { WordLookupPanel } from "./editor/WordLookupPanel";

type EditorCanvasProps = {
  project: ProjectRecord;
  onOpenFlowchart?: (flowchartId: string) => void;
  onOpenRgdSheet?: (sheetId: string) => void;
};

type SpellMenuState = {
  word: string;
  from: number;
  to: number;
  x: number;
  y: number;
  suggestions: string[];
} | null;

function ToolbarDivider() {
  return <span className="toolbar-divider" aria-hidden />;
}

function isMediaFile(file: File): boolean {
  const t = file.type.toLowerCase();
  if (
    t.startsWith("image/") ||
    t.startsWith("video/") ||
    t.startsWith("audio/")
  ) {
    return true;
  }
  return /\.(png|jpe?g|gif|webp|bmp|svg|mp4|webm|mov|mkv|mp3|wav|ogg|m4a|flac)$/i.test(
    file.name,
  );
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
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [activeDocId, setActiveDocId] = useState("main");
  const [docMeta, setDocMeta] = useState<ProjectDocument | null>(null);
  const [docsRefresh, setDocsRefresh] = useState(0);
  const [spellMenu, setSpellMenu] = useState<SpellMenuState>(null);
  const [lookupWordText, setLookupWordText] = useState<string | null>(null);
  const [lookupDef, setLookupDef] = useState<WordDefinition | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const saveTimer = useRef<number | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const migratedRef = useRef(false);
  const docMetaRef = useRef<ProjectDocument | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const insertMediaFilesRef = useRef<(files: FileList | File[]) => Promise<void>>(
    async () => undefined,
  );
  const persistBodyRef = useRef<(ed: Editor) => Promise<void>>(async () => undefined);

  const persistBody = useCallback(
    async (ed: Editor) => {
      const meta = docMetaRef.current;
      if (!meta) return;
      const next: ProjectDocument = {
        ...meta,
        body: ed.getJSON(),
      };
      const saved = await saveProjectDocument(project.id, next);
      docMetaRef.current = saved;
      setDocMeta(saved);
      setDocsRefresh((n) => n + 1);
      setStatus(`Saved ${new Date().toLocaleTimeString()}`);
    },
    [project.id],
  );

  const insertMediaFiles = useCallback(
    async (files: FileList | File[]) => {
      const ed = editorRef.current;
      if (!ed) return;
      const list = Array.from(files).filter(isMediaFile);
      if (list.length === 0) return;
      for (const file of list) {
        try {
          const asset = await saveAssetFromFile(project.id, file);
          ed.chain()
            .focus()
            .insertMediaEmbed({
              assetId: asset.id,
              kind: String(asset.kind),
              filename: asset.filename,
              mime: asset.mime,
            })
            .run();
          setStatus(`Embedded ${asset.filename}`);
        } catch (e) {
          setStatus(e instanceof Error ? e.message : String(e));
        }
      }
    },
    [project.id],
  );

  insertMediaFilesRef.current = insertMediaFiles;
  persistBodyRef.current = persistBody;

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
          placeholder: "Write your GDD here… [[Link]] for wiki pages",
        }),
        FlowchartEmbed.configure({
          projectId: project.id,
          onOpenFlowchart,
        }),
        VariableEmbed.configure({
          projectId: project.id,
        }),
        MediaEmbed.configure({
          projectId: project.id,
        }),
        WikiLink.configure({
          projectId: project.id,
          onOpenDoc: (docId) => setActiveDocId(docId),
        }),
        Spellcheck.configure({ enabled: true }),
        RgdSheetEmbed.configure({
          projectId: project.id,
          onOpenRgdSheet,
        }),
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
          spellcheck: "false",
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
        handlePaste: (_view, event) => {
          const files = event.clipboardData?.files;
          if (files && files.length > 0 && Array.from(files).some(isMediaFile)) {
            event.preventDefault();
            void insertMediaFilesRef.current(files);
            return true;
          }
          return false;
        },
        handleDrop: (_view, event) => {
          const files = event.dataTransfer?.files;
          if (files && files.length > 0 && Array.from(files).some(isMediaFile)) {
            event.preventDefault();
            void insertMediaFilesRef.current(files);
            return true;
          }
          return false;
        },
      },
      onUpdate: ({ editor: ed }) => {
        if (saveTimer.current) window.clearTimeout(saveTimer.current);
        saveTimer.current = window.setTimeout(() => {
          void persistBodyRef.current(ed).catch((e) =>
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
    setActiveDocId("main");
  }, [project.id]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [doc, list, sheets] = await Promise.all([
          loadProjectDocument(project.id, activeDocId),
          listFlowcharts(project.id),
          listRgdSheets(project.id),
        ]);
        if (cancelled || !editor) return;
        setFlowcharts(list);
        setRgdSheets(sheets);

        let content = doc.body;
        let nextMeta = doc;
        let didMigrate = false;
        if (activeDocId === "main" && !migratedRef.current) {
          const migration = migrateRgdBlocksInDocument(doc.body, {
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
            nextMeta = await saveProjectDocument(project.id, {
              ...doc,
              body: content,
            });
            setRgdSheets(await listRgdSheets(project.id));
            didMigrate = true;
          }
          migratedRef.current = true;
        }

        if (cancelled) return;
        docMetaRef.current = nextMeta;
        setDocMeta(nextMeta);
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
  }, [project.id, project.name, editor, activeDocId]);

  // Spell suggestion context menu host
  useEffect(() => {
    const el = document.querySelector(".editor-canvas");
    if (!el) return;
    const onMenu = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as {
        word: string;
        from: number;
        to: number;
        clientX: number;
        clientY: number;
      };
      void getSpellEngine().then((engine) => {
        const suggestions = engine?.suggest(detail.word).slice(0, 8) ?? [];
        setSpellMenu({
          word: detail.word,
          from: detail.from,
          to: detail.to,
          x: detail.clientX,
          y: detail.clientY,
          suggestions,
        });
      });
    };
    el.addEventListener("gdd-spell-menu", onMenu as EventListener);
    return () =>
      el.removeEventListener("gdd-spell-menu", onMenu as EventListener);
  }, [editor]);

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

  const insertWikiLink = () => {
    const title = window.prompt("Link to page title", "");
    if (!title) return;
    const slug = title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    editor
      ?.chain()
      .focus()
      .insertWikiLink({ title: title.trim(), slug })
      .run();
  };

  const runWordLookup = async (word?: string) => {
    const ed = editorRef.current;
    let target = word?.trim() ?? "";
    if (!target && ed) {
      const { from, to } = ed.state.selection;
      if (from !== to) {
        target = ed.state.doc.textBetween(from, to, " ");
      }
    }
    target = target.trim().split(/\s+/)[0] ?? "";
    if (!target) {
      setStatus("Select a word to look up");
      return;
    }
    setLookupWordText(target);
    setLookupLoading(true);
    setLookupError(null);
    setLookupDef(null);
    try {
      const def = await lookupWord(target);
      setLookupDef(def);
      if (!def) setLookupError("No definition found");
    } catch (e) {
      setLookupError(e instanceof Error ? e.message : String(e));
    } finally {
      setLookupLoading(false);
    }
  };

  const applyTemplate = async (body: unknown, templateName: string) => {
    const meta = docMetaRef.current;
    const ed = editorRef.current;
    if (!meta || !ed) return;
    if (
      !window.confirm(
        `Replace “${meta.title}” with template “${templateName}”? This overwrites the current body.`,
      )
    ) {
      return;
    }
    ed.commands.setContent(body as object);
    await persistBody(ed);
    setStatus(`Applied template “${templateName}”`);
  };

  const exportPdf = async () => {
    const ed = editorRef.current;
    const meta = docMetaRef.current;
    if (!ed || !meta) return;
    try {
      const result = await exportDocumentPdf(meta.title, ed);
      setStatus(
        result.path
          ? `Print dialog opened (HTML snapshot: ${result.path})`
          : "Print dialog opened — choose Save as PDF",
      );
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
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
          <ToolbarIconButton
            label="Bold"
            icon={Bold}
            pressed={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
          />
          <ToolbarIconButton
            label="Italic"
            icon={Italic}
            pressed={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          />
          <ToolbarIconButton
            label="Underline"
            icon={UnderlineIcon}
            pressed={editor.isActive("underline")}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          />
        </div>

        <ToolbarDivider />

        <div className="toolbar-group">
          <ToolbarIconButton
            label="Heading 1"
            icon={Heading1}
            pressed={editor.isActive("heading", { level: 1 })}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 1 }).run()
            }
          />
          <ToolbarIconButton
            label="Heading 2"
            icon={Heading2}
            pressed={editor.isActive("heading", { level: 2 })}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
          />
          <ToolbarIconButton
            label="Heading 3"
            icon={Heading3}
            pressed={editor.isActive("heading", { level: 3 })}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 3 }).run()
            }
          />
        </div>

        <ToolbarDivider />

        <div className="toolbar-group">
          <ToolbarIconButton
            label="Bullet list"
            icon={List}
            pressed={editor.isActive("bulletList")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          />
          <ToolbarIconButton
            label="Numbered list"
            icon={ListOrdered}
            pressed={editor.isActive("orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          />
          <ToolbarIconButton
            label="Indent (Tab)"
            icon={Indent}
            disabled={!editor.can().sinkListItem("listItem")}
            onClick={() => editor.chain().focus().sinkListItem("listItem").run()}
          />
          <ToolbarIconButton
            label="Outdent (Shift+Tab)"
            icon={Outdent}
            disabled={!editor.can().liftListItem("listItem")}
            onClick={() => editor.chain().focus().liftListItem("listItem").run()}
          />
        </div>

        <ToolbarDivider />

        <div className="toolbar-group">
          <ToolbarIconButton
            label="Align left"
            icon={AlignLeft}
            pressed={editor.isActive({ textAlign: "left" })}
            onClick={() => editor.chain().focus().setTextAlign("left").run()}
          />
          <ToolbarIconButton
            label="Align center"
            icon={AlignCenter}
            pressed={editor.isActive({ textAlign: "center" })}
            onClick={() => editor.chain().focus().setTextAlign("center").run()}
          />
          <ToolbarIconButton
            label="Align right"
            icon={AlignRight}
            pressed={editor.isActive({ textAlign: "right" })}
            onClick={() => editor.chain().focus().setTextAlign("right").run()}
          />
          <ToolbarIconButton
            label="Justify"
            icon={AlignJustify}
            pressed={editor.isActive({ textAlign: "justify" })}
            onClick={() => editor.chain().focus().setTextAlign("justify").run()}
          />
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

        <div className="toolbar-group toolbar-actions">
          <ToolbarIconButton
            label="Insert flowchart"
            icon={Workflow}
            className="primary"
            onClick={() => {
              setRgdPickerOpen(false);
              setTemplatesOpen(false);
              void refreshFlowcharts().then(() => setPickerOpen(true));
            }}
          >
            Flowchart
          </ToolbarIconButton>
          <ToolbarIconButton
            label="Insert RGD sheet card"
            icon={Layers}
            aria-expanded={rgdPickerOpen}
            aria-haspopup="dialog"
            onClick={() => {
              setPickerOpen(false);
              setTemplatesOpen(false);
              void refreshRgdSheets().then(() => setRgdPickerOpen((o) => !o));
            }}
          >
            RGD
          </ToolbarIconButton>
          <ToolbarIconButton
            label="Insert media"
            icon={ImageIcon}
            onClick={() => {
              setPickerOpen(false);
              setRgdPickerOpen(false);
              fileInputRef.current?.click();
            }}
          >
            Media
          </ToolbarIconButton>
          <ToolbarIconButton
            label="Insert wiki link"
            icon={Link2}
            onClick={insertWikiLink}
          >
            Wiki
          </ToolbarIconButton>
          <ToolbarIconButton
            label="Templates"
            icon={FileStack}
            aria-expanded={templatesOpen}
            onClick={() => {
              setPickerOpen(false);
              setRgdPickerOpen(false);
              setTemplatesOpen((o) => !o);
            }}
          >
            Templates
          </ToolbarIconButton>
          <ToolbarIconButton
            label="Look up word"
            icon={BookOpen}
            onClick={() => void runWordLookup()}
          >
            Lookup
          </ToolbarIconButton>
          <ToolbarIconButton
            label="Export PDF"
            icon={FileDown}
            onClick={() => void exportPdf()}
          >
            PDF
          </ToolbarIconButton>
        </div>
        <span className="muted tiny toolbar-status" role="status">
          {docMeta ? `${docMeta.title} · ` : ""}
          {status}
        </span>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*,audio/*,.gif"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) void insertMediaFiles(e.target.files);
            e.target.value = "";
          }}
        />
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

      {templatesOpen && (
        <TemplatesPicker
          projectId={project.id}
          currentBody={editor.getJSON()}
          onApply={(body, name) => void applyTemplate(body, name)}
          onClose={() => setTemplatesOpen(false)}
        />
      )}

      <div className="editor-body">
        <div className="editor-left-rail">
          <DocsSidebar
            projectId={project.id}
            activeDocId={activeDocId}
            onSelect={setActiveDocId}
            refreshKey={docsRefresh}
          />
          <DocumentMap editor={editor} />
        </div>
        <EditorContent editor={editor} className="editor-canvas" />
        <div className="editor-right-rail">
          <VariablesPanel projectId={project.id} onInsert={insertVariable} />
          {lookupWordText && (
            <WordLookupPanel
              word={lookupWordText}
              definition={lookupDef}
              loading={lookupLoading}
              error={lookupError}
              onClose={() => {
                setLookupWordText(null);
                setLookupDef(null);
                setLookupError(null);
              }}
            />
          )}
        </div>
      </div>

      {spellMenu && (
        <div
          className="spell-menu"
          style={{ left: spellMenu.x, top: spellMenu.y }}
          role="menu"
        >
          <p className="muted tiny">“{spellMenu.word}”</p>
          {spellMenu.suggestions.length === 0 && (
            <p className="muted tiny">No suggestions</p>
          )}
          {spellMenu.suggestions.map((s) => (
            <button
              key={s}
              type="button"
              role="menuitem"
              onClick={() => {
                editor
                  .chain()
                  .focus()
                  .insertContentAt(
                    { from: spellMenu.from, to: spellMenu.to },
                    s,
                  )
                  .run();
                setSpellMenu(null);
              }}
            >
              {s}
            </button>
          ))}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              void getSpellEngine().then((eng) => eng?.add(spellMenu.word));
              setSpellMenu(null);
            }}
          >
            Add to dictionary
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              void runWordLookup(spellMenu.word);
              setSpellMenu(null);
            }}
          >
            Look up…
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => setSpellMenu(null)}
          >
            Dismiss
          </button>
        </div>
      )}
    </section>
  );
}
