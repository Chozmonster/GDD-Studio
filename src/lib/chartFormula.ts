/**
 * Graph (Charts) formula helper — freeform expression → swept X rows.
 * Safe AST evaluator (no eval/Function). Not a spreadsheet engine.
 * Disk/API IDs stay under `charts`; UI label is Graph.
 */

/** Dark-theme-friendly series colours (Graph / Charts MVP palette). */
export const CHART_SERIES_COLORS = [
  "#6db3a8",
  "#c9a86c",
  "#7a9fd4",
  "#c47a8a",
  "#9b8fd4",
  "#8fbf6d",
] as const;

export function seriesColorAt(index: number, override?: string | null): string {
  if (override && override.trim()) return override.trim();
  return CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length];
}

/** Independent axis symbol swept over the domain. */
export const CHART_INDEPENDENT_VAR = "x";

const BUILTIN_FUNCS = new Set([
  "exp",
  "abs",
  "sqrt",
  "ln",
  "log",
  "sin",
  "cos",
  "tan",
  "min",
  "max",
  "pow",
]);

const BUILTIN_CONSTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
};

export type FormulaPresetAxisDefaults = {
  xLabel?: string;
  yLabel?: string;
  seriesName?: string;
};

export type FormulaPresetDomainDefaults = {
  xStart: string;
  xEnd: string;
  step: string;
};

export type FormulaPreset = {
  id: string;
  label: string;
  expression: string;
  /** Default constant bindings (not including x). */
  variables: Array<{ name: string; value: string }>;
  /**
   * Compact formula-pane blurb: what the shape is for + 1–2 design examples.
   * Shown when this preset is selected.
   */
  explanation: string;
  /** Optional domain seeded when the preset is selected. */
  domain?: FormulaPresetDomainDefaults;
  /** Optional axis / series labels seeded when the preset is selected. */
  axis?: FormulaPresetAxisDefaults;
};

/** Shown when Preset = Custom (or formula edited away from a preset). */
export const CUSTOM_FORMULA_NOTE =
  "Custom expression — add variables below and sweep x over a domain. Presets seed common design curves.";

export const CHART_FORMULA_PRESETS: FormulaPreset[] = [
  {
    id: "linear",
    label: "Linear (m·x + b)",
    expression: "m*x + b",
    variables: [
      { name: "m", value: "1" },
      { name: "b", value: "0" },
    ],
    explanation:
      "Steady, constant-rate growth. Vars: m = slope (gain per x); b = intercept (value at x = 0). Examples: fixed XP per level; a shop price that rises by the same amount each tier.",
    domain: { xStart: "1", xEnd: "20", step: "1" },
    axis: { xLabel: "Level", seriesName: "Value", yLabel: "Value" },
  },
  {
    id: "quadratic",
    label: "Quadratic (a·x² + b·x + c)",
    expression: "a*x^2 + b*x + c",
    variables: [
      { name: "a", value: "1" },
      { name: "b", value: "0" },
      { name: "c", value: "0" },
    ],
    explanation:
      "Gentle early, steeper later (or reverse with negative a). Vars: a = curvature; b = linear tilt; c = offset. Examples: soft-cap XP tables; mid-game damage that accelerates.",
    domain: { xStart: "1", xEnd: "20", step: "1" },
    axis: { xLabel: "Level", seriesName: "Value", yLabel: "Value" },
  },
  {
    id: "power",
    label: "Power (a·x^b + c)",
    expression: "a * x^b + c",
    variables: [
      { name: "a", value: "100" },
      { name: "b", value: "1.5" },
      { name: "c", value: "0" },
    ],
    explanation:
      "Tunable curvature via exponent. Vars: a = scale; b = exponent (>1 accelerates, <1 softens); c = offset. Examples: classic RPG XP-to-next-level; upgrade costs that scale superlinearly.",
    domain: { xStart: "1", xEnd: "20", step: "1" },
    axis: { xLabel: "Level", seriesName: "XP", yLabel: "XP" },
  },
  {
    id: "exponential",
    label: "Exponential (a·r^x)",
    expression: "a * r^x",
    variables: [
      { name: "a", value: "10" },
      { name: "r", value: "1.15" },
    ],
    explanation:
      "Compound growth each step. Vars: a = starting scale; r = growth ratio per x (e.g. 1.15 ≈ +15%/step). Examples: interest-like rewards; enemy HP that multiplies every few levels.",
    domain: { xStart: "1", xEnd: "20", step: "1" },
    axis: { xLabel: "Level", seriesName: "Value", yLabel: "Value" },
  },
  {
    id: "linear-exp-hybrid",
    label: "Linear-Exponential Hybrid",
    expression: "a*x + b*(r^x - 1)",
    variables: [
      { name: "a", value: "5" },
      { name: "b", value: "2" },
      { name: "r", value: "1.08" },
    ],
    explanation:
      "Blend of linear growth and exponential kick. Vars: a = linear rate; b = exponential weight; r = growth ratio (>1 accelerates). Examples: upgrade costs gentle early then steep; XP sinks fair early, punishing late.",
    domain: { xStart: "1", xEnd: "25", step: "1" },
    axis: { xLabel: "Level", seriesName: "Cost", yLabel: "Cost" },
  },
  {
    id: "logarithmic",
    label: "Logarithmic Curve",
    expression: "a * ln(x + c) + b",
    variables: [
      { name: "a", value: "10" },
      { name: "c", value: "1" },
      { name: "b", value: "0" },
    ],
    explanation:
      "Diminishing returns. Vars: a = scale; c = domain shift (keep x+c > 0); b = offset. Examples: accuracy/crit soft-caps; gather yield that flattens with investment.",
    domain: { xStart: "0", xEnd: "50", step: "1" },
    axis: { xLabel: "Investment", seriesName: "Return", yLabel: "Return" },
  },
  {
    id: "mitigation",
    label: "Mitigation (Armor & Defense)",
    expression: "x / (x + k)",
    variables: [{ name: "k", value: "100" }],
    explanation:
      "Diminishing mitigation → approaches 100%, never reaches it. Vars: k = half-mitigation point (at x = k, y = 0.5). Examples: armor → damage reduction; magic resist → spell mitigation. Same shape as 1 − 1/(1 + x/k).",
    domain: { xStart: "0", xEnd: "500", step: "25" },
    axis: {
      xLabel: "Armor",
      seriesName: "Damage reduction",
      yLabel: "Damage reduction",
    },
  },
  {
    id: "pity-rate",
    label: "Soft Pity Rate (Gacha)",
    expression: "min(pmax, base + max(0, x - start) * ramp)",
    variables: [
      { name: "base", value: "0.006" },
      { name: "start", value: "74" },
      { name: "ramp", value: "0.06" },
      { name: "pmax", value: "1" },
    ],
    explanation:
      "Per-pull hit rate with soft pity. Vars: base = rate before pity; start = pull where ramp begins; ramp = rate added per pull after start; pmax = cap (often 1). Examples: gacha rate-up banners; climb toward a guaranteed drop.",
    domain: { xStart: "1", xEnd: "90", step: "1" },
    axis: {
      xLabel: "Pull #",
      seriesName: "Hit rate",
      yLabel: "Hit rate",
    },
  },
  {
    id: "pity-cumulative",
    label: "Cumulative Chance (Loot)",
    expression: "1 - (1 - p)^x",
    variables: [{ name: "p", value: "0.05" }],
    explanation:
      "Chance of ≥1 hit after x independent rolls. Vars: p = per-roll success rate (0–1). Examples: loot-table “how many chests until likely”; pair with Soft Pity Rate when per-pull odds also ramp.",
    domain: { xStart: "1", xEnd: "100", step: "1" },
    axis: {
      xLabel: "Pulls / rolls",
      seriesName: "Cumulative chance",
      yLabel: "Cumulative chance",
    },
  },
];

export function formulaPresetById(id: string): FormulaPreset | undefined {
  return CHART_FORMULA_PRESETS.find((p) => p.id === id);
}

export function explanationForPresetId(presetId: string): string {
  if (!presetId) return CUSTOM_FORMULA_NOTE;
  return formulaPresetById(presetId)?.explanation ?? CUSTOM_FORMULA_NOTE;
}
export type FormulaPoint = {
  x: number;
  y: number;
};

export type FormulaEvalOk = {
  ok: true;
  points: FormulaPoint[];
};

export type FormulaEvalErr = {
  ok: false;
  error: string;
};

export type FormulaEvalResult = FormulaEvalOk | FormulaEvalErr;

export type FormulaSweepParams = {
  expression: string;
  /** Constant bindings (x is supplied by the sweep). */
  variables: Record<string, number>;
  xStart: number;
  xEnd: number;
  step?: number;
  /** Override independent-axis name (default `x`). */
  independent?: string;
};

// ── Tokenizer ──────────────────────────────────────────────────────────────

type TokKind =
  | "num"
  | "ident"
  | "op"
  | "lparen"
  | "rparen"
  | "comma"
  | "eof";

type Tok = { kind: TokKind; value: string; pos: number };

function tokenize(src: string): Tok[] | { error: string } {
  const tokens: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      const start = i;
      let sawDot = ch === ".";
      i++;
      while (i < src.length) {
        const c = src[i]!;
        if (c === "." && !sawDot) {
          sawDot = true;
          i++;
          continue;
        }
        if (/[0-9]/.test(c)) {
          i++;
          continue;
        }
        break;
      }
      const raw = src.slice(start, i);
      if (raw === "." || Number.isNaN(Number(raw))) {
        return { error: `Invalid number near “${raw}”` };
      }
      tokens.push({ kind: "num", value: raw, pos: start });
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      const start = i;
      i++;
      while (i < src.length && /[A-Za-z0-9_]/.test(src[i]!)) i++;
      tokens.push({ kind: "ident", value: src.slice(start, i), pos: start });
      continue;
    }
    if ("+-*/^".includes(ch)) {
      tokens.push({ kind: "op", value: ch, pos: i });
      i++;
      continue;
    }
    if (ch === "(") {
      tokens.push({ kind: "lparen", value: ch, pos: i });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ kind: "rparen", value: ch, pos: i });
      i++;
      continue;
    }
    if (ch === ",") {
      tokens.push({ kind: "comma", value: ch, pos: i });
      i++;
      continue;
    }
    return { error: `Unexpected character “${ch}”` };
  }
  tokens.push({ kind: "eof", value: "", pos: src.length });
  return tokens;
}

// ── AST ────────────────────────────────────────────────────────────────────

type Ast =
  | { type: "num"; value: number }
  | { type: "ident"; name: string }
  | { type: "unary"; op: "+" | "-"; arg: Ast }
  | { type: "binary"; op: "+" | "-" | "*" | "/" | "^"; left: Ast; right: Ast }
  | { type: "call"; name: string; args: Ast[] };

function parseExpression(src: string): Ast | { error: string } {
  const tokResult = tokenize(src);
  if ("error" in tokResult) return tokResult;
  const tokens = tokResult;
  let i = 0;

  const peek = () => tokens[i]!;
  const take = () => tokens[i++]!;

  const parsePrimary = (): Ast | { error: string } => {
    const t = peek();
    if (t.kind === "num") {
      take();
      return { type: "num", value: Number(t.value) };
    }
    if (t.kind === "ident") {
      take();
      if (peek().kind === "lparen") {
        take();
        const args: Ast[] = [];
        if (peek().kind !== "rparen") {
          for (;;) {
            const arg = parseExpr();
            if ("error" in arg) return arg;
            args.push(arg);
            if (peek().kind === "comma") {
              take();
              continue;
            }
            break;
          }
        }
        if (peek().kind !== "rparen") return { error: "Expected “)” after function args" };
        take();
        const name = t.value.toLowerCase();
        if (!BUILTIN_FUNCS.has(name)) {
          return { error: `Unknown function “${t.value}”` };
        }
        return { type: "call", name, args };
      }
      return { type: "ident", name: t.value };
    }
    if (t.kind === "lparen") {
      take();
      const inner = parseExpr();
      if ("error" in inner) return inner;
      if (peek().kind !== "rparen") return { error: "Expected closing “)”" };
      take();
      return inner;
    }
    return { error: "Expected a number, name, or “(”" };
  };

  const parseUnary = (): Ast | { error: string } => {
    const t = peek();
    if (t.kind === "op" && (t.value === "+" || t.value === "-")) {
      take();
      const arg = parseUnary();
      if ("error" in arg) return arg;
      return { type: "unary", op: t.value as "+" | "-", arg };
    }
    return parsePrimary();
  };

  const parsePower = (): Ast | { error: string } => {
    const left = parseUnary();
    if ("error" in left) return left;
    if (peek().kind === "op" && peek().value === "^") {
      take();
      const right = parsePower(); // right-associative
      if ("error" in right) return right;
      return { type: "binary", op: "^", left, right };
    }
    return left;
  };

  const parseTerm = (): Ast | { error: string } => {
    let left = parsePower();
    if ("error" in left) return left;
    while (peek().kind === "op" && (peek().value === "*" || peek().value === "/")) {
      const op = take().value as "*" | "/";
      const right = parsePower();
      if ("error" in right) return right;
      left = { type: "binary", op, left, right };
    }
    return left;
  };

  const parseExpr = (): Ast | { error: string } => {
    let left = parseTerm();
    if ("error" in left) return left;
    while (peek().kind === "op" && (peek().value === "+" || peek().value === "-")) {
      const op = take().value as "+" | "-";
      const right = parseTerm();
      if ("error" in right) return right;
      left = { type: "binary", op, left, right };
    }
    return left;
  };

  if (!src.trim()) return { error: "Enter a formula" };
  const ast = parseExpr();
  if ("error" in ast) return ast;
  if (peek().kind !== "eof") {
    return { error: `Unexpected “${peek().value || peek().kind}”` };
  }
  return ast;
}

function collectIdents(ast: Ast, into: Set<string>) {
  switch (ast.type) {
    case "num":
      return;
    case "ident":
      into.add(ast.name);
      return;
    case "unary":
      collectIdents(ast.arg, into);
      return;
    case "binary":
      collectIdents(ast.left, into);
      collectIdents(ast.right, into);
      return;
    case "call":
      for (const a of ast.args) collectIdents(a, into);
      return;
  }
}

/**
 * Identifiers referenced in the formula, excluding the independent axis
 * and built-in constants/functions (functions are parsed as calls).
 */
export function detectFormulaIdentifiers(
  expression: string,
  independent = CHART_INDEPENDENT_VAR,
): { ok: true; names: string[] } | { ok: false; error: string; names: string[] } {
  const ast = parseExpression(expression);
  if ("error" in ast) return { ok: false, error: ast.error, names: [] };
  const set = new Set<string>();
  collectIdents(ast, set);
  const indep = independent.toLowerCase();
  const names = [...set]
    .filter((n) => {
      const lower = n.toLowerCase();
      if (lower === indep) return false;
      if (lower in BUILTIN_CONSTS) return false;
      return true;
    })
    .sort((a, b) => a.localeCompare(b));
  return { ok: true, names };
}

function evalAst(
  ast: Ast,
  env: Record<string, number>,
): number | { error: string } {
  switch (ast.type) {
    case "num":
      return ast.value;
    case "ident": {
      const lower = ast.name.toLowerCase();
      if (lower in BUILTIN_CONSTS) return BUILTIN_CONSTS[lower]!;
      if (Object.prototype.hasOwnProperty.call(env, ast.name)) {
        return env[ast.name]!;
      }
      // Case-insensitive fallback for convenience.
      const hit = Object.keys(env).find((k) => k.toLowerCase() === lower);
      if (hit !== undefined) return env[hit]!;
      return { error: `Unknown variable “${ast.name}”` };
    }
    case "unary": {
      const v = evalAst(ast.arg, env);
      if (typeof v !== "number") return v;
      return ast.op === "-" ? -v : v;
    }
    case "binary": {
      const l = evalAst(ast.left, env);
      if (typeof l !== "number") return l;
      const r = evalAst(ast.right, env);
      if (typeof r !== "number") return r;
      let out: number;
      switch (ast.op) {
        case "+":
          out = l + r;
          break;
        case "-":
          out = l - r;
          break;
        case "*":
          out = l * r;
          break;
        case "/":
          if (r === 0) return { error: "Division by zero" };
          out = l / r;
          break;
        case "^":
          out = Math.pow(l, r);
          break;
      }
      if (!Number.isFinite(out)) return { error: "Result is not a finite number" };
      return out;
    }
    case "call": {
      const args: number[] = [];
      for (const a of ast.args) {
        const v = evalAst(a, env);
        if (typeof v !== "number") return v;
        args.push(v);
      }
      const need = (n: number) => {
        if (args.length !== n) {
          return { error: `${ast.name}() expects ${n} argument${n === 1 ? "" : "s"}` };
        }
        return null;
      };
      let out: number;
      switch (ast.name) {
        case "exp": {
          const err = need(1);
          if (err) return err;
          out = Math.exp(args[0]!);
          break;
        }
        case "abs": {
          const err = need(1);
          if (err) return err;
          out = Math.abs(args[0]!);
          break;
        }
        case "sqrt": {
          const err = need(1);
          if (err) return err;
          if (args[0]! < 0) return { error: "sqrt of negative number" };
          out = Math.sqrt(args[0]!);
          break;
        }
        case "ln": {
          const err = need(1);
          if (err) return err;
          if (args[0]! <= 0) return { error: "ln requires a positive number" };
          out = Math.log(args[0]!);
          break;
        }
        case "log": {
          const err = need(1);
          if (err) return err;
          if (args[0]! <= 0) return { error: "log requires a positive number" };
          out = Math.log10(args[0]!);
          break;
        }
        case "sin": {
          const err = need(1);
          if (err) return err;
          out = Math.sin(args[0]!);
          break;
        }
        case "cos": {
          const err = need(1);
          if (err) return err;
          out = Math.cos(args[0]!);
          break;
        }
        case "tan": {
          const err = need(1);
          if (err) return err;
          out = Math.tan(args[0]!);
          break;
        }
        case "min": {
          if (args.length < 1) return { error: "min() needs at least 1 argument" };
          out = Math.min(...args);
          break;
        }
        case "max": {
          if (args.length < 1) return { error: "max() needs at least 1 argument" };
          out = Math.max(...args);
          break;
        }
        case "pow": {
          const err = need(2);
          if (err) return err;
          out = Math.pow(args[0]!, args[1]!);
          break;
        }
        default:
          return { error: `Unknown function “${ast.name}”` };
      }
      if (!Number.isFinite(out)) return { error: "Result is not a finite number" };
      return out;
    }
  }
}

/** Evaluate expression at a single x (or custom independent) binding. */
export function evaluateFormulaAt(
  expression: string,
  variables: Record<string, number>,
  independentValue: number,
  independent = CHART_INDEPENDENT_VAR,
): number | { error: string } {
  const ast = parseExpression(expression);
  if ("error" in ast) return ast;
  const env = { ...variables, [independent]: independentValue };
  return evalAst(ast, env);
}

/** Sweep X over [start, end] by step and evaluate y for each point. */
export function evaluateFormulaSweep(
  params: FormulaSweepParams,
): FormulaEvalResult {
  const independent = params.independent ?? CHART_INDEPENDENT_VAR;
  const expression = params.expression.trim();
  if (!expression) return { ok: false, error: "Enter a formula" };

  const ast = parseExpression(expression);
  if ("error" in ast) return { ok: false, error: ast.error };

  const step =
    Number.isFinite(params.step) && (params.step as number) !== 0
      ? Math.abs(params.step as number)
      : 1;
  let start = Number.isFinite(params.xStart) ? params.xStart : 1;
  let end = Number.isFinite(params.xEnd) ? params.xEnd : start;
  if (end < start) {
    const tmp = start;
    start = end;
    end = tmp;
  }

  // Ensure referenced constants exist (except independent + builtins).
  const idents = new Set<string>();
  collectIdents(ast, idents);
  for (const name of idents) {
    const lower = name.toLowerCase();
    if (lower === independent.toLowerCase()) continue;
    if (lower in BUILTIN_CONSTS) continue;
    const has =
      Object.prototype.hasOwnProperty.call(params.variables, name) ||
      Object.keys(params.variables).some((k) => k.toLowerCase() === lower);
    if (!has) {
      return { ok: false, error: `Add a value for variable “${name}”` };
    }
  }

  const points: FormulaPoint[] = [];
  const maxPoints = 500;
  for (let x = start, n = 0; x <= end + 1e-9 && n < maxPoints; x += step, n++) {
    const roundedX = Math.round(x * 1e6) / 1e6;
    const env = { ...params.variables, [independent]: roundedX };
    const raw = evalAst(ast, env);
    if (typeof raw !== "number") return { ok: false, error: raw.error };
    const y = Math.round(raw * 1000) / 1000;
    points.push({ x: roundedX, y });
  }
  if (points.length === 0) {
    return { ok: false, error: "Domain produced no points (check start / end / step)" };
  }
  return { ok: true, points };
}

/** Validate a user-entered variable name. */
export function isValidFormulaVarName(
  name: string,
  independent = CHART_INDEPENDENT_VAR,
): string | null {
  const t = name.trim();
  if (!t) return "Name required";
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(t)) {
    return "Use letters, digits, underscore (start with a letter)";
  }
  const lower = t.toLowerCase();
  if (lower === independent.toLowerCase()) {
    return `“${independent}” is the swept axis — pick another name`;
  }
  if (BUILTIN_FUNCS.has(lower) || lower in BUILTIN_CONSTS) {
    return `“${t}” is reserved`;
  }
  return null;
}
