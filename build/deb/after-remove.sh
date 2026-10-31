#!/bin/bash
# Executado pelo apt depois de remover o Etiquetas ZPL.
if type update-alternatives >/dev/null 2>&1; then
    update-alternatives --remove etiquetas-zpl /usr/bin/etiquetas-zpl 2>/dev/null || true
fi
[ -L /usr/bin/etiquetas-zpl ] && [ ! -e /usr/bin/etiquetas-zpl ] && rm -f /usr/bin/etiquetas-zpl

if [ -f /etc/apparmor.d/etiquetas-zpl ]; then
    apparmor_parser -R /etc/apparmor.d/etiquetas-zpl 2>/dev/null || true
    rm -f /etc/apparmor.d/etiquetas-zpl
fi
