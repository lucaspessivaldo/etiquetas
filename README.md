# Etiquetas ZPL

Site que transforma o arquivo de etiquetas de envio em **ZPL** num **PDF** com uma
etiqueta por página, pronto para imprimir em qualquer impressora.

**https://lucaspessivaldo.github.io/etiquetas/**

Tudo acontece no seu navegador: o arquivo não é enviado para nenhum servidor. As
etiquetas têm nome, endereço e telefone de clientes, e continuam só no seu computador.

## Usar

1. Abra o site e clique em **Abrir arquivo** para escolher o `.zip` de etiquetas que
   você baixou da sua loja, ou arraste o arquivo para a janela. Também aceita `.txt` e
   `.zpl`. Se tiver só o código ZPL, cole na caixa e clique em **Converter**.
2. Confira a prévia.
3. Clique em **Baixar PDF**, ou em **Imprimir** para abrir o diálogo de impressão do
   navegador.

O tamanho do papel fica na barra de cima (100 × 150 mm por padrão). Se a etiqueta for
maior que o papel, ela é reduzida para caber, sem cortar nada.

Em **Configurações**:

| Opção | Para que serve |
|---|---|
| Resolução do ZPL | Quase sempre 203 dpi. |
| Girar etiqueta | Se a impressora puxa o papel em outra orientação. |
| Preto e branco puro | Texto e códigos de barras mais nítidos. |
| Respeitar número de cópias | Uma página por cópia pedida no arquivo (`^PQ`, até 50). |

## O arquivo de etiquetas

Cada etiqueta do arquivo é uma imagem pronta de 4 × 6 pol (`~DGR:DEMO.GRF` + `^XG`).
O `.zip` pode ter só as etiquetas, as etiquetas com a lista de empacotamento ou várias
etiquetas juntas. Cada uma vira uma página.

O conversor também entende ZPL "de verdade" (texto, códigos de barras, caixas…),
calibrado para ficar igual ao Labelary: fonte 0 com a largura de caracteres da Zebra,
fontes A–H, Code 128, Code 39, Code 93, Interleaved 2 of 5, Codabar, EAN-13, EAN-8,
UPC-A, QR Code, Data Matrix, PDF417, Aztec, `^GB`, `^GC`, `^GE`, `^GD`, `^GF`, `~DG`,
`^FB`, `^FH`, `^FR`, `^CI28` e outros. Comandos que ele não conhece aparecem num aviso
acima da prévia.

## Desenvolvimento

```bash
bun install
bun run dev      # site local com recarga automática (http://localhost:5173)
bun run build    # gera o site em dist/
bun run preview  # serve o dist/ para conferir
```

Feito com **React + Vite**, usando **Bun**. Cada push no `main` publica o site no
GitHub Pages (`.github/workflows/pages.yml`). A explicação da arquitetura e dos detalhes
que não são óbvios está em [AGENTS.md](AGENTS.md).

```
src/App.jsx      tela (React)
src/components/  partes da tela
src/engine/      zpl.js (motor ZPL), labels.js (páginas), output.js (arquivos, PDF,
                 diálogo de impressão), sample.js (etiqueta de exemplo)
exemplos/        etiqueta de exemplo com dados fictícios
```
