// Camada de tradução pt-BR em tempo de execução.
//
// Traduz os textos e atributos visíveis do DOM a partir de um dicionário inglês -> português,
// sem alterar os componentes da UI. Conteúdo do usuário (markdown, editores, código) é ignorado.

export type PtBrDictionary = {
  exact: Record<string, string>;
  patterns: Record<string, string>;
  ignore?: string[];
};

const TRANSLATED_ATTRIBUTES = ["placeholder", "title", "aria-label", "aria-description", "alt", "data-tooltip"];

// Áreas cujo texto pertence ao usuário/agente ou é código: nunca traduzir.
const SKIP_SELECTOR = [
  ".paperclip-markdown",
  ".paperclip-mdxeditor",
  ".paperclip-mdxeditor-scope",
  "[contenteditable='']",
  "[contenteditable='true']",
  "[contenteditable='plaintext-only']",
  "pre",
  "code",
  "kbd",
  "samp",
  "textarea",
  "script",
  "style",
  "noscript",
  ".cm-editor",
  ".xterm",
  "[data-no-translate]",
  "[translate='no']",
].join(",");

const CACHE_LIMIT = 20_000;
const LETTERS = /[A-Za-z]{2}/;

type CompiledPattern = {
  regex: RegExp;
  anchor: string;
  order: number[];
  target: string;
  /** Sem texto fixo nas pontas (ex.: "{0} and {1}"): casa com frases quaisquer, exige capturas curtas. */
  inner: boolean;
  fixedLetters: number;
};

// Proporção mínima de letras fixas do padrão no texto, para não traduzir frases do usuário
// que só por acaso contêm um pedaço do padrão.
const MIN_FIXED_RATIO = 0.3;
const INNER_MAX_CAPTURE_LENGTH = 32;
const INNER_MAX_CAPTURE_WORDS = 4;

function countLetters(text: string) {
  return (text.match(/\p{L}/gu) ?? []).length;
}

// O código monta plurais em inglês ("run" + "s"); em português isso gera "execuçãos", "provedors"...
function fixPlurals(text: string) {
  return text
    .replace(/ção(s)\b/g, "ções")
    .replace(/são(s)\b/g, "sões")
    .replace(/\b(provedor|operador|conector|monitor|revisor|editor|colaborador|indicador|valor|seletor)s\b/g, "$1es")
    .replace(/\bitems\b/g, "itens")
    .replace(/\bmensagems\b/g, "mensagens");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compilePattern(source: string, target: string): CompiledPattern | null {
  const pieces = source.split(/(\{\d+\})/);
  const order: number[] = [];
  let regex = "^";
  let anchor = "";
  pieces.forEach((piece, index) => {
    const placeholder = piece.match(/^\{(\d+)\}$/);
    if (placeholder) {
      order.push(Number(placeholder[1]));
      const before = pieces[index - 1] ?? "";
      const after = pieces[index + 1] ?? "";
      if (/\p{L}$/u.test(before) && !/^\p{L}/u.test(after)) {
        regex += "(s|es|)"; // sufixo de plural colado à palavra: "task{1}"
      } else if (/^\p{L}/u.test(after)) {
        regex += "(\\S+?)"; // número colado à unidade: "{0}m ago"
      } else {
        regex += "(.+?)";
      }
    } else if (piece) {
      regex += escapeRegExp(piece);
      if (piece.length > anchor.length) anchor = piece;
    }
  });
  if (!LETTERS.test(anchor)) return null; // padrão sem texto fixo suficiente: arriscado demais
  const first = pieces[0] ?? "";
  const last = pieces[pieces.length - 1] ?? "";
  const inner = !/\p{L}/u.test(first) && !/\p{L}/u.test(last);
  const fixedLetters = countLetters(pieces.filter((piece) => !/^\{\d+\}$/.test(piece)).join(""));
  return { regex: new RegExp(`${regex}$`, "u"), anchor, order, target, inner, fixedLetters };
}

export function createTranslator(dictionary: PtBrDictionary) {
  const exact = new Map<string, string>();
  for (const [source, target] of Object.entries(dictionary.exact)) {
    if (target && target !== source) exact.set(source, target);
  }
  const patterns: CompiledPattern[] = [];
  for (const [source, target] of Object.entries(dictionary.patterns)) {
    if (!target || target === source) continue;
    const compiled = compilePattern(source, target);
    if (compiled) patterns.push(compiled);
  }
  // Padrões mais específicos (mais texto fixo) primeiro.
  patterns.sort((a, b) => b.anchor.length - a.anchor.length);

  const cache = new Map<string, string | null>();

  function translateCore(core: string): string | null {
    const direct = exact.get(core);
    if (direct !== undefined) return direct;
    for (const pattern of patterns) {
      if (!core.includes(pattern.anchor)) continue;
      const match = pattern.regex.exec(core);
      if (!match) continue;
      const captures = match.slice(1);
      // Capturas que também são textos conhecidos da interface contam como texto fixo.
      const knownLetters = captures.reduce((sum, capture) => sum + (exact.has(capture) ? countLetters(capture) : 0), 0);
      if ((pattern.fixedLetters + knownLetters) / Math.max(1, countLetters(core)) < MIN_FIXED_RATIO) continue;
      if (pattern.inner) {
        const tooLong = captures.some(
          (capture) => capture.length > INNER_MAX_CAPTURE_LENGTH || capture.trim().split(/\s+/).length > INNER_MAX_CAPTURE_WORDS,
        );
        if (tooLong) continue;
      }
      const values: string[] = [];
      pattern.order.forEach((index, position) => {
        const captured = match[position + 1] ?? "";
        values[index] = exact.get(captured) ?? captured;
      });
      return fixPlurals(pattern.target.replace(/\{(\d+)\}/g, (_, index: string) => values[Number(index)] ?? ""));
    }
    return null;
  }

  /** Traduz um texto preservando espaços de borda. Retorna null se não houver tradução. */
  function translate(text: string): string | null {
    if (!LETTERS.test(text)) return null;
    const cached = cache.get(text);
    if (cached !== undefined) return cached;
    const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
    let result: string | null = null;
    if (match) {
      const core = match[2].replace(/\s+/g, " ");
      const translated = translateCore(core);
      if (translated !== null) result = match[1] + translated + match[3];
    }
    if (cache.size >= CACHE_LIMIT) cache.clear();
    cache.set(text, result);
    return result;
  }

  return { translate };
}

export function startDomTranslation(translate: (text: string) => string | null) {
  // Último valor que nós escrevemos em cada nó, para não reprocessar a própria escrita.
  const writtenText = new WeakMap<Text, string>();
  const writtenAttributes = new WeakMap<Element, Map<string, string>>();

  function isSkipped(element: Element | null) {
    return !element || element.closest(SKIP_SELECTOR) !== null;
  }

  function translateTextNode(node: Text) {
    const value = node.nodeValue;
    if (!value || writtenText.get(node) === value) return;
    if (isSkipped(node.parentElement)) return;
    const translated = translate(value);
    if (translated !== null && translated !== value) {
      writtenText.set(node, translated);
      node.nodeValue = translated;
    }
  }

  function translateAttribute(element: Element, attribute: string) {
    const value = element.getAttribute(attribute);
    if (!value) return;
    const written = writtenAttributes.get(element);
    if (written?.get(attribute) === value) return;
    if (isSkipped(element)) return;
    const translated = translate(value);
    if (translated !== null && translated !== value) {
      const map = written ?? new Map<string, string>();
      map.set(attribute, translated);
      writtenAttributes.set(element, map);
      element.setAttribute(attribute, translated);
    }
  }

  function translateElementAttributes(element: Element) {
    for (const attribute of TRANSLATED_ATTRIBUTES) {
      if (element.hasAttribute(attribute)) translateAttribute(element, attribute);
    }
  }

  function translateTree(root: Node) {
    if (root.nodeType === Node.TEXT_NODE) {
      translateTextNode(root as Text);
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE) return;
    const rootElement = root as Element;
    if (isSkipped(rootElement)) return;
    translateElementAttributes(rootElement);
    const walker = document.createTreeWalker(rootElement, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (node.nodeType === Node.ELEMENT_NODE && (node as Element).matches(SKIP_SELECTOR)) {
          return NodeFilter.FILTER_REJECT; // pula a subárvore inteira
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let current = walker.nextNode();
    while (current) {
      if (current.nodeType === Node.TEXT_NODE) translateTextNode(current as Text);
      else translateElementAttributes(current as Element);
      current = walker.nextNode();
    }
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "childList") {
        mutation.addedNodes.forEach((node) => translateTree(node));
      } else if (mutation.type === "characterData") {
        translateTextNode(mutation.target as Text);
      } else if (mutation.type === "attributes" && mutation.attributeName) {
        translateAttribute(mutation.target as Element, mutation.attributeName);
      }
    }
  });

  translateTree(document.documentElement);
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: TRANSLATED_ATTRIBUTES,
  });

  return () => observer.disconnect();
}

/** Traduz mensagens de alert/confirm/prompt nativos. */
export function patchNativeDialogs(translate: (text: string) => string | null) {
  const message = (value?: string) => (typeof value === "string" ? (translate(value) ?? value) : value);
  const { alert, confirm, prompt } = window;
  window.alert = (value?: string) => alert.call(window, message(value));
  window.confirm = (value?: string) => confirm.call(window, message(value));
  window.prompt = (value?: string, defaultValue?: string) => prompt.call(window, message(value), defaultValue);
}

/** Datas formatadas como "en-US" (ou sem idioma) passam a usar pt-BR. */
export function patchDateLocale(locale: string) {
  const methods = ["toLocaleString", "toLocaleDateString", "toLocaleTimeString"] as const;
  for (const method of methods) {
    const original = Date.prototype[method] as (locales?: Intl.LocalesArgument, options?: Intl.DateTimeFormatOptions) => string;
    Date.prototype[method] = function (this: Date, locales?: Intl.LocalesArgument, options?: Intl.DateTimeFormatOptions) {
      const useLocale = locales === undefined || locales === "en-US" || locales === "en" ? locale : locales;
      return original.call(this, useLocale, options);
    } as never;
  }
}
