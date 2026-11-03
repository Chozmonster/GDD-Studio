import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import {
  getSpellEngine,
  shouldCheckWord,
  tokenizeWords,
} from "../../lib/spellcheck";

const key = new PluginKey("gddSpellcheck");

export type SpellcheckStorage = {
  enabled: boolean;
};

/**
 * Offline spellcheck via bundled Hunspell dictionary (nspell).
 * Misspellings get a wavy underline; right-click / Alt+Click shows suggestions
 * via the editor's spell menu host in EditorCanvas.
 */
export const Spellcheck = Extension.create<
  { enabled: boolean },
  SpellcheckStorage
>({
  name: "gddSpellcheck",

  addOptions() {
    return { enabled: true };
  },

  addStorage() {
    return { enabled: this.options.enabled };
  },

  addProseMirrorPlugins() {
    const extension = this;

    return [
      new Plugin({
        key,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, old) {
            if (!extension.storage.enabled) return DecorationSet.empty;
            const meta = tr.getMeta(key);
            if (meta?.decorations) return meta.decorations as DecorationSet;
            if (tr.docChanged) return old.map(tr.mapping, tr.doc);
            return old;
          },
        },
        props: {
          decorations(state) {
            return key.getState(state);
          },
          handleDOMEvents: {
            contextmenu(view, event) {
              if (!extension.storage.enabled) return false;
              const pos = view.posAtCoords({
                left: event.clientX,
                top: event.clientY,
              });
              if (!pos) return false;
              const $pos = view.state.doc.resolve(pos.pos);
              const text = $pos.parent.textContent;
              const offset = pos.pos - $pos.start();
              const tokens = tokenizeWords(text);
              const hit = tokens.find((t) => offset >= t.from && offset <= t.to);
              if (!hit) return false;
              const editorEl = view.dom.closest(".editor-canvas");
              editorEl?.dispatchEvent(
                new CustomEvent("gdd-spell-menu", {
                  bubbles: true,
                  detail: {
                    word: hit.word,
                    from: $pos.start() + hit.from,
                    to: $pos.start() + hit.to,
                    clientX: event.clientX,
                    clientY: event.clientY,
                  },
                }),
              );
              event.preventDefault();
              return true;
            },
          },
        },
        view(view) {
          let cancelled = false;
          let timer: number | null = null;

          const rebuild = () => {
            if (cancelled || !extension.storage.enabled) {
              const tr = view.state.tr.setMeta(key, {
                decorations: DecorationSet.empty,
              });
              view.dispatch(tr);
              return;
            }
            void getSpellEngine().then((engine) => {
              if (cancelled || !engine) return;
              const decorations: ReturnType<typeof Decoration.inline>[] = [];
              view.state.doc.descendants((node, pos) => {
                if (!node.isText || !node.text) return;
                for (const token of tokenizeWords(node.text)) {
                  if (!shouldCheckWord(token.word)) continue;
                  if (engine.correct(token.word)) continue;
                  // Allow capitalized forms of known lowercase words
                  if (
                    token.word[0] === token.word[0].toUpperCase() &&
                    engine.correct(token.word.toLowerCase())
                  ) {
                    continue;
                  }
                  decorations.push(
                    Decoration.inline(
                      pos + token.from,
                      pos + token.to,
                      { class: "spell-error" },
                      { word: token.word },
                    ),
                  );
                }
              });
              const set = DecorationSet.create(view.state.doc, decorations);
              view.dispatch(view.state.tr.setMeta(key, { decorations: set }));
            });
          };

          const schedule = () => {
            if (timer) window.clearTimeout(timer);
            timer = window.setTimeout(rebuild, 350);
          };

          schedule();

          return {
            update(v, prev) {
              if (v.state.doc.eq(prev.doc) && extension.storage.enabled) return;
              schedule();
            },
            destroy() {
              cancelled = true;
              if (timer) window.clearTimeout(timer);
            },
          };
        },
      }),
    ];
  },
});
