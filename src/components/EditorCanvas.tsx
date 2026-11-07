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
import { SplitPane } from "./SplitPane";
import {
  createRgdSheet,
  ensureVariable,
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
import { isAllowedMediaFile } from "../lib/mediaFile";
import {
  clearDocSelection,
  getDocSelection,
  onInsertMediaFromMoodBoard,
  rememberDocSelection,
} from "../lib/documentMediaInsert";
import { emitFlowchartSaved } from "../lib/flowchartEvents";
import { emitRgdSheetSaved } from "../lib/rgdEvents";
import { emitVariablesChanged } from "../lib/variableEvents";
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
import { DocumentMap } from "./editor/DocumentMap";
import { DocsSidebar } from "./editor/DocsSidebar";
import { FlowchartEmbed } from "./editor/flowchartEmbedExtension";
import {
  FONT_FAMILY_OPTIONS,
  FONT_SIZE_OPTIONS,
  FontSize,
} from "./editor/fontSize";
import { MediaEmbed } from "./editor/mediaEmbedExtension";
import { MoodBoardEmbed } from "./editor/moodBoardEmbedExtension";
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
import { UndoRedoButtons } from "./editor/UndoRedoButtons";
import { VariableEmbed } from "./editor/variableEmbedExtension";
import { VariablesPanel } from "./editor/VariablesPanel";
import { WikiLink } from "./editor/wikiLinkExtension";
import { WordLookupPanel } from "./editor/WordLookupPanel";
import {
  isEditableKeyboardTarget,
  undoRedoFromKeyboard,
} from "../lib/undoKeyboard";

type EditorCanvasProps = {
  project: ProjectRecord;
  /** When false, this tab is hidden — skip window keyboard undo handling. */
  active?: boolean;
  onOpenFlowchart?: (flowchartId: string) => void;
  onOpenRgdSheet?: (sheetId: string) => void;
  onOpenMoodBoard?: (boardId?: string) => void;
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

export function EditorCanvas({
  project,
  active = true,
  onOpenFlowchart,
  onOpenRgdSheet,
  onOpenMoodBoard,
}: EditorCanvasProps) {
  const [status, setStatus] = useState("Loading…");
  /** TipTap History canUndo/canRedo — refreshed on every transaction. */
  const [, setHistoryTick] = useState(0);
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
  const activeDocIdRef = useRef(activeDocId);
  const switchDocRef = useRef<(docId: string) => Promise<void>>(async () => undefined);
  const ensureVariableRef = useRef<
    (name: string) => Promise<DocVariable>
  >(async () => {
    throw new Error("ensureVariable not ready");
  });
  activeDocIdRef.current = activeDocId;

  ensureVariableRef.current = async (name: string) => {
    const { variable, list } = await ensureVariable(project.id, name);
    emitVariablesChanged(project.id, list);
    return variable;
  };

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
      const list = Array.from(files).filter(isAllowedMediaFile);
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
          // Atom embeds (RGD / media / mood board) keep their own textAlign
          // attr + toolbar branch below; including them here doubles the
          // attribute and breaks JSON round-trip.
          types: ["heading", "paragraph"],
        }),
        Placeholder.configure({
          placeholder:
            "Write your GDD here… [[Doc Title]] links a document, {{var}} inserts a variable",
        }),
        FlowchartEmbed.configure({
          projectId: project.id,
          onOpenFlowchart,
        }),
        VariableEmbed.configure({
          projectId: project.id,
          ensureVariable: (name) => ensureVariableRef.current(name),
        }),
        MediaEmbed.configure({
          projectId: project.id,
        }),
        MoodBoardEmbed.configure({
          projectId: project.id,
          onOpenMoodBoard,
        }),
        WikiLink.configure({
          projectId: project.id,
          onOpenDoc: (docId) => {
            void switchDocRef.current(docId);
          },
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
          if (
            files &&
            files.length > 0 &&
            Array.from(files).some(isAllowedMediaFile)
          ) {
            event.preventDefault();
            void insertMediaFilesRef.current(files);
            return true;
          }
          return false;
        },
        handleDrop: (_view, event) => {
          const files = event.dataTransfer?.files;
          if (
            files &&
            files.length > 0 &&
            Array.from(files).some(isAllowedMediaFile)
          ) {
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
    [project.id, onOpenFlowchart, onOpenRgdSheet, onOpenMoodBoard],
  );

  editorRef.current = editor;

  // Drive Undo/Redo button disabled state from TipTap History plugin.
  useEffect(() => {
    if (!editor) return;
    const onTransaction = () => setHistoryTick((n) => n + 1);
    editor.on("transaction", onTransaction);
    return () => {
      editor.off("transaction", onTransaction);
    };
  }, [editor]);

  // Blur when leaving the Document tab so TipTap History does not steal
  // Mod+Z from Flowcharts / RGD / Mood Board while this panel is hidden.
  useEffect(() => {
    if (!editor) return;
    if (!active && editor.view.hasFocus()) {
      editor.commands.blur();
    }
  }, [active, editor]);

  // When the Document tab is focused but the prose mirror view is not,
  // still offer Mod+Z / Mod+Shift+Z (TipTap handles keys while focused).
  useEffect(() => {
    if (!active || !editor) return;
    const onKey = (event: KeyboardEvent) => {
      const action = undoRedoFromKeyboard(event);
      if (!action) return;
      if (editor.view.hasFocus()) return;
      if (isEditableKeyboardTarget(event.target)) return;
      if (action === "undo" && editor.can().undo()) {
        event.preventDefault();
        editor.chain().focus().undo().run();
      } else if (action === "redo" && editor.can().redo()) {
        event.preventDefault();
        editor.chain().focus().redo().run();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, editor]);

  // Snapshot TipTap selection so Mood Board can insert at the last cursor
  // in the *active* document (keyed by projectId:docId).
  useEffect(() => {
    if (!editor) return;
    const selectionKey = `${project.id}:${activeDocId}`;
    const snapshot = () => {
      const { from, to } = editor.state.selection;
      rememberDocSelection(selectionKey, from, to);
    };
    snapshot();
    editor.on("selectionUpdate", snapshot);
    editor.on("blur", snapshot);
    return () => {
      snapshot();
      editor.off("selectionUpdate", snapshot);
      editor.off("blur", snapshot);
    };
  }, [editor, project.id, activeDocId]);

  // Mood Board → active Document live embed-by-item-id (cursor restore or append).
  // Uses insertContentAt so it works while this panel is display:none.
  useEffect(() => {
    if (!editor) return;
    return onInsertMediaFromMoodBoard((detail) => {
      if (detail.projectId !== project.id) return;
      if (!detail.moodBoardItemId) return;
      const docSize = editor.state.doc.content.size;
      const sel = getDocSelection(`${project.id}:${activeDocIdRef.current}`);
      // Fallback: append at end when Document was never focused.
      const pos = sel
        ? Math.max(0, Math.min(sel.from, docSize))
        : docSize;
      editor
        .chain()
        .insertContentAt(pos, {
          type: "moodBoardEmbed",
          attrs: {
            moodBoardId: detail.moodBoardId || "main",
            moodBoardItemId: detail.moodBoardItemId,
          },
        })
        .run();
      setStatus(
        `Linked ${detail.filename || detail.kind || "Mood Board item"} (live)`,
      );
    });
  }, [editor, project.id]);

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
                  // Prefer newly migrated table rows when the existing sheet is empty.
                  mechanics:
                    (sheet.mechanics?.length ?? 0) > 0 &&
                    !(loaded.mechanics ?? []).some(
                      (m) => m.name.trim() || m.playerInput?.trim(),
                    )
                      ? sheet.mechanics
                      : loaded.mechanics,
                  meta: { ...loaded.meta, ...sheet.meta },
                  steps: { ...(loaded.steps ?? {}), ...(sheet.steps ?? {}) },
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

  const atomEmbedAlignType = editor?.isActive("rgdSheetEmbed")
    ? "rgdSheetEmbed"
    : editor?.isActive("mediaEmbed")
      ? "mediaEmbed"
      : editor?.isActive("moodBoardEmbed")
        ? "moodBoardEmbed"
        : null;

  const atomEmbedAlign = atomEmbedAlignType
    ? String(
        editor?.getAttributes(atomEmbedAlignType).textAlign ?? "left",
      )
    : null;

  const applyTextAlign = (
    alignment: "left" | "center" | "right" | "justify",
  ) => {
    if (!editor) return;
    if (atomEmbedAlignType) {
      editor
        .chain()
        .updateAttributes(atomEmbedAlignType, { textAlign: alignment })
        .run();
      return;
    }
    editor.chain().focus().setTextAlign(alignment).run();
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

  const switchDoc = useCallback(
    async (docId: string) => {
      if (docId === activeDocIdRef.current) return;
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      const ed = editorRef.current;
      if (ed && docMetaRef.current) {
        try {
          await persistBody(ed);
        } catch (e) {
          setStatus(e instanceof Error ? e.message : String(e));
          return;
        }
      }
      clearDocSelection(`${project.id}:${activeDocIdRef.current}`);
      setActiveDocId(docId);
    },
    [persistBody, project.id],
  );
  switchDocRef.current = switchDoc;

  const insertWikiLink = () => {
    const title = window.prompt("Link to document title", "");
    if (!title?.trim()) return;
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
    setStatus(`Linked to “${title.trim()}”`);
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
  const canUndo = editor.can().undo();
  const canRedo = editor.can().redo();

  return (
    <section className="editor-shell" aria-label={`Editing ${project.name}`}>
      <header className="editor-toolbar" role="toolbar" aria-label="Formatting">
        <div className="toolbar-group">
          <UndoRedoButtons
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={() => editor.chain().focus().undo().run()}
            onRedo={() => editor.chain().focus().redo().run()}
          />
        </div>

        <ToolbarDivider />

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
            pressed={
              atomEmbedAlign
                ? atomEmbedAlign === "left"
                : editor.isActive({ textAlign: "left" })
            }
            onClick={() => applyTextAlign("left")}
          />
          <ToolbarIconButton
            label="Align center"
            icon={AlignCenter}
            pressed={
              atomEmbedAlign
                ? atomEmbedAlign === "center"
                : editor.isActive({ textAlign: "center" })
            }
            onClick={() => applyTextAlign("center")}
          />
          <ToolbarIconButton
            label="Align right"
            icon={AlignRight}
            pressed={
              atomEmbedAlign
                ? atomEmbedAlign === "right"
                : editor.isActive({ textAlign: "right" })
            }
            onClick={() => applyTextAlign("right")}
          />
          <ToolbarIconButton
            label="Justify"
            icon={AlignJustify}
            pressed={
              atomEmbedAlign
                ? atomEmbedAlign === "justify"
                : editor.isActive({ textAlign: "justify" })
            }
            onClick={() => applyTextAlign("justify")}
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
            label="Insert RGD table"
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
            label="Link to document"
            icon={Link2}
            onClick={insertWikiLink}
          >
            Link
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
          accept="image/png,image/jpeg,image/gif,image/webp,image/bmp,video/*,audio/*,.png,.jpg,.jpeg,.gif,.webp,.bmp,.mp4,.webm,.mov,.mp3,.wav,.ogg,.m4a"
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
            Embed a live mechanic table that references an RGD sheet (edit under
            the RGD tab).
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
        <SplitPane
          id="document.left"
          defaultSize={200}
          minSize={140}
          maxSize={420}
          minSecondary={280}
          stackBelow={840}
        >
          <div className="editor-left-rail">
            <SplitPane
              id="document.left-rail"
              orientation="vertical"
              defaultSize={220}
              minSize={100}
              maxSize={560}
              minSecondary={120}
              stackBelow={280}
            >
              <div className="left-rail-pane left-rail-map">
                <DocumentMap editor={editor} />
              </div>
              <div className="left-rail-pane left-rail-docs">
                <DocsSidebar
                  projectId={project.id}
                  activeDocId={activeDocId}
                  onSelect={(docId) => void switchDoc(docId)}
                  refreshKey={docsRefresh}
                />
              </div>
            </SplitPane>
          </div>
          <SplitPane
            id="document.right"
            primary="end"
            defaultSize={220}
            minSize={160}
            maxSize={420}
            minSecondary={280}
            stackBelow={640}
          >
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
          </SplitPane>
        </SplitPane>
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
