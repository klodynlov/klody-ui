/**
 * Coloration syntaxique légère, sans dépendance, 100 % offline.
 *
 * Pourquoi maison plutôt que Prism/Shiki : le projet reste minimaliste (≈6 deps)
 * et tourne hors-ligne ; surtout, les couleurs proviennent des tokens `colors.*`
 * du thème — qui sont des `var(--…)` — donc la coloration suit automatiquement
 * le mode clair/sombre sans la moindre détection côté React.
 *
 * Garantie de robustesse : le tokenizer recrache TOUS les caractères de l'entrée,
 * dans l'ordre, exactement une fois. La coloration est purement visuelle ; le
 * contenu copié (cf. bouton Copier) reste l'original intact.
 */

import { colors } from "./theme";

export type TokType =
  | "plain" | "kw" | "str" | "com" | "num" | "fn" | "const" | "var" | "tag";

export interface Tok {
  t: TokType;
  v: string;
}

const COLOR: Record<TokType, string> = {
  plain: colors.text,
  kw: colors.accentViolet, // mots-clés
  str: colors.success, // chaînes (olive)
  com: colors.textSoft, // commentaires (gris doux)
  num: colors.accentAmber, // nombres (ambre)
  fn: colors.info, // appels de fonction (teal)
  const: colors.warning, // littéraux (true/false/None…) — gold
  var: colors.primary, // variables shell $VAR (terra)
  tag: colors.accentCyan, // balises
};

export const colorOf = (t: TokType): string => COLOR[t];
export const isComment = (t: TokType): boolean => t === "com";

// ── Définition d'un langage ───────────────────────────────────────────────────

interface Lang {
  line: string[]; // amorces de commentaire de ligne
  block: [string, string][]; // paires de commentaire de bloc
  quotes: string[]; // délimiteurs de chaîne (1 caractère)
  triple: boolean; // chaînes triple-quote (Python)
  template: boolean; // littéraux gabarit `...` (multi-lignes autorisées)
  dollarVar: boolean; // variables $VAR (shell)
  keywords: Set<string>;
  constants: Set<string>;
}

const set = (s: string) => new Set(s.split(/\s+/).filter(Boolean));

const PY_KW = set(`
  def class return if elif else for while try except finally with as import from
  pass break continue lambda yield global nonlocal raise assert del in is not and
  or async await match case print self`);
const JS_KW = set(`
  const let var function return if else for while do switch case break continue
  new class extends super this typeof instanceof in of try catch finally throw
  async await yield import export from default delete void public private protected
  readonly interface type enum implements namespace declare as keyof infer get set
  static abstract satisfies`);
const SH_KW = set(`
  if then else elif fi for while until do done case esac function in return local
  export source echo cd set unset readonly declare`);
const CLIKE_KW = set(`
  func fn def return if else for while do switch case break continue struct class
  interface enum import package public private protected static final const let var
  new delete try catch finally throw type namespace using namespace go defer chan
  map range select impl trait mut pub use mod match fn where`);
const GENERIC_KW = set(`
  function def fn func return if else elif for while do switch case break continue
  class struct interface enum import export from const let var new try catch finally
  throw public private protected static async await yield`);

const LANGS: Record<string, Lang> = {
  python: { line: ["#"], block: [], quotes: ['"', "'"], triple: true, template: false, dollarVar: false, keywords: PY_KW, constants: set("True False None NotImplemented Ellipsis __name__") },
  js: { line: ["//"], block: [["/*", "*/"]], quotes: ['"', "'"], triple: false, template: true, dollarVar: false, keywords: JS_KW, constants: set("true false null undefined NaN Infinity") },
  shell: { line: ["#"], block: [], quotes: ['"', "'"], triple: false, template: false, dollarVar: true, keywords: SH_KW, constants: set("true false") },
  json: { line: [], block: [], quotes: ['"'], triple: false, template: false, dollarVar: false, keywords: set(""), constants: set("true false null") },
  clike: { line: ["//"], block: [["/*", "*/"]], quotes: ['"', "'"], triple: false, template: false, dollarVar: false, keywords: CLIKE_KW, constants: set("true false null nil None NULL") },
  generic: { line: [], block: [["/*", "*/"], ["<!--", "-->"]], quotes: ['"', "'"], triple: false, template: false, dollarVar: false, keywords: GENERIC_KW, constants: set("true false null nil None True False") },
};

const ALIAS: Record<string, string> = {
  py: "python", python3: "python", py3: "python",
  javascript: "js", ts: "js", typescript: "js", jsx: "js", tsx: "js", mjs: "js", cjs: "js", node: "js",
  sh: "shell", bash: "shell", zsh: "shell", shell: "shell", console: "shell", terminal: "shell",
  json: "json", json5: "json",
  c: "clike", cpp: "clike", "c++": "clike", h: "clike", hpp: "clike", java: "clike", go: "clike",
  golang: "clike", rust: "clike", rs: "clike", php: "clike", swift: "clike", kotlin: "clike",
  kt: "clike", csharp: "clike", cs: "clike", scala: "clike", dart: "clike",
};

function resolveLang(lang?: string): Lang {
  if (!lang) return LANGS.generic;
  const key = lang.toLowerCase();
  return LANGS[key] ?? LANGS[ALIAS[key]] ?? LANGS.generic;
}

// ── Scanner ───────────────────────────────────────────────────────────────────

const isIdentStart = (c: string) => /[A-Za-z_$]/.test(c);
const isIdentPart = (c: string) => /[A-Za-z0-9_$]/.test(c);
const isDigit = (c: string) => c >= "0" && c <= "9";

function scanString(s: string, start: number, q: string, multiline: boolean): number {
  const n = s.length;
  let i = start + 1;
  while (i < n) {
    const c = s[i];
    if (c === "\\") { i += 2; continue; } // échappement
    if (c === q) return i + 1;
    if (c === "\n" && !multiline) return i; // quote non fermée → on s'arrête en fin de ligne
    i++;
  }
  return n;
}

function scan(s: string, cfg: Lang): Tok[] {
  const out: Tok[] = [];
  const n = s.length;
  let i = 0;
  let plainStart = 0;
  const flush = (end: number) => { if (end > plainStart) out.push({ t: "plain", v: s.slice(plainStart, end) }); };

  outer: while (i < n) {
    const c = s[i];

    // 1) commentaires de bloc
    for (const [open, close] of cfg.block) {
      if (s.startsWith(open, i)) {
        flush(i);
        const idx = s.indexOf(close, i + open.length);
        const end = idx === -1 ? n : idx + close.length;
        out.push({ t: "com", v: s.slice(i, end) });
        i = end; plainStart = i; continue outer;
      }
    }
    // 2) commentaires de ligne
    for (const lc of cfg.line) {
      if (s.startsWith(lc, i)) {
        flush(i);
        const idx = s.indexOf("\n", i);
        const end = idx === -1 ? n : idx;
        out.push({ t: "com", v: s.slice(i, end) });
        i = end; plainStart = i; continue outer;
      }
    }
    // 3) chaînes triple-quote (Python)
    if (cfg.triple && (s.startsWith('"""', i) || s.startsWith("'''", i))) {
      flush(i);
      const q = s.substr(i, 3);
      const idx = s.indexOf(q, i + 3);
      const end = idx === -1 ? n : idx + 3;
      out.push({ t: "str", v: s.slice(i, end) });
      i = end; plainStart = i; continue;
    }
    // 4) chaînes simples / doubles / gabarit
    if (cfg.quotes.includes(c) || (cfg.template && c === "`")) {
      flush(i);
      const end = scanString(s, i, c, c === "`");
      out.push({ t: "str", v: s.slice(i, end) });
      i = end; plainStart = i; continue;
    }
    // 5) variables shell $VAR / ${VAR}
    if (cfg.dollarVar && c === "$") {
      flush(i);
      let j = i + 1;
      if (s[j] === "{") { const e = s.indexOf("}", j); j = e === -1 ? n : e + 1; }
      else { while (j < n && isIdentPart(s[j])) j++; }
      if (j === i + 1) { i++; continue; } // simple "$" isolé → plain
      out.push({ t: "var", v: s.slice(i, j) });
      i = j; plainStart = i; continue;
    }
    // 6) nombres
    if (isDigit(c) || (c === "." && isDigit(s[i + 1] ?? ""))) {
      flush(i);
      let j = i;
      if (c === "0" && (s[i + 1] === "x" || s[i + 1] === "X")) {
        j = i + 2; while (j < n && /[0-9a-fA-F_]/.test(s[j])) j++;
      } else {
        while (j < n && /[0-9_]/.test(s[j])) j++;
        if (s[j] === ".") { j++; while (j < n && /[0-9_]/.test(s[j])) j++; }
        if (s[j] === "e" || s[j] === "E") { j++; if (s[j] === "+" || s[j] === "-") j++; while (j < n && isDigit(s[j])) j++; }
      }
      out.push({ t: "num", v: s.slice(i, j) });
      i = j; plainStart = i; continue;
    }
    // 7) identifiants / mots-clés / appels de fonction
    if (isIdentStart(c)) {
      flush(i);
      let j = i + 1;
      while (j < n && isIdentPart(s[j])) j++;
      const word = s.slice(i, j);
      let t: TokType = "plain";
      if (cfg.keywords.has(word)) t = "kw";
      else if (cfg.constants.has(word)) t = "const";
      else {
        let k = j; while (k < n && (s[k] === " " || s[k] === "\t")) k++;
        if (s[k] === "(") t = "fn";
      }
      out.push({ t, v: word });
      i = j; plainStart = i; continue;
    }
    // défaut : opérateurs / ponctuation / espaces → accumulés en plain
    i++;
  }
  flush(n);
  return out;
}

/**
 * Découpe le code coloré en lignes (pour le tableau à numéros de ligne).
 * Renvoie un tableau de lignes, chacune étant une liste de tokens.
 */
export function highlightToLines(code: string, lang?: string): Tok[][] {
  // Garde-fou : au-delà d'un certain volume, on rend en clair (perf + sûreté).
  if (code.length > 20000) {
    return code.split("\n").map((l) => (l ? [{ t: "plain" as TokType, v: l }] : []));
  }
  const toks = scan(code, resolveLang(lang));
  const lines: Tok[][] = [[]];
  for (const tok of toks) {
    const parts = tok.v.split("\n");
    for (let p = 0; p < parts.length; p++) {
      if (p > 0) lines.push([]);
      if (parts[p].length) lines[lines.length - 1].push({ t: tok.t, v: parts[p] });
    }
  }
  return lines;
}
