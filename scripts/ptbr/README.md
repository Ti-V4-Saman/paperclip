# Tradução pt-BR da interface

A UI é traduzida em tempo real por `ui/src/ptbr/`. Os componentes não são alterados; a única mudança no
código original é a linha `import "./ptbr";` no topo de `ui/src/main.tsx`.

- `ui/src/ptbr/dictionary.pt-BR.json` — dicionário inglês → português (`exact`, `patterns` com `{0}`, `ignore`)
- `ui/src/ptbr/translator.ts` — aplica o dicionário no DOM (ignora markdown, editores e código)
- `ui/src/ptbr/index.ts` — liga a tradução (padrão) ou desliga

## Ligar / desligar

Abra a UI com `?lang=en` para voltar ao inglês e `?lang=pt-BR` para religar. A escolha fica salva no navegador.

## Depois de atualizar o Paperclip (`git pull`)

Textos novos aparecem em inglês até serem traduzidos:

```sh
node scripts/ptbr/extract.mjs        # lista o que falta em scripts/ptbr/out/pending.json
```

Traduza o `pending.json` para o formato `{"exact": {en: pt}, "patterns": {en: pt}}` (pode pedir ao Claude)
e junte ao dicionário:

```sh
node scripts/ptbr/merge.mjs caminho/traducoes.pt.json
```

Para corrigir uma tradução, edite direto o `dictionary.pt-BR.json`.
