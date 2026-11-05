import { useEffect, useId, useRef, useState } from "react";
import {
  HELP_NAV,
  RGD_SKILL_HELP,
  RGD_STEP_HELP,
  type HelpSectionId,
} from "./helpContent";

type HelpPanelProps = {
  open: boolean;
  onClose: () => void;
  initialSection?: HelpSectionId;
};

export function HelpPanel({
  open,
  onClose,
  initialSection = "app",
}: HelpPanelProps) {
  const titleId = useId();
  const [section, setSection] = useState<HelpSectionId>(initialSection);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      setSection(initialSection);
      // Focus close control for keyboard users
      window.setTimeout(() => closeRef.current?.focus(), 0);
    }
  }, [open, initialSection]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-panel help-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="help-panel-header">
          <h2 id={titleId}>Help</h2>
          <button
            ref={closeRef}
            type="button"
            className="ghost"
            onClick={onClose}
          >
            Close
          </button>
        </header>

        <div className="help-panel-body">
          <nav className="help-nav" aria-label="Help topics">
            {HELP_NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                className={
                  section === item.id ? "help-nav-item active" : "help-nav-item"
                }
                aria-current={section === item.id ? "page" : undefined}
                onClick={() => setSection(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="help-content" tabIndex={0}>
            {section === "app" && <HowAppWorks />}
            {section === "moodboard" && <MoodBoardHelp />}
            {section === "rgd-overview" && <RgdOverview />}
            {section === "rgd-steps" && <RgdSteps />}
            {section === "rgd-skills" && <RgdSkills />}
            {section === "rgd-app" && <RgdInApp />}
          </div>
        </div>
      </div>
    </div>
  );
}

function HowAppWorks() {
  return (
    <article className="help-article">
      <h3>How GDD Studio works</h3>
      <p className="muted">
        Local-first game design docs. Projects live on disk; no account required
        for v1.
      </p>
      <ul className="help-feature-list">
        <li>
          <strong>Launcher</strong> — projects only: create, open, or remove.
          Options covers updates and variable display. Open Help from the
          launcher or the editor chrome.
        </li>
        <li>
          <strong>Multi-document projects</strong> — each project holds many
          documents. Left rail → <strong>Documents</strong> pane: create,
          switch, or delete (the main doc cannot be deleted). The active doc is
          what Flowchart / RGD / Mood Board inserts target.
        </li>
        <li>
          <strong>Document editing</strong> — rich-text GDD with headings,
          lists, alignment, fonts, variables, media, flowchart embeds, and live
          RGD tables. Left rail top is the <strong>Document map</strong>{" "}
          (heading outline for in-doc jump navigation). Right rail holds
          variables (and word lookup when open).
        </li>
        <li>
          <strong>Wiki links</strong> — type <code>[[Doc Title]]</code> or use
          toolbar <strong>Link</strong> to link to another document in the same
          project. Clicking opens/switches that doc. There is no heading / section
          link picker — use the Document map for in-doc navigation.
        </li>
        <li>
          <strong>Resizable panes</strong> — drag the handles between panes.
          Document: map|docs, left rail|editor|variables. Flowcharts:
          list|canvas. RGD: sheets|editor and form|preview. Sizes persist in
          localStorage across reloads; narrow windows stack panes instead of
          dragging.
        </li>
        <li>
          <strong>Flowcharts</strong> — named diagrams with typed nodes and
          connectors; embed live references in the active document.
        </li>
        <li>
          <strong>RGD</strong> — Rational Game Design sheets (one per gameplay)
          in a library tab, edited as forms; Insert RGD table embeds a live
          mechanic table in the active document. See Help → Using RGD here.
        </li>
        <li>
          <strong>Mood Board</strong> — project scratchpad for reference media
          before placing embeds in the active document. See Help → Mood Board.
        </li>
        <li>
          <strong>Variables</strong> — project-wide named values that resolve
          live wherever chips appear (every document shares one registry). Type{" "}
          <code>{"{{variablename}}"}</code> to insert (creates if missing), or
          use the Variables panel. Edit a value once and every chip updates.
          Toggle “Display variable names in document” in Options.
        </li>
        <li>
          <strong>Media</strong> — paste or Insert media for images, gifs,
          video, and audio with built-in players (into the active document).
        </li>
        <li>
          <strong>Templates</strong> — save the active document body as app- or
          project-scoped template; apply replaces the current body (confirm).
        </li>
        <li>
          <strong>Spellcheck</strong> — offline dictionary underlines
          misspellings. Right-click or Alt+Click a word for suggestions, Add to
          dictionary, or Look up. Toolbar Look up opens a definition panel.
        </li>
        <li>
          <strong>Export PDF</strong> — opens a print dialog (Save as PDF on
          most desktops). Flowchart and RGD embeds are captured as images in
          place; images/gifs export normally; video may appear as a single
          frame. Export HTML is sanitized before print.
        </li>
      </ul>
    </article>
  );
}

function MoodBoardHelp() {
  return (
    <article className="help-article">
      <h3>Mood Board</h3>
      <p>
        A project-local scratchpad for reference images, gifs, video, and audio
        before you place them in the <em>active</em> Document. Assets stay in
        the project media store — same pipeline as Document paste/insert.
      </p>
      <ul className="help-feature-list">
        <li>
          <strong>Add media</strong> — drop files onto the board, paste from the
          OS clipboard, or use Add media…
        </li>
        <li>
          <strong>Tile notes</strong> — right-click a tile → Comment. Notes show
          under the tile (Note badge when set).
        </li>
        <li>
          <strong>Board clipboard</strong> — Copy / Cut / Paste / Delete for
          selected tiles (context menu or shortcuts when the board is focused).
          Paste also imports OS clipboard files when the board clipboard is
          empty.
        </li>
        <li>
          <strong>Insert into Document</strong> — places a media embed at the
          last TipTap cursor in the active document. The Document editor stays
          mounted (hidden) while you browse other tabs so the selection
          survives. If Document was never focused, the embed is appended at the
          end.
        </li>
      </ul>
      <p className="muted tiny">
        v1 is a grid with comments — not a free-position canvas.
      </p>
    </article>
  );
}

function RgdOverview() {
  return (
    <article className="help-article">
      <h3>What is Rational Game Design?</h3>
      <p>
        A Ubisoft-origin methodology for <strong>rationalizing</strong>{" "}
        gameplay: strip a challenge to skills, inputs, and measurable{" "}
        <strong>atomic parameters</strong>, then recombine those into{" "}
        <strong>patterns</strong> with readable <strong>signs/feedback</strong>.
        The goal is intentional difficulty and variety — not “feel-based” tweaks
        alone.
      </p>
      <p className="muted">
        It is a design lens for documentation. GDD Studio does not add telemetry
        or auto-balance.
      </p>
      <p>
        <strong>Form vs function:</strong> function = skills, inputs,
        parameters; form = art/story/aesthetics that communicate those
        functions.
      </p>
      <p className="muted tiny">
        Methods associated with Ubisoft practice and public writeups (e.g.
        McEntee 2012). Not an official Ubisoft product endorsement.
      </p>
    </article>
  );
}

function RgdSteps() {
  return (
    <article className="help-article">
      <h3>The 7 steps</h3>
      <p className="muted">
        Teaching scaffold for the methodology. Day-to-day editing centers on the
        mechanic → skill → parameter table; pillars, patterns, and signs stay
        available as optional sheet context. Fill what you need.
      </p>
      <ol className="help-step-list">
        {RGD_STEP_HELP.map((s) => (
          <li key={s.n}>
            <div className="help-step-card">
              <span className="help-step-badge" aria-hidden>
                {s.n}
              </span>
              <div>
                <h4>{s.title}</h4>
                <p>{s.why}</p>
                <p className="muted tiny">{s.map}</p>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </article>
  );
}

function RgdSkills() {
  return (
    <article className="help-article">
      <h3>Player skills</h3>
      <p className="muted">
        Every skill on an RGD sheet has a required category. Document tables
        color-code skill cells to match.
      </p>
      <div className="help-skill-grid">
        {RGD_SKILL_HELP.map((cat) => (
          <section
            key={cat.id}
            className={`help-skill-card rgd-skill-cat-${cat.id}`}
            aria-labelledby={`help-skill-${cat.id}`}
          >
            <h4 id={`help-skill-${cat.id}`}>{cat.label} Skills</h4>
            <p className="help-skill-def">{cat.definition}</p>
            <ul className="help-skill-examples">
              {cat.examples.map((skill) => (
                <li key={skill}>
                  <span className={`help-skill-chip rgd-skill-cat-${cat.id}`}>
                    {skill}
                  </span>
                </li>
              ))}
              <li>
                <span className="help-skill-chip help-skill-chip-etc">Etc.</span>
              </li>
            </ul>
          </section>
        ))}
      </div>
    </article>
  );
}

function RgdInApp() {
  return (
    <article className="help-article">
      <h3>Using RGD in this app</h3>
      <ul className="help-feature-list">
        <li>
          <strong>Sheets</strong> — one sheet per gameplay loop (Combat,
          Stealth, …). Create and edit them under the <strong>RGD</strong> tab
          (library, like Flowcharts).
        </li>
        <li>
          <strong>Form editor</strong> — fill mechanics, optional player input,
          player skills (with Physical / Mental / Social category), atomic
          parameters, and cases. Optional pillars / pattern / signs live in a
          collapsed context section.
        </li>
        <li>
          <strong>Document tables</strong> — Insert RGD… embeds a live table
          titled with the gameplay name; edits update every embed. PDF export
          captures the table as an image.
        </li>
        <li>
          <strong>Flowcharts</strong> — link a primary or pattern flowchart from
          the sheet; Open jumps to the Flowcharts tab.
        </li>
        <li>
          <strong>Starter</strong> — New Project can include an RGD starter
          sheet; RGD is never forced on every project.
        </li>
      </ul>
      <h4 className="help-subhead">Further reading</h4>
      <ul className="help-feature-list muted">
        <li>
          Chris McEntee — “Rational Design: The Core of Rayman Origins” (Game
          Developer, 2012)
        </li>
        <li>Project PDF: Rational Game Design intro (in project docs)</li>
      </ul>
    </article>
  );
}
