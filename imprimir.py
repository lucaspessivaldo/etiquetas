#!/usr/bin/env python3
"""
Imprime um PDF (ou imagem) de etiquetas em impressora térmica TSPL pelo CUPS,
sem precisar de driver. Feito para a Knup KP-IM604 e outras impressoras de
etiqueta "genéricas" (Xprinter, Elgin L42, etc.) que entendem TSPL.

Exemplos:
    python3 imprimir.py etiquetas.pdf
    python3 imprimir.py etiquetas.pdf --paginas 1-3
    python3 imprimir.py etiquetas.pdf --teste      # só gera a prévia, não imprime
    python3 imprimir.py --calibrar                 # mede o tamanho da etiqueta e o espaço entre elas

Requisitos: pdftoppm (poppler-utils) e Pillow.
"""
import argparse
import os
import subprocess
import sys
import tempfile

from PIL import Image

MM_POR_POL = 25.4


def impressora_padrao():
    """Primeira fila do CUPS ligada por USB a uma impressora de etiquetas."""
    try:
        saida = subprocess.run(['lpstat', '-v'], capture_output=True, text=True).stdout
    except FileNotFoundError:
        return None
    for linha in saida.splitlines():
        # "device for NOME: usb://LABEL/..."
        if linha.startswith('device for ') and 'usb://' in linha:
            nome, uri = linha[len('device for '):].split(': ', 1)
            if 'LABEL' in uri.upper() or 'POS' in uri.upper():
                return nome
    return None


def paginas_do_pdf(caminho, dpi, paginas):
    """Converte as páginas do PDF em imagens em tons de cinza na resolução da impressora."""
    with tempfile.TemporaryDirectory() as tmp:
        cmd = ['pdftoppm', '-r', str(dpi), '-gray', '-png']
        if paginas:
            cmd += ['-f', str(paginas[0]), '-l', str(paginas[1])]
        cmd += [caminho, os.path.join(tmp, 'p')]
        subprocess.run(cmd, check=True)
        arquivos = sorted(f for f in os.listdir(tmp) if f.endswith('.png'))
        return [Image.open(os.path.join(tmp, f)).copy() for f in arquivos]


def preparar(img, largura, altura, limiar, girar):
    """Ajusta a imagem ao tamanho da etiqueta (sem cortar) e converte para 1 bit."""
    img = img.convert('L')
    if girar:
        img = img.rotate(girar, expand=True)
    k = min(largura / img.width, altura / img.height)
    if abs(k - 1) > 0.002:
        img = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS)
    # Largura múltipla de 8: senão os bits de sobra no fim de cada linha saem pretos.
    folha = Image.new('L', ((largura + 7) // 8 * 8, altura), 255)
    folha.paste(img, ((largura - img.width) // 2, (altura - img.height) // 2))
    # Na TSPL o bit 0 imprime (preto) e o 1 fica branco, igual ao modo "1" do Pillow.
    return folha.point(lambda v: 255 if v >= limiar else 0, mode='1')


def tspl(imagens, args):
    out = bytearray()
    cab = (
        f'SIZE {args.largura} mm,{args.altura} mm\r\n'
        f'GAP {args.gap} mm,0 mm\r\n'
        f'DIRECTION {args.direcao}\r\n'
        f'DENSITY {args.densidade}\r\n'
        f'SPEED {args.velocidade}\r\n'
    )
    out += cab.encode('ascii')
    for img in imagens:
        wbytes = (img.width + 7) // 8
        out += b'CLS\r\n'
        out += f'BITMAP 0,0,{wbytes},{img.height},0,'.encode('ascii')
        out += img.tobytes()
        out += f'\r\nPRINT 1,{args.copias}\r\n'.encode('ascii')
    return bytes(out)


def intervalo(texto):
    if '-' in texto:
        a, b = texto.split('-', 1)
        return int(a), int(b)
    return int(texto), int(texto)


def main():
    p = argparse.ArgumentParser(description='Imprime PDF de etiquetas em impressora TSPL (Knup KP-IM604 etc.).')
    p.add_argument('arquivo', nargs='?', help='PDF, PNG ou JPG')
    p.add_argument('--impressora', help='fila do CUPS (padrão: detecta a impressora de etiquetas USB)')
    p.add_argument('--paginas', type=intervalo, help='ex.: 1 ou 2-5')
    p.add_argument('--largura', type=float, default=100, help='largura da etiqueta em mm (padrão 100)')
    p.add_argument('--altura', type=float, default=150, help='altura da etiqueta em mm (padrão 150)')
    p.add_argument('--gap', type=float, default=2, help='espaço entre etiquetas em mm (padrão 2)')
    p.add_argument('--dpi', type=int, default=203)
    p.add_argument('--densidade', type=int, default=8, help='escuridão 0-15 (padrão 8)')
    p.add_argument('--velocidade', type=int, default=4, help='velocidade 1-6 (padrão 4)')
    p.add_argument('--direcao', type=int, choices=(0, 1), default=1, help='0 ou 1: inverte o sentido de saída')
    p.add_argument('--girar', type=int, choices=(0, 90, 180, 270), default=0, help='girar a imagem antes de imprimir')
    p.add_argument('--limiar', type=int, default=160, help='0-255: acima disso vira branco (padrão 160)')
    p.add_argument('--copias', type=int, default=1)
    p.add_argument('--teste', action='store_true', help='não imprime; salva a prévia e o arquivo .tspl')
    p.add_argument('--calibrar', action='store_true',
                   help='faz a impressora medir a etiqueta e o espaço entre elas (use se a impressão sair cortada entre duas etiquetas)')
    args = p.parse_args()
    if not args.arquivo and not args.calibrar:
        p.error('informe o arquivo a imprimir (ou use --calibrar)')

    if args.calibrar:
        enviar(args.impressora, b'GAPDETECT\r\n', 'calibracao')
        print('Calibração enviada: a impressora vai puxar algumas etiquetas para medir.')
        return

    largura = round(args.largura / MM_POR_POL * args.dpi)
    altura = round(args.altura / MM_POR_POL * args.dpi)

    if args.arquivo.lower().endswith('.pdf'):
        brutas = paginas_do_pdf(args.arquivo, args.dpi, args.paginas)
    else:
        brutas = [Image.open(args.arquivo)]
    if not brutas:
        sys.exit('Nenhuma página encontrada.')
    imagens = [preparar(img, largura, altura, args.limiar, args.girar) for img in brutas]
    dados = tspl(imagens, args)

    if args.teste:
        base = os.path.splitext(os.path.basename(args.arquivo))[0]
        imagens[0].save(base + '-previa.png')
        with open(base + '.tspl', 'wb') as f:
            f.write(dados)
        print(f'{len(imagens)} etiqueta(s), {largura}x{altura} dots. Prévia: {base}-previa.png, dados: {base}.tspl')
        return

    fila = enviar(args.impressora, dados, os.path.basename(args.arquivo))
    print(f'Enviado para "{fila}": {len(imagens)} etiqueta(s).')


def enviar(fila, dados, titulo):
    """Manda os comandos TSPL crus para a fila do CUPS (sem passar pelo driver)."""
    fila = fila or impressora_padrao()
    if not fila:
        sys.exit('Impressora de etiquetas não encontrada no CUPS. Use --impressora NOME (veja com: lpstat -v).')
    r = subprocess.run(['lp', '-d', fila, '-o', 'raw', '-t', titulo], input=dados, capture_output=True)
    if r.returncode != 0:
        sys.exit('Erro ao enviar: ' + r.stderr.decode(errors='replace'))
    return fila


if __name__ == '__main__':
    main()
