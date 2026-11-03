import type { WordDefinition } from "../../types";

type WordLookupPanelProps = {
  word: string;
  definition: WordDefinition | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
};

export function WordLookupPanel({
  word,
  definition,
  loading,
  error,
  onClose,
}: WordLookupPanelProps) {
  return (
    <aside className="word-lookup-panel" aria-label="Word lookup">
      <div className="word-lookup-header">
        <h3>{word || "Lookup"}</h3>
        <button type="button" className="ghost tiny-btn" onClick={onClose}>
          ×
        </button>
      </div>
      {loading && <p className="muted tiny">Looking up…</p>}
      {error && <p className="error tiny">{error}</p>}
      {!loading && !error && !definition && (
        <p className="muted tiny">
          No definition found offline. Network lookup failed or word unknown.
        </p>
      )}
      {definition && (
        <div className="word-lookup-body">
          {definition.phonetic && (
            <p className="muted tiny phonetic">{definition.phonetic}</p>
          )}
          <p className="muted tiny">Source: {definition.source}</p>
          {definition.meanings.map((m, i) => (
            <div key={`${m.partOfSpeech}-${i}`} className="word-meaning">
              <p className="pos">{m.partOfSpeech}</p>
              <ol>
                {m.definitions.map((d, j) => (
                  <li key={j}>
                    {d.definition}
                    {d.example && (
                      <em className="muted example"> “{d.example}”</em>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
