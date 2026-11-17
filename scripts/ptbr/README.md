# Tradução pt-BR da interface

A UI é traduzida em tempo real por `ui/src/ptbr/`. Os componentes não são alterados.
O tradutor é empacotado como um script independente, `deploy/easypanel/ptbr.js`, que o
`Dockerfile.easypanel` injeta no `index.html` da imagem oficial do Paperclip.

- `ui/src/ptbr/dictionary.pt-BR.json`: dicionário inglês → português (`exact`, `patterns` com `{0}`, `ignore`)
- `ui/src/ptbr/translator.ts`: aplica o dicionário no DOM (ignora markdown, editores e código)
- `ui/src/ptbr/index.ts`: ponto de entrada do script; liga a tradução (padrão) ou desliga

## Ligar / desligar

Abra a UI com `?lang=en` para voltar ao inglês e `?lang=pt-BR` para religar. A escolha fica salva no navegador.

## Atualizar o Paperclip no servidor

O servidor não compila o código. Ele usa a imagem oficial, fixada por digest no `Dockerfile.easypanel`.

```sh
scripts/ptbr/bump-image.sh nightly   # ou latest (estável), beta, canary
git commit -am "build: Paperclip <canal> de <data>" && git push saman saman
```

Depois, clique em Implantar no EasyPanel.

Nunca aponte para uma imagem mais antiga que o banco: o servidor não desfaz migrações.
Confira que o commit da imagem contém pelo menos as migrações já aplicadas
(`select max(id) from drizzle.__drizzle_migrations`).

## Depois de mudar o tradutor ou o dicionário

```sh
./node_modules/.bin/esbuild ui/src/ptbr/index.ts --bundle --minify --format=iife --target=es2020 \
  --charset=utf8 --legal-comments=none --outfile=deploy/easypanel/ptbr.js
```

## Textos novos do Paperclip

Textos novos aparecem em inglês até serem traduzidos. Com o repositório no mesmo commit da imagem:

```sh
node scripts/ptbr/extract.mjs        # lista o que falta em scripts/ptbr/out/pending.json
```

Traduza o `pending.json` para o formato `{"exact": {en: pt}, "patterns": {en: pt}}` (pode pedir ao Claude),
junte ao dicionário e gere o script de novo:

```sh
node scripts/ptbr/merge.mjs caminho/traducoes.pt.json
```

Para corrigir uma tradução, edite direto o `dictionary.pt-BR.json`.
