import type { WordDefinition } from "../types";

const CACHE_KEY = "gdd-studio.word-lookup-cache";
const BUILTIN: Record<string, WordDefinition> = {
  game: {
    word: "game",
    meanings: [
      {
        partOfSpeech: "noun",
        definitions: [
          {
            definition:
              "A structured form of play, usually undertaken for entertainment or education.",
          },
        ],
      },
    ],
    source: "builtin",
  },
  design: {
    word: "design",
    meanings: [
      {
        partOfSpeech: "noun",
        definitions: [
          {
            definition:
              "A plan or drawing produced to show the look and function of something before it is made.",
          },
        ],
      },
      {
        partOfSpeech: "verb",
        definitions: [
          {
            definition: "To decide upon the look and functioning of something.",
          },
        ],
      },
    ],
    source: "builtin",
  },
  player: {
    word: "player",
    meanings: [
      {
        partOfSpeech: "noun",
        definitions: [
          {
            definition: "A person taking part in a game or sport.",
          },
        ],
      },
    ],
    source: "builtin",
  },
};

type CacheMap = Record<string, WordDefinition>;

function loadCache(): CacheMap {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) return JSON.parse(raw) as CacheMap;
  } catch {
    /* ignore */
  }
  return {};
}

function saveCache(cache: CacheMap) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* ignore quota */
  }
}

/**
 * Offline-first word lookup: builtin stubs → local cache → Free Dictionary API
 * (network, results cached). Works inside the Tauri webview the same as browser preview.
 */
export async function lookupWord(raw: string): Promise<WordDefinition | null> {
  const word = raw.trim().toLowerCase().replace(/[^a-z'-]/gi, "");
  if (!word) return null;

  if (BUILTIN[word]) return BUILTIN[word];

  const cache = loadCache();
  if (cache[word]) return { ...cache[word], source: "cache" };

  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{
      word?: string;
      phonetic?: string;
      meanings?: Array<{
        partOfSpeech?: string;
        definitions?: Array<{ definition?: string; example?: string }>;
      }>;
    }>;
    const entry = data[0];
    if (!entry) return null;
    const def: WordDefinition = {
      word: entry.word ?? word,
      phonetic: entry.phonetic,
      meanings: (entry.meanings ?? []).map((m) => ({
        partOfSpeech: m.partOfSpeech ?? "",
        definitions: (m.definitions ?? [])
          .filter((d) => d.definition)
          .slice(0, 3)
          .map((d) => ({
            definition: d.definition ?? "",
            example: d.example,
          })),
      })),
      source: "network",
    };
    cache[word] = { ...def, source: "cache" };
    saveCache(cache);
    return def;
  } catch {
    return null;
  }
}
