# Etiquetas ZPL

Programa para **Linux** que abre as etiquetas de envio em ZPL da **Shopee**,
**Mercado Livre** e outras, mostra a prévia, gera PDF e **imprime direto na
impressora térmica**, sem driver.

Feito para quem tem uma térmica que **não entende ZPL** (a Shopee manda o arquivo em
ZPL, que é a linguagem das impressoras Zebra). O programa faz o papel do
[Labelary](https://labelary.com/viewer.html), só que no seu computador: nenhuma
etiqueta é enviada para a internet.

## Para qual impressora

Testado na **Knup KP-IM604** (USB, 203 dpi, etiquetas de 100 × 150 mm) no
**Ubuntu 25.10**.

Deve funcionar em outras térmicas de etiqueta genéricas que usam a linguagem **TSPL**:
Xprinter (XP-420B, XP-470B…), Elgin L42, HPRT, Gprinter, Zebra-compatíveis "chinesas"
e parecidas. No Linux elas costumam aparecer como *"POS Label Printer"* ou *"LABEL"*.

Para qualquer outra impressora (inclusive comum, de papel A4) dá para usar o
**Baixar PDF** ou **Configurações → Imprimir pelo diálogo do sistema**.

## Instalar

O programa é um pacote `.deb`, instalado pelo `apt` como qualquer outro.

**1. Gerar o pacote** (precisa do [Bun](https://bun.sh)):

```bash
git clone https://github.com/lucaspessivaldo/etiquetas-zpl.git
cd etiquetas-zpl
bun install
bun run dist
```

O pacote fica em `release/etiquetas-zpl_1.0.0_amd64.deb`.

**2. Instalar:**

```bash
sudo apt install ./release/etiquetas-zpl_1.0.0_amd64.deb
```

**3. Abrir:** procure **Etiquetas ZPL** no menu de aplicativos (ou rode `etiquetas-zpl`
no terminal).

> O pacote também instala um perfil AppArmor em `/etc/apparmor.d/etiquetas-zpl`.
> O Ubuntu 23.10+ exige isso para o programa abrir com a proteção (sandbox) ligada.
> É o mesmo tipo de perfil que o Ubuntu traz para o Chrome e o VS Code.

### Depois de formatar o computador

Guarde o arquivo `.deb`: ele tem tudo dentro. No sistema novo basta o passo 2
(`sudo apt install ./etiquetas-zpl_1.0.0_amd64.deb`), sem Bun, Node nem o código.

## Remover

```bash
sudo apt remove etiquetas-zpl
```

Remove o programa, o atalho do menu e o perfil AppArmor. As configurações salvas
(tamanho do papel, escuridão…) ficam em `~/.config/Etiquetas ZPL`; apague essa pasta se
quiser limpar tudo.

## Usar

1. Ligue a impressora no USB.
2. Abra **Etiquetas ZPL** e arraste o arquivo da Shopee para a janela
   (`.zip`, `.txt` ou `.zpl`, do jeito que a Shopee baixa).
3. Confira a prévia e clique em **Imprimir**. As etiquetas vão direto para a térmica.
   **Baixar PDF** gera um PDF com uma etiqueta por página.

O tamanho do papel fica na barra de cima (100 × 150 mm por padrão). Se a etiqueta for
maior que o papel, ela é reduzida para caber, sem cortar nada.

Em **Configurações**:

| Opção | Para que serve |
|---|---|
| Resolução do ZPL | Quase sempre 203 dpi. |
| Girar etiqueta | Se a impressora puxa o papel em outra orientação. |
| Preto e branco puro | Texto e códigos de barras mais nítidos. |
| Respeitar número de cópias | Uma página por cópia pedida no arquivo (`^PQ`, até 50). |
| Escuridão da impressão | Clara, normal, escura ou bem escura. |
| Calibrar etiquetas | Faz a impressora medir a etiqueta e o espaço entre elas. |
| Imprimir pelo diálogo do sistema | Para usar outra impressora qualquer. |

## Problemas comuns

| Problema | O que fazer |
|---|---|
| O programa não abre pelo menu | Veja se foi instalado pelo `.deb` (`dpkg -s etiquetas-zpl`). Rodar a pasta `release/linux-unpacked` direto não funciona no Ubuntu 23.10+ por causa do sandbox. |
| Clico no ícone e nada acontece | Ele já está aberto em outra janela; só pode haver um. |
| "Nenhuma impressora térmica encontrada" | Ligue no USB e espere uns segundos. Confira com `lpstat -v`: deve aparecer uma linha `usb://LABEL/...`. |
| Sai cortado entre duas etiquetas | **Configurações → Calibrar etiquetas**. |
| Impressão clara | Aumente a **Escuridão da impressão**. |
| Sai de cabeça para baixo | **Configurações → Girar etiqueta → 180°**. |

## Etiquetas da Shopee

A Shopee manda cada etiqueta como uma imagem pronta (`~DGR:DEMO.GRF` + `^XG`), de
4 × 6 pol. O ZIP pode ter só a etiqueta, a etiqueta + checklist de carregamento ou
várias etiquetas. Cada uma vira uma página.

O conversor também entende ZPL "de verdade" (texto, códigos de barras, caixas…),
calibrado para ficar igual ao Labelary: fonte 0 com a largura de caracteres da Zebra,
fontes A–H, Code 128, Code 39, Code 93, Interleaved 2 of 5, Codabar, EAN-13, EAN-8,
UPC-A, QR Code, Data Matrix, PDF417, Aztec, `^GB`, `^GC`, `^GE`, `^GD`, `^GF`, `~DG`,
`^FB`, `^FH`, `^FR`, `^CI28` e outros. Comandos que ele não conhece aparecem num aviso
acima da prévia.

## Desenvolvimento

```bash
bun install
bun run dev      # abre o app com recarga automática ao editar
bun run start    # gera e abre a versão final
bun run dist     # gera release/etiquetas-zpl_<versão>_amd64.deb
```

Feito com **Electron + React + Vite**, usando **Bun**. A explicação da arquitetura e
dos detalhes que não são óbvios está em [AGENTS.md](AGENTS.md).

```
electron/        processo principal: janela e acesso à impressora
build/           ícone e scripts de instalação do .deb
src/App.jsx      tela (React)
src/components/  partes da tela
src/engine/      zpl.js (motor ZPL), labels.js (páginas), tspl.js (impressora),
                 output.js (arquivos, PDF, diálogo de impressão)
exemplos/        etiqueta de exemplo com dados fictícios
imprimir.py      opcional: imprime um PDF pela linha de comando
```
