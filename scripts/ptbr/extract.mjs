#!/usr/bin/env node
// Extrai textos de interface (inglês) do código-fonte da UI para tradução pt-BR.
//
// Uso:
//   node scripts/ptbr/extract.mjs            -> grava scripts/ptbr/out/strings.json (todos)
//                                               e scripts/ptbr/out/pending.json (ainda sem tradução)
//
// Formato de saída: { exact: string[], patterns: string[] }
//   exact    = texto literal (espaços normalizados)
//   patterns = template literals, com {0}, {1}... no lugar das expressões

import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const require = createRequire(join(repoRoot, "node_modules/.pnpm/node_modules/x.js"));
const { parse } = require("@babel/parser");

const SOURCE_ROOTS = [
  { dir: "ui/src", maxLen: 600 },
  // Pacotes compartilhados: só rótulos curtos (evita prompts de agentes e mensagens internas).
  { dir: "packages/shared/src", maxLen: 120 },
  { dir: "packages/adapter-utils/src", maxLen: 120 },
];

const EXCLUDED_PATH = /(\.test\.|\.spec\.|\.stories\.|__tests__|__snapshots__|\/fixtures?\/|\/storybook\/|\/artifact-directions\/|preview-main\.tsx$|\/ptbr\/|\.d\.ts$)/;

const TRANSLATE_ATTRS = new Set([
  "placeholder", "title", "aria-label", "aria-description", "aria-valuetext", "alt", "label", "description",
  "tooltip", "heading", "subtitle", "emptyMessage", "emptyText", "emptyTitle", "emptyDescription", "message",
  "text", "hint", "helperText", "confirmLabel", "cancelLabel", "submitLabel", "actionLabel", "caption",
  "summary", "detail", "body", "content", "eyebrow", "badge", "headline", "prompt", "question", "name",
]);
const SKIP_ATTRS = /^(className|class|style|href|src|to|id|key|type|variant|size|role|name|value|defaultValue|htmlFor|target|rel|method|action|accept|autoComplete|inputMode|pattern|form|tabIndex|side|align|orientation|mode|as|asChild|ref|d|viewBox|fill|stroke|xmlns|icon|color|testId|layout|data-.*|aria-(?!label|description|valuetext).*)$/;
const SKIP_CALLEES = new Set([
  "require", "import", "includes", "startsWith", "endsWith", "split", "indexOf", "lastIndexOf", "replace",
  "replaceAll", "match", "matchAll", "test", "search", "get", "has", "delete", "getItem", "setItem",
  "removeItem", "querySelector", "querySelectorAll", "closest", "matches", "addEventListener",
  "removeEventListener", "fetch", "cn", "clsx", "cx", "twMerge", "cva", "getElementById", "createElement",
  "setAttribute", "getAttribute", "hasAttribute", "removeAttribute", "postMessage", "dispatchEvent",
  "Event", "CustomEvent", "URL", "URLSearchParams", "RegExp", "Symbol", "describe", "it", "expect",
  "mark", "measure", "localeCompare", "padStart", "padEnd", "join", "invalidateQueries", "useQuery",
  "toLocaleString", "toLocaleDateString", "toLocaleTimeString", "DateTimeFormat", "NumberFormat",
  "setProperty", "getPropertyValue", "matchMedia", "debug", "log", "info", "warn", "error", "trace",
]);
const SKIP_OBJECT_KEYS = /^(className|class|id|key|type|kind|variant|href|to|path|url|icon|color|value|slug|status|mode|method|queryKey|mutationKey|tone|testId|role|target|rel|accept|pattern|name|code|format|source|provider|adapterType|event|channel|scope|unit)$/;

// Palavras inglesas comuns (dicionário do sistema) para captar rótulos como "created", "running".
const ENGLISH_WORDS = (() => {
  try {
    const words = readFileSync("/usr/share/dict/words", "utf8").split("\n").filter((w) => /^[a-z]{3,}$/.test(w));
    return new Set(words);
  } catch {
    return new Set();
  }
})();

function isEnglishWord(word) {
  if (!/^[a-z]{3,}$/.test(word)) return false;
  if (ENGLISH_WORDS.has(word)) return true;
  // flexões: decisions, errors, created, paused, approved, retries
  const stems = [word.replace(/s$/, ""), word.replace(/es$/, ""), word.replace(/ed$/, ""), word.replace(/d$/, ""),
    word.replace(/ies$/, "y"), word.replace(/ied$/, "y"), word.replace(/ing$/, ""), word.replace(/ing$/, "e")];
  return stems.some((stem) => stem !== word && stem.length >= 3 && ENGLISH_WORDS.has(stem));
}

function hasLetters(s) {
  return /[A-Za-z]{2,}/.test(s);
}

function normalize(s) {
  return s.replace(/\s+/g, " ").trim();
}

function looksCodeLike(s) {
  if (/^(\[[a-z][\w-]*\]|<)/.test(s)) return true; // logs internos "[paperclip] ..." e marcação
  if (/\b[a-z]+[A-Z]\w*\.[a-z]\w*/.test(s)) return true; // caminho de campo técnico (instructionsBundle.files)
  if (/^(https?:|mailto:|data:|\/|\.\/|\.\.\/|#|\$|--|@|~)/.test(s)) return true;
  if (/(=>|\(\)|;\s*$|\bfunction\b|\bconst\b|\breturn\b|<\/?[a-z]+[\s>]|&&|\|\||===)/.test(s)) return true;
  if (/^[\w.:\-/[\]*]+$/.test(s) && !/^[A-Z][a-z]+(?:[- ][A-Za-z][a-z]*)*$/.test(s)) {
    // token único: só aceita palavra capitalizada simples ("Settings", "Sign-in")
    return true;
  }
  if (/^[A-Z0-9_]+$/.test(s)) return true; // CONSTANTE
  if (s === s.toLowerCase() && s.split(/\s+/).some((t) => /[a-z]/.test(t) && /[a-z0-9][-:[\]/.][a-z0-9[]/.test(t))) {
    return true; // provável lista de classes CSS / chaves
  }
  return false;
}

// Texto que está direto no JSX é texto de tela: só descarta o que é obviamente código.
function looksCodeLikeInJsx(s) {
  if (/^(https?:|mailto:|\/|\.\/|#|\$|--|@|~|\[[a-z][\w-]*\]|<)/.test(s)) return true;
  if (/(=>|\(\)|;\s*$|&&|\|\||===|\b[a-z]+[A-Z]\w*\.[a-z]\w*)/.test(s)) return true;
  if (/^[a-z]+[A-Z_]\w*$|^\w+[._/:]\w+/.test(s)) return true; // camelCase, snake_case, a.b, a/b
  return false;
}

function looksHuman(s, maxLen) {
  const n = normalize(s);
  if (n.length < 2 || n.length > maxLen) return false;
  if (!hasLetters(n)) return false;
  if (looksCodeLike(n)) return false;
  if (!/\s/.test(n) && !/^[A-Z]/.test(n)) return false; // palavra única minúscula = identificador
  return true;
}

function looksHumanTemplate(literal, maxLen) {
  const n = normalize(literal.replace(/\{\d+\}/g, " "));
  if (!hasLetters(n)) return false;
  if (literal.length > maxLen) return false;
  if (/^(https?:|\/|\.\/|#|\$|--|\{0\}\/)/.test(literal.trim())) return false;
  if (/[?&][a-z_]+=|\/api\//.test(literal)) return false;
  // precisa ter pelo menos uma palavra "de verdade" (2+ letras) fora de chaves/classe css
  const words = n.split(/\s+/).filter((w) => /^[A-Za-z][a-z]+[.,:;!?)]*$|^[A-Z][A-Za-z]+[.,:;!?)]*$/.test(w));
  if (words.length === 0) return false;
  if (n === n.toLowerCase() && n.split(/\s+/).some((t) => /[a-z0-9][-:[\]/][a-z0-9[]/.test(t))) return false;
  return true;
}

function calleeName(call) {
  const c = call.callee;
  if (!c) return null;
  if (c.type === "Identifier") return c.name;
  if (c.type === "MemberExpression" || c.type === "OptionalMemberExpression") {
    if (c.property?.type === "Identifier") return c.property.name;
  }
  return null;
}

function* walkFiles(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === "dist") continue;
      yield* walkFiles(full);
    } else if (/\.(tsx?|jsx?)$/.test(entry)) {
      yield full;
    }
  }
}

const exact = new Map(); // texto -> Set(arquivos)
const patterns = new Map();

function add(map, text, file) {
  if (!map.has(text)) map.set(text, new Set());
  map.get(text).add(file);
}

function isSkippedContext(node, parents) {
  const parent = parents[parents.length - 1];
  const grand = parents[parents.length - 2];
  if (!parent) return false;
  switch (parent.type) {
    case "ImportDeclaration":
    case "ExportNamedDeclaration":
    case "ExportAllDeclaration":
    case "ImportExpression":
    case "TSLiteralType":
    case "TSEnumMember":
    case "TSPropertySignature":
    case "TSImportType":
    case "TSExternalModuleReference":
    case "SwitchCase":
    case "TaggedTemplateExpression":
    case "Directive":
      return true;
    case "ObjectProperty":
    case "ObjectMethod":
    case "ClassProperty":
      if (parent.key === node) return true;
      if (parent.key?.type === "Identifier" && SKIP_OBJECT_KEYS.test(parent.key.name)) return true;
      if (parent.key?.type === "StringLiteral" && SKIP_OBJECT_KEYS.test(parent.key.value)) return true;
      break;
    case "MemberExpression":
    case "OptionalMemberExpression":
      if (parent.property === node) return true;
      break;
    case "BinaryExpression":
      if (["===", "!==", "==", "!=", "in", "instanceof"].includes(parent.operator)) return true;
      break;
    case "JSXAttribute": {
      const name = parent.name?.name?.name ?? parent.name?.name;
      if (typeof name === "string" && SKIP_ATTRS.test(name) && !TRANSLATE_ATTRS.has(name)) return true;
      break;
    }
    case "JSXExpressionContainer":
      if (grand?.type === "JSXAttribute") {
        const name = grand.name?.name?.name ?? grand.name?.name;
        if (typeof name === "string" && SKIP_ATTRS.test(name) && !TRANSLATE_ATTRS.has(name)) return true;
      }
      break;
  }
  // Argumento de chamadas que não são texto de interface
  for (let i = parents.length - 1; i >= Math.max(0, parents.length - 4); i -= 1) {
    const p = parents[i];
    if (p.type === "CallExpression" || p.type === "OptionalCallExpression" || p.type === "NewExpression") {
      const name = calleeName(p);
      if (name && SKIP_CALLEES.has(name)) return true;
      if (p.callee?.type === "MemberExpression" && p.callee.object?.name === "console") return true;
      break;
    }
    if (p.type === "JSXAttribute" || p.type === "VariableDeclarator" || p.type === "ReturnStatement") break;
  }
  return false;
}

function jsxContext(parents) {
  // "attr" se dentro de atributo traduzível, "child" se filho direto de JSX (via ternário/&&), senão null
  for (let i = parents.length - 1; i >= 0; i -= 1) {
    const p = parents[i];
    if (p.type === "JSXAttribute") {
      const name = p.name?.name?.name ?? p.name?.name;
      return TRANSLATE_ATTRS.has(name) ? "attr" : null;
    }
    if (p.type === "JSXExpressionContainer") {
      const g = parents[i - 1];
      return g && (g.type === "JSXElement" || g.type === "JSXFragment") ? "child" : null;
    }
    if (!["ConditionalExpression", "LogicalExpression", "ParenthesizedExpression", "TSAsExpression"].includes(p.type)) {
      return null;
    }
  }
  return null;
}

function visit(node, parents, file, maxLen) {
  if (!node || typeof node.type !== "string") return;

  if (node.type === "JSXText") {
    const t = normalize(node.value);
    if (t && hasLetters(t) && !looksCodeLikeInJsx(t) && t.length <= maxLen) add(exact, t, file);
  } else if (node.type === "StringLiteral") {
    if (!isSkippedContext(node, parents)) {
      const ctx = jsxContext(parents);
      const t = normalize(node.value);
      if (ctx && t && hasLetters(t) && !looksCodeLikeInJsx(t) && t.length <= maxLen) add(exact, t, file);
      else if (looksHuman(node.value, maxLen)) add(exact, t, file);
      else if (isEnglishWord(t)) add(exact, t, file); // palavra solta em minúsculas usada como rótulo/valor
    }
  } else if (node.type === "TemplateLiteral") {
    if (!isSkippedContext(node, parents)) {
      const parts = [];
      node.quasis.forEach((q, i) => {
        parts.push(q.value.cooked ?? q.value.raw);
        if (i < node.expressions.length) parts.push(`{${i}}`);
      });
      const literal = parts.join("");
      if (node.expressions.length === 0) {
        if (looksHuman(literal, maxLen)) add(exact, normalize(literal), file);
      } else if (looksHumanTemplate(literal, maxLen)) {
        // dois placeholders seguidos sem texto entre eles não dá para casar com segurança
        if (!/\}\{/.test(literal)) add(patterns, normalize(literal), file);
      }
    }
  }

  parents.push(node);
  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "start" || key === "end" || key === "extra" || key === "comments" ||
        key === "leadingComments" || key === "trailingComments" || key === "innerComments") continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const c of child) if (c && typeof c.type === "string") visit(c, parents, file, maxLen);
    } else if (child && typeof child.type === "string") {
      visit(child, parents, file, maxLen);
    }
  }
  parents.pop();
}

let fileCount = 0;
for (const root of SOURCE_ROOTS) {
  const abs = join(repoRoot, root.dir);
  if (!existsSync(abs)) continue;
  for (const file of walkFiles(abs)) {
    const rel = relative(repoRoot, file);
    if (EXCLUDED_PATH.test(rel)) continue;
    const code = readFileSync(file, "utf8");
    let ast;
    try {
      ast = parse(code, {
        sourceType: "module",
        plugins: ["typescript", "jsx", "decorators-legacy", "importAttributes"],
        errorRecovery: true,
      });
    } catch (error) {
      console.warn(`[ptbr] não consegui ler ${rel}: ${error.message}`);
      continue;
    }
    fileCount += 1;
    visit(ast.program, [], rel, root.maxLen);
  }
}

const outDir = join(here, "out");
mkdirSync(outDir, { recursive: true });
const sortKeys = (m) => [...m.keys()].sort((a, b) => a.localeCompare(b));
const all = { exact: sortKeys(exact), patterns: sortKeys(patterns) };
writeFileSync(join(outDir, "strings.json"), JSON.stringify(all, null, 2) + "\n");

// Pendentes = ainda não presentes no dicionário
const dictPath = join(repoRoot, "ui/src/ptbr/dictionary.pt-BR.json");
const dict = existsSync(dictPath) ? JSON.parse(readFileSync(dictPath, "utf8")) : { exact: {}, patterns: {}, ignore: [] };
const ignored = new Set(dict.ignore ?? []);
const pending = {
  exact: all.exact.filter((s) => !(s in (dict.exact ?? {})) && !ignored.has(s)),
  patterns: all.patterns.filter((s) => !(s in (dict.patterns ?? {})) && !ignored.has(s)),
};
writeFileSync(join(outDir, "pending.json"), JSON.stringify(pending, null, 2) + "\n");

console.log(`[ptbr] ${fileCount} arquivos lidos`);
console.log(`[ptbr] textos: ${all.exact.length} exatos, ${all.patterns.length} com variáveis`);
console.log(`[ptbr] pendentes de tradução: ${pending.exact.length} exatos, ${pending.patterns.length} com variáveis`);
