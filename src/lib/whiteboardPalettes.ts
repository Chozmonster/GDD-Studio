import { listMoodBoards, loadMoodBoard } from "../api";
import { parsePaletteHexes } from "./colourPalette";
import type { WhiteboardPaletteRef } from "../types";

/** One Mood Board colour-palette tile usable as Whiteboard swatches. */
export type MoodPaletteOption = {
  key: string;
  moodBoardId: string;
  itemId: string;
  /** Human label: board name + short hex preview. */
  label: string;
  hexes: string[];
  createdAt: number;
};

export function paletteOptionKey(ref: WhiteboardPaletteRef): string {
  return `${ref.moodBoardId}::${ref.itemId}`;
}

/**
 * Scan project Mood Boards for `Palette: #…` tiles.
 * Hex SoT stays on the Mood Board item comment — no duplicate generation.
 */
export async function listProjectMoodPalettes(
  projectId: string,
): Promise<MoodPaletteOption[]> {
  const boards = await listMoodBoards(projectId);
  const out: MoodPaletteOption[] = [];
  for (const summary of boards) {
    const doc = await loadMoodBoard(projectId, summary.id);
    for (const item of doc.items) {
      const hexes = parsePaletteHexes(item.comment ?? "");
      if (!hexes || hexes.length === 0) continue;
      const preview = hexes.slice(0, 3).join(" ");
      out.push({
        key: paletteOptionKey({
          moodBoardId: summary.id,
          itemId: item.id,
        }),
        moodBoardId: summary.id,
        itemId: item.id,
        label: `${summary.name} · ${preview}${hexes.length > 3 ? "…" : ""}`,
        hexes,
        createdAt: item.createdAt || 0,
      });
    }
  }
  out.sort((a, b) => b.createdAt - a.createdAt || a.label.localeCompare(b.label));
  return out;
}

/** Prefer stored ref when still valid; else newest palette. */
export function pickDefaultPalette(
  options: MoodPaletteOption[],
  preferred?: WhiteboardPaletteRef | null,
): MoodPaletteOption | null {
  if (options.length === 0) return null;
  if (preferred) {
    const key = paletteOptionKey(preferred);
    const hit = options.find((o) => o.key === key);
    if (hit) return hit;
  }
  return options[0] ?? null;
}
