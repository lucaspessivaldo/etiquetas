# Guia para agentes de IA (e pessoas) que forem mexer neste projeto

Leia isto antes de alterar o código. Explica o que o projeto faz, como está montado e,
principalmente, **as decisões e armadilhas que não dá para deduzir só lendo o código**.

O usuário é brasileiro: **interface, mensagens, comentários e documentação em
português (pt-BR)**.

## O que é

Site estático (React + Vite, gerenciado com **Bun**) publicado no GitHub Pages em
https://lucaspessivaldo.github.io/etiquetas/. Ele:

1. lê o arquivo de etiquetas de envio em **ZPL** (`.zip`, `.txt` ou `.zpl`) ou o código
   colado na tela inicial;
2. renderiza cada etiqueta num `<canvas>` com um **motor ZPL próprio**;
3. gera **PDF** (jsPDF) com uma etiqueta por página ou abre o **diálogo de impressão
   do navegador**.

Tudo roda no navegador de quem usa. Não há servidor nem app desktop.

## Decisões do usuário (não mude sem perguntar)

- **O site é focado num único marketplace** (o formato descrito em "O arquivo de
  etiquetas", abaixo), mas **o nome desse marketplace não pode aparecer em lugar
  nenhum**: textos do site, código, comentários, etiqueta de exemplo, README, este
  arquivo, mensagens de commit. Também não cite outros marketplaces. Fale em "sua
  loja", "marketplace" ou "arquivo de etiquetas".
- **Só tema claro.** Não há tema escuro (`color-scheme: light`, sem
  `prefers-color-scheme: dark`).
- **Não há impressão direta em impressora térmica.** O antigo app Electron (impressão
  TSPL via CUPS, pacote `.deb`, perfil AppArmor) foi removido de propósito. Imprimir é
  só pelo diálogo do navegador.

## Comandos

```bash
bun install
bun run dev      # site local com recarga automática (porta 5173)
bun run build    # gera dist/
bun run preview  # serve o dist/
```

## Estrutura

```
src/main.jsx, App.jsx    estado da tela, arrastar arquivo, PDF, imprimir, toasts
src/components/          StartScreen (abrir arquivo + caixa de colar ZPL)/Toolbar/Preview
                         (Screens.jsx), SettingsDrawer, Dialog (<dialog> controlado), Icons
src/engine/zpl.js        MOTOR ZPL: tokenizer, parser, renderer (o arquivo mais delicado)
src/engine/labels.js     ZPL -> páginas finais: tamanho do papel, girar, encaixar, cópias
src/engine/output.js     ler .zip/.txt, gerar PDF, imprimir pelo diálogo do navegador
src/engine/sample.js     etiqueta de exemplo (dados fictícios, sem marca)
src/styles/              app.css (tema claro no estilo do chessOp), fonts.css (fontes do
                         motor ZPL)
exemplos/                etiqueta-exemplo.zpl (a mesma do sample.js)
public/                  favicon.svg (mesmo desenho do logo da barra) e os PNGs gerados
                         dele: favicon-32.png e apple-touch-icon.png (180 px, fundo preto
                         sem transparência). Se mudar o SVG, gere os PNGs de novo.
.github/workflows/       pages.yml: build e publicação no GitHub Pages
```

O fluxo: `App.jsx` → `renderPages()` (labels.js) → `ZPL.parse()` + `ZPL.render()`
(zpl.js) → canvases → prévia (`url` PNG) / `buildPdf()` / `printWithDialog()`.

## Motor ZPL (`src/engine/zpl.js`)

Escrito do zero e **calibrado pixel a pixel contra o Labelary** (api.labelary.com).
Vários números parecem arbitrários mas foram medidos. Não "arrume" sem medir de novo:

- **Fonte 0** (CG Triumvirate Bold Condensed) é desenhada com Roboto Condensed Bold
  (embutida em `src/styles/fonts.css` como data URI). A **largura de cada caractere**
  vem da tabela `F0_ADV` (milésimos da largura ZPL), medida no Labelary; o glifo da
  Roboto é centralizado nesse avanço. `F0_CAP = 0.73` (altura da maiúscula), e o hífen
  é desenhado como travessão (`F0_GLYPH`), igual à Zebra.
- Com `^FO` o topo da maiúscula fica no y; com `^FT` o y é a linha de base.
  Fontes bitmap (A–H) usam Roboto Mono; com `^FT` também ancoram na linha de base.
- **`^FB` centralizado/à direita**: a Zebra mede a linha com um espaço a mais no final
  (por isso o `trail` em `drawText`). Com `^FT`, a âncora é a base da ÚLTIMA linha
  possível (`maxLines`), não da última usada. Linhas que excedem `maxLines` são
  sobrepostas na última (comportamento da Zebra).
- **QR Code (`^BQ`)**: com `^FO` ele desce a altura atual do `^BY` (quirk da Zebra, não
  é bug); com `^FT` a base fica 3 módulos acima do y.
- **Code 128** tem codificador próprio (`encodeCode128Manual/Auto`) para respeitar os
  subsets da Zebra (modo N começa em B; `>;` `>:` `>5` etc.). Os outros códigos vêm do
  `bwip-js` (`bwipjs.raw`) e são desenhados com o módulo do `^BY`. A linha de
  interpretação usa a fonte A ampliada pela largura do módulo.
  Diferença conhecida: com `>;` e quantidade **ímpar** de dígitos, a Zebra descarta o
  último dígito e o nosso codificador mantém todos (medido em 14/11/2026).
- Rotação (`N/R/I/B`): `place()` posiciona tudo. Para `^FO` o retângulo rotacionado tem
  o canto superior esquerdo em (x, y); para `^FT` gira em torno da âncora.
- `^FR`/`^LR` (inverso) usa `globalCompositeOperation = 'difference'` com branco.
- Gráficos: `^GF` e `~DG` em hexa comprimido (G–Y, g–z, `,` `!` `:`), `:Z64:` (zlib via
  pako, CRC-16/XMODEM no final) e `:B64:`.
- `ZPL.render()` devolve `widthDots/heightDots`: usa `^PW/^LL` se existirem, senão o
  tamanho pedido, e **cresce para caber imagens** que passam disso (`imagesExtent`).

### O arquivo de etiquetas (o caso principal)

- Cada etiqueta é UMA imagem de 816 × 1218 dots (4 × 6 pol): `~DGR:DEMO.GRF,…:Z64:…`
  seguido de `^XA … ^XG R:DEMO.GRF … ^XZ` e depois `^XA^IDR:DEMO.GRF^FS^XZ`. O `.zip`
  pode trazer junto a lista de empacotamento, no mesmo formato.
- **Todas as etiquetas reutilizam o nome `DEMO.GRF`.** Por isso `parse()` guarda em cada
  etiqueta uma cópia dos gráficos daquele momento (`label.graphics`). Sem isso todas as
  páginas saem iguais à última. Não mude para um mapa global.
- Blocos `^XA…^XZ` sem nada desenhável (só `^ID`, `^JUS`, `^MCY`…) são ignorados para
  não gerar páginas em branco.
- A imagem é 4 × 6 pol; no papel padrão de 100 × 150 mm ela é reduzida ~1,5%
  (`fitToPaper` em labels.js, que nunca amplia e re-binariza depois de reduzir).

### Como validar mudanças no motor

Não há testes automatizados. O método usado foi:

1. Escrever um ZPL de teste **com dados fictícios** (ex.: `exemplos/etiqueta-exemplo.zpl`).
2. Pegar a referência:
   `curl -s -H "Accept: image/png" --data-binary @teste.zpl http://api.labelary.com/v1/printers/8dpmm/labels/4x6/0/ -o ref.png`
3. Renderizar o mesmo ZPL com `ZPL.render(..., { scale: 1, mono: true })` e comparar
   (sobreposição pixel a pixel / caixas delimitadoras). As posições ficaram com 0–1 dot
   de diferença.
4. Para códigos de barras, mais importante que o desenho é **ler os dois** com um leitor
   (ex.: `zxing-wasm` no Bun) e conferir que trazem os mesmos dados.

**Nunca envie etiquetas reais para o Labelary ou outro serviço**: elas têm nome,
endereço e CPF/telefone de clientes.

## GitHub Pages

- `.github/workflows/pages.yml` roda `bun install --frozen-lockfile` + `bun run build` e
  publica o `dist/` a cada push no `main`. Em pull request ele só confere o build.
- `base: './'` no `vite.config.js` faz os caminhos funcionarem no subcaminho
  `/etiquetas/` do Pages. Não troque por `'/'`.
- Para testar como no Pages: `bun run build` e `bunx vite preview --base /etiquetas/`,
  abrindo `http://localhost:4173/etiquetas/`.
- O token do `gh` deste computador não tem o escopo `workflow`: push que altera arquivos
  em `.github/workflows/` precisa ir por SSH (`git@github.com:lucaspessivaldo/etiquetas.git`).

## Segurança e privacidade

- **O site não faz requisições de rede**: o arquivo é lido e convertido só no
  navegador. O CSP do `index.html` (`connect-src 'self'`, `font-src 'self' data:`)
  garante isso. Não adicione analytics, fontes do Google ou APIs externas sem perguntar.
- Arquivos reais de etiquetas contêm dados pessoais de clientes: **não versionar**, não
  colocar em `exemplos/`, não enviar para serviços externos. Use dados fictícios.

## Visual

- Mesmo estilo do outro projeto do usuário, o **chessOp** (`~/codes/chessOp`,
  `src/index.css`): preto puro no branco, cantos de 2 px, títulos em **Anton**
  maiúsculo, texto em **Inter**, código em **JetBrains Mono**, verde só na ação
  principal (`.btn.primary`). As cores são os mesmos `oklch` do tema claro de lá.
- As fontes da interface vêm dos pacotes `@fontsource` (importados em `main.jsx`) e são
  empacotadas pelo Vite. **Não use Google Fonts** (o site não faz requisições externas).
- Anton tem `line-height` .95: em elemento com `overflow: hidden` o acento de maiúsculas
  ("CÓDIGO") é cortado; nesses casos aumente o `line-height`.

## Convenções

- Comentários curtos em português, explicando o porquê (não o quê).
- O motor (`zpl.js`) é JavaScript puro sem React; mantenha assim para poder testar fora
  da interface.
- Configurações do usuário ficam no `localStorage` (`zpl2pdf-settings`).
- `<dialog>`: o evento `close` não disparou de forma confiável nos testes; o componente
  `Dialog` controla abrir/fechar pelo estado do React e os formulários usam `onSubmit`.
