import type { LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type ToolbarIconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  icon: LucideIcon;
  pressed?: boolean;
  /** Optional trailing text for actions that aren't pure icons */
  children?: ReactNode;
};

/** Dark-toolbar control with Lucide glyph + accessible name/tooltip. */
export function ToolbarIconButton({
  label,
  icon: Icon,
  pressed,
  children,
  className,
  ...rest
}: ToolbarIconButtonProps) {
  const classes = ["toolbar-icon-btn", className].filter(Boolean).join(" ");
  return (
    <button
      type="button"
      className={classes}
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      {...rest}
    >
      <Icon className="toolbar-icon" aria-hidden strokeWidth={2} />
      {children ? <span className="toolbar-icon-label">{children}</span> : null}
    </button>
  );
}
