import { useEffect, useId, useRef, useState } from "react";
import { HELP_NAV, RGD_STEP_HELP, type HelpSectionId } from "./helpContent";

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
            {section === "rgd-overview" && <RgdOverview />}
            {section === "rgd-steps" && <RgdSteps />}
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
          <strong>Launcher</strong> — create, open, or remove projects; Options
          for updates and variable display.
        </li>
        <li>
          <strong>Document</strong> — one rich-text GDD per project, heading map,
          section links (<code>[[Heading text]]</code>), variables, media,
          templates, PDF export.
        </li>
        <li>
          <strong>Flowcharts</strong> — named diagrams with typed nodes and
          connectors; embed live references in the document.
        </li>
        <li>
          <strong>RGD</strong> — Rational Game Design sheets (one per gameplay)
          edited as forms; live mechanic tables in the document.
        </li>
        <li>
          <strong>Variables</strong> — named values that resolve live wherever
          chips appear. Toggle “show names” in Options.
        </li>
        <li>
          <strong>Section links</strong> — toolbar Link or{" "}
          <code>[[Heading]]</code> jumps to that heading in the same document
          (Document map lists the same targets).
        </li>
        <li>
          <strong>Media</strong> — paste or Insert media for images, gifs,
          video, and audio with built-in players.
        </li>
        <li>
          <strong>Templates</strong> — save the document body as app- or
          project-scoped template; apply replaces the current body (confirm).
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
          player skills, atomic parameters, and cases. Optional pillars /
          pattern / signs live in a collapsed context section.
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
