import { useEffect, useId, useRef, useState } from "react";
import {
  HELP_APP,
  HELP_CHARTS,
  HELP_MOOD_BOARD,
  HELP_NAV,
  HELP_RGD_APP,
  HELP_RGD_OVERVIEW,
  HELP_RGD_SKILLS_LEAD,
  HELP_RGD_STEPS_LEAD,
  RGD_SKILL_HELP,
  RGD_STEP_HELP,
  type HelpArticleContent,
  type HelpSectionId,
  type HelpTopic,
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
            {section === "app" && <Article article={HELP_APP} />}
            {section === "moodboard" && <Article article={HELP_MOOD_BOARD} />}
            {section === "charts" && <Article article={HELP_CHARTS} />}
            {section === "rgd-overview" && (
              <Article article={HELP_RGD_OVERVIEW} />
            )}
            {section === "rgd-steps" && <RgdSteps />}
            {section === "rgd-skills" && <RgdSkills />}
            {section === "rgd-app" && <Article article={HELP_RGD_APP} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function Article({ article }: { article: HelpArticleContent }) {
  return (
    <article className="help-article">
      <h3>{article.title}</h3>
      {article.lead ? <p className="muted">{article.lead}</p> : null}
      {article.topics?.map((topic) => (
        <TopicBlock key={topic.title} topic={topic} />
      ))}
      {article.furtherReading && article.furtherReading.length > 0 ? (
        <>
          <h4 className="help-subhead">Further reading</h4>
          <ul className="help-feature-list muted">
            {article.furtherReading.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      ) : null}
      {article.footnote ? (
        <p className="muted tiny">{article.footnote}</p>
      ) : null}
    </article>
  );
}

function TopicBlock({ topic }: { topic: HelpTopic }) {
  return (
    <section className="help-topic">
      <h4 className="help-subhead">{topic.title}</h4>
      {topic.lead ? <p>{topic.lead}</p> : null}
      {topic.steps && topic.steps.length > 0 ? (
        <ol className="help-howto-list">
          {topic.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      ) : null}
      {topic.tips && topic.tips.length > 0 ? (
        <ul className="help-feature-list">
          {topic.tips.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      ) : null}
      {topic.note ? <p className="muted tiny">{topic.note}</p> : null}
    </section>
  );
}

function RgdSteps() {
  return (
    <article className="help-article">
      <h3>The 7 steps</h3>
      <p className="muted">{HELP_RGD_STEPS_LEAD}</p>
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
      <p className="muted">{HELP_RGD_SKILLS_LEAD}</p>
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
