import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect } from "react";

type EditorCanvasProps = {
  projectName: string | null;
};

const STARTER_DOC = `
  <h1>Untitled document</h1>
  <p>Start writing your game design doc. TipTap is wired as the editor shell.</p>
  <p><em>Editor shell</em> — variables, wiki links, templates, and media still to come.</p>
`;

export function EditorCanvas({ projectName }: EditorCanvasProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: "Write your GDD here…",
      }),
    ],
    content: STARTER_DOC,
    editorProps: {
      attributes: {
        class: "gdd-prose",
        "aria-label": "Document editor",
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    // Reset to a blank-ish starter when switching placeholder projects.
    editor.commands.setContent(STARTER_DOC);
  }, [editor, projectName]);

  if (!projectName) {
    return (
      <section className="editor-empty" aria-label="No project open">
        <p>Select a project from the library to open the editor.</p>
      </section>
    );
  }

  return (
    <section className="editor-shell" aria-label={`Editing ${projectName}`}>
      <header className="editor-toolbar" role="toolbar" aria-label="Formatting">
        <button
          type="button"
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleBold().run()}
          aria-pressed={editor?.isActive("bold") ?? false}
        >
          Bold
        </button>
        <button
          type="button"
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          aria-pressed={editor?.isActive("italic") ?? false}
        >
          Italic
        </button>
        <button
          type="button"
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
          aria-pressed={editor?.isActive("heading", { level: 2 }) ?? false}
        >
          H2
        </button>
        <button
          type="button"
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          aria-pressed={editor?.isActive("bulletList") ?? false}
        >
          List
        </button>
        {/* TODO(v1): wiki-link / variable / media insert controls */}
      </header>
      <EditorContent editor={editor} className="editor-canvas" />
    </section>
  );
}
