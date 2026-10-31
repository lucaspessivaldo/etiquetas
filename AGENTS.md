# Guia para agentes de IA (e pessoas) que forem mexer neste projeto

Leia isto antes de alterar o código. Explica o que o projeto faz, como está montado e,
principalmente, **as decisões e armadilhas que não dá para deduzir só lendo o código**.

O usuário é brasileiro: **interface, mensagens, comentários e documentação em
português (pt-BR)**.

## O que é

App desktop para Linux (Electron + React + Vite, gerenciado com **Bun**) que:

1. lê etiquetas de envio em **ZPL** (Shopee, Mercado Livre…), de `.zip`, `.txt` ou `.zpl`;
2. renderiza cada etiqueta num `<canvas>` com um **motor ZPL próprio**;
3. gera **PDF** (jsPDF) ou **imprime direto** numa térmica de etiquetas **TSPL** via CUPS
   em modo raw, sem driver.

Impressora de referência: **Knup KP-IM604** (USB `0416:5011`, se identifica como
"POS Label Printer", `MANUFACTURER:LABEL;COMMAND SET:POS`). Ela **não entende ZPL**,
só TSPL. Sistema de referência: **Ubuntu 25.10**.

## Comandos

```bash
bun install
bun run dev      # Vite + Electron com recarga automática
bun run build    # só a interface (dist/)
bun run start    # build + abre o Electron
bun run dist     # gera release/etiquetas-zpl_<versão>_amd64.deb
sudo apt install ./release/etiquetas-zpl_<versão>_amd64.deb
```

A versão do pacote vem de `version` no `package.json`.

## Estrutura

```
electron/main.cjs        janela; registra os IPC thermal:list e thermal:print
electron/preload.cjs     expõe SÓ window.thermal.{list, print} (contextBridge)
electron/printer.cjs     acha a impressora e envia bytes crus (lp -o raw ou /dev/usb/lp*)
src/main.jsx, App.jsx    estado da tela, arrastar arquivo, imprimir, PDF, toasts
src/components/          StartScreen/Toolbar/Preview (Screens.jsx), SettingsDrawer,
                         PasteDialog, Dialog (<dialog> controlado), Icons
src/engine/zpl.js        MOTOR ZPL: tokenizer, parser, renderer (o arquivo mais delicado)
src/engine/labels.js     ZPL -> páginas finais: tamanho do papel, girar, encaixar, cópias
src/engine/tspl.js       páginas -> bytes TSPL (BITMAP 1 bit, 203 dpi)
src/engine/output.js     ler .zip/.txt, gerar PDF, imprimir pelo diálogo do sistema
src/engine/sample.js     etiqueta de exemplo (dados fictícios)
src/styles/              app.css (tema claro/escuro por prefers-color-scheme), fonts.css
build/icon.png           ícone
build/deb/*.sh           scripts pós-instalação/remoção do .deb (ver "Sandbox")
exemplos/                etiqueta-exemplo.zpl (fictícia)
imprimir.py              ferramenta de linha de comando antiga: PDF -> TSPL (opcional)
```

O fluxo: `App.jsx` → `renderPages()` (labels.js) → `ZPL.parse()` + `ZPL.render()`
(zpl.js) → canvases → prévia (`url` PNG) / `buildPdf()` / `buildTspl()` →
`window.thermal.print()` → IPC → `printer.cjs` → `lp -d <fila> -o raw`.

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
- Rotação (`N/R/I/B`): `place()` posiciona tudo. Para `^FO` o retângulo rotacionado tem
  o canto superior esquerdo em (x, y); para `^FT` gira em torno da âncora.
- `^FR`/`^LR` (inverso) usa `globalCompositeOperation = 'difference'` com branco.
- Gráficos: `^GF` e `~DG` em hexa comprimido (G–Y, g–z, `,` `!` `:`), `:Z64:` (zlib via
  pako) e `:B64:`.
- `ZPL.render()` devolve `widthDots/heightDots`: usa `^PW/^LL` se existirem, senão o
  tamanho pedido, e **cresce para caber imagens** que passam disso (`imagesExtent`).

### Arquivos da Shopee (o caso principal)

- Cada etiqueta é UMA imagem de 816 × 1218 dots (4 × 6 pol): `~DGR:DEMO.GRF,…:Z64:…`
  seguido de `^XA … ^XG R:DEMO.GRF … ^XZ` e depois `^XA^IDR:DEMO.GRF^FS^XZ`.
- **Todas as etiquetas reutilizam o nome `DEMO.GRF`.** Por isso `parse()` guarda em cada
  etiqueta uma cópia dos gráficos daquele momento (`label.graphics`). Sem isso todas as
  páginas saem iguais à última. Não mude para um mapa global.
- Blocos `^XA…^XZ` sem nada desenhável (só `^ID`, `^JUS`…) são ignorados para não
  gerar páginas em branco.
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

**Nunca envie etiquetas reais para o Labelary ou outro serviço**: elas têm nome,
endereço e CPF/telefone de clientes.

## Impressão (TSPL)

- `tspl.js` gera por página: `SIZE w mm,h mm` / `GAP 2 mm,0 mm` / `DIRECTION 1` /
  `DENSITY n` / `SPEED 4` / `CLS` / `BITMAP 0,0,<bytes por linha>,<altura>,0,<dados>` /
  `PRINT 1,1`.
- No `BITMAP` da TSPL **bit 0 = preto (imprime), bit 1 = branco**. A largura em bytes é
  arredondada para cima e o resto da linha é branco (bits 1), senão sai uma linha preta
  na borda.
- 203 dpi fixo; limiar de binarização 160.
- Calibrar = enviar `GAPDETECT\r\n`.
- Para testar o caminho de impressão **sem gastar etiqueta**, envie só `CLS\r\n`.
- `printer.cjs`: primeiro procura filas do CUPS com `usb://` contendo `LABEL` ou `POS`
  (`lpstat -v`); se não achar, usa `/dev/usb/lp*` com permissão de escrita.
- O Ubuntu cria a fila sozinho ao ligar a impressora (aqui ela se chamou `-9X10`),
  **com um PPD errado** (HP Designjet PostScript). Por isso sempre `lp -o raw`.
  Não altere a configuração do CUPS do usuário sem perguntar.
- O usuário não está no grupo `lp`, então `/dev/usb/lp*` normalmente não é gravável.

## Sandbox do Electron no Ubuntu (importante)

- O Ubuntu 23.10+ tem `kernel.apparmor_restrict_unprivileged_userns = 1`: o sandbox do
  Chromium só funciona para executáveis com um perfil AppArmor que permita `userns`.
- O `chrome-sandbox` com setuid também não serve: o disco do projeto é montado com
  `nosuid`, e o teste padrão do electron-builder (`unshare --user` rodando como root)
  não percebe a restrição.
- Solução adotada: o `.deb` instala `/etc/apparmor.d/etiquetas-zpl` em
  `build/deb/after-install.sh` (mesmo modelo do perfil do VS Code no Ubuntu) e remove em
  `after-remove.sh`. O caminho no perfil é `"/opt/Etiquetas ZPL/etiquetas-zpl"`: se
  mudar `productName` ou `executableName` no `package.json`, **atualize o perfil**.
- **Não use `--no-sandbox`.** O usuário escolheu manter o sandbox.
- Consequência: `bun run dev`/`start` e `release/linux-unpacked/` podem não abrir num
  terminal comum do usuário (sem perfil). O app instalado pelo `.deb` abre.
- Para inspecionar o app rodando (sem ver a tela), inicie com
  `--remote-debugging-port=9333` e use o protocolo CDP (`/json/list`,
  `Runtime.evaluate`, `Page.captureScreenshot`).

## Segurança e privacidade

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; o preload só
  expõe listar/imprimir. Links externos abrem no navegador (`setWindowOpenHandler`).
- Tudo é local; o app não faz requisições de rede.
- Arquivos reais da Shopee contêm dados pessoais de clientes: **não versionar**, não
  colocar em `exemplos/`, não enviar para serviços externos. Use dados fictícios.

## Convenções

- Comentários curtos em português, explicando o porquê (não o quê).
- O motor (`zpl.js`) é JavaScript puro sem React; mantenha assim para poder testar fora
  da interface.
- Configurações do usuário ficam no `localStorage` (`zpl2pdf-settings`), dentro de
  `~/.config/Etiquetas ZPL`.
- `<dialog>`: o evento `close` não disparou de forma confiável nos testes; o componente
  `Dialog` controla abrir/fechar pelo estado do React e os formulários usam `onSubmit`.
