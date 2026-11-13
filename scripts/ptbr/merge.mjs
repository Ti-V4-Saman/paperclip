#!/usr/bin/env node
// Junta traduções no dicionário da UI.
//
// Uso: node scripts/ptbr/merge.mjs <arquivo.pt.json> [mais arquivos...]
// Cada arquivo: { "exact": {en: pt}, "patterns": {en: pt} }
// Traduções idênticas ao original vão para "ignore" (não voltam como pendentes).

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dictPath = join(here, "..", "..", "ui/src/ptbr/dictionary.pt-BR.json");
const dict = JSON.parse(readFileSync(dictPath, "utf8"));
dict.exact ??= {};
dict.patterns ??= {};
const ignore = new Set(dict.ignore ?? []);

const placeholders = (s) => (s.match(/\{\d+\}/g) ?? []).sort().join(",");
let added = 0;
let ignored = 0;
let rejected = 0;

for (const file of process.argv.slice(2)) {
  const data = JSON.parse(readFileSync(file, "utf8"));
  for (const section of ["exact", "patterns"]) {
    for (const [source, target] of Object.entries(data[section] ?? {})) {
      if (typeof target !== "string" || !target.trim() || placeholders(source) !== placeholders(target)) {
        rejected += 1;
        continue;
      }
      if (target === source) {
        ignore.add(source);
        delete dict[section][source];
        ignored += 1;
      } else {
        dict[section][source] = target;
        ignore.delete(source);
        added += 1;
      }
    }
  }
}

const sorted = (obj) => Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
const output = { exact: sorted(dict.exact), patterns: sorted(dict.patterns), ignore: [...ignore].sort() };
writeFileSync(dictPath, JSON.stringify(output, null, 1) + "\n");
console.log(`[ptbr] traduções gravadas: ${added} | iguais ao original (ignoradas): ${ignored} | rejeitadas: ${rejected}`);
console.log(`[ptbr] dicionário: ${Object.keys(output.exact).length} exatos, ${Object.keys(output.patterns).length} padrões`);
