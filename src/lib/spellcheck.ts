import nspell from "nspell";

type SpellEngine = {
  correct: (word: string) => boolean;
  suggest: (word: string) => string[];
  add: (word: string) => void;
};

let enginePromise: Promise<SpellEngine | null> | null = null;

async function loadEngine(): Promise<SpellEngine | null> {
  try {
    const [affRes, dicRes] = await Promise.all([
      fetch("/dictionaries/index.aff"),
      fetch("/dictionaries/index.dic"),
    ]);
    if (!affRes.ok || !dicRes.ok) return null;
    const aff = await affRes.text();
    const dic = await dicRes.text();
    return nspell({ aff, dic });
  } catch {
    return null;
  }
}

export function getSpellEngine(): Promise<SpellEngine | null> {
  if (!enginePromise) enginePromise = loadEngine();
  return enginePromise;
}

const WORD_RE = /[A-Za-z][A-Za-z'-]{1,}/g;

export function tokenizeWords(
  text: string,
): Array<{ word: string; from: number; to: number }> {
  const out: Array<{ word: string; from: number; to: number }> = [];
  WORD_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WORD_RE.exec(text))) {
    out.push({ word: m[0], from: m.index, to: m.index + m[0].length });
  }
  return out;
}

export function shouldCheckWord(word: string): boolean {
  if (word.length < 3) return false;
  if (/^[A-Z0-9_-]+$/.test(word) && word === word.toUpperCase()) return false;
  if (/\d/.test(word)) return false;
  return true;
}
