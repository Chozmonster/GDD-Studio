import type { RgdSheetDocument } from "../../../types";
import { parsePayload } from "./rgdContent";
import { emptyRgdSheetDocument, normalizeRgdSheet } from "./rgdSheetModel";
import type { RgdBlockType } from "./rgdTypes";
import { RGD_INSERT_ORDER } from "./rgdTypes";

type TipTapNode = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  [key: string]: unknown;
};

type TipTapDoc = {
  type?: string;
  content?: TipTapNode[];
  [key: string]: unknown;
};

export type RgdMigrationResult = {
  /** True when the TipTap doc was rewritten. */
  migrated: boolean;
  document: TipTapDoc;
  /** Sheets created from legacy rgdBlock nodes (caller persists). */
  sheets: RgdSheetDocument[];
};

function isRgdBlock(node: TipTapNode): boolean {
  return node.type === "rgdBlock";
}

function collectBlocks(
  nodes: TipTapNode[],
): Array<{ type: RgdBlockType; title: string; payload: unknown }> {
  const out: Array<{ type: RgdBlockType; title: string; payload: unknown }> =
    [];
  for (const node of nodes) {
    if (!isRgdBlock(node)) continue;
    const type = (node.attrs?.rgdType as RgdBlockType) ?? "pillars";
    if (!RGD_INSERT_ORDER.includes(type)) continue;
    out.push({
      type,
      title: String(node.attrs?.title ?? ""),
      payload: node.attrs?.payload,
    });
  }
  return out;
}

function replaceBlocksWithCard(
  nodes: TipTapNode[],
  sheetId: string,
): TipTapNode[] {
  let inserted = false;
  const next: TipTapNode[] = [];
  for (const node of nodes) {
    if (isRgdBlock(node)) {
      if (!inserted) {
        next.push({
          type: "rgdSheetEmbed",
          attrs: { sheetId },
        });
        inserted = true;
      }
      continue;
    }
    next.push(node);
  }
  return next;
}

/**
 * Auto-migrate TipTap `rgdBlock` nodes into one RGD sheet + a live table embed.
 * Idempotent when no rgdBlock nodes remain.
 */
export function migrateRgdBlocksInDocument(
  rawDoc: unknown,
  options: { sheetName: string; sheetId?: string },
): RgdMigrationResult {
  const doc =
    rawDoc && typeof rawDoc === "object"
      ? (structuredClone(rawDoc) as TipTapDoc)
      : { type: "doc", content: [] };

  const content = Array.isArray(doc.content) ? doc.content : [];
  const blocks = collectBlocks(content);
  if (blocks.length === 0) {
    return { migrated: false, document: doc, sheets: [] };
  }

  const sheetId = options.sheetId ?? "migrated-rgd";
  const steps: NonNullable<RgdSheetDocument["steps"]> = {};
  for (const block of blocks) {
    const payload = parsePayload(block.type, block.payload);
    steps[block.type] = {
      title: block.title.trim() || block.type,
      payload: payload as unknown as Record<string, unknown>,
    };
  }

  const sheet = normalizeRgdSheet({
    ...emptyRgdSheetDocument(sheetId, options.sheetName),
    steps,
  });

  doc.content = replaceBlocksWithCard(content, sheetId);

  return {
    migrated: true,
    document: doc,
    sheets: [sheet],
  };
}

/** Starter TipTap doc: heading + intro + one RGD sheet table embed. */
export function buildRgdStarterDoc(
  projectName: string,
  sheetId: string,
): TipTapDoc {
  return {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: projectName || "Game Design Doc" }],
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Rational Game Design starter — edit the linked sheet under the RGD tab (mechanic → skill → parameter table). Insert more tables from Insert RGD… anytime.",
          },
        ],
      },
      {
        type: "rgdSheetEmbed",
        attrs: { sheetId },
      },
    ],
  };
}
