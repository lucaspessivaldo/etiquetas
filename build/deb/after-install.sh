#!/bin/bash
# Executado pelo apt depois de instalar o Etiquetas ZPL.
APP='/opt/Etiquetas ZPL'

# Comando "etiquetas-zpl" no terminal
if type update-alternatives >/dev/null 2>&1; then
    update-alternatives --install /usr/bin/etiquetas-zpl etiquetas-zpl "$APP/etiquetas-zpl" 100 \
        || ln -sf "$APP/etiquetas-zpl" /usr/bin/etiquetas-zpl
else
    ln -sf "$APP/etiquetas-zpl" /usr/bin/etiquetas-zpl
fi

# Sandbox do Electron.
# O Ubuntu 23.10+ só deixa programas com perfil AppArmor criarem "user namespaces",
# que o sandbox usa. O teste padrão do electron-builder roda como root e não percebe
# essa restrição, então instalamos o perfil (igual ao que o Ubuntu traz para o Chrome
# e o VS Code: não restringe nada, só dá nome ao programa e libera o namespace).
if [ -d /etc/apparmor.d ] && hash apparmor_parser 2>/dev/null; then
    cat > /etc/apparmor.d/etiquetas-zpl <<'PROFILE'
# Instalado pelo pacote etiquetas-zpl. Só dá nome ao programa e libera o sandbox.
abi <abi/4.0>,
include <tunables/global>

profile etiquetas-zpl "/opt/Etiquetas ZPL/etiquetas-zpl" flags=(unconfined) {
  userns,

  include if exists <local/etiquetas-zpl>
}
PROFILE
    apparmor_parser -r -T -W /etc/apparmor.d/etiquetas-zpl || true
    chmod 0755 "$APP/chrome-sandbox" || true
else
    # Sem AppArmor: usa o ajudante SUID do Chromium.
    chmod 4755 "$APP/chrome-sandbox" || true
fi

if hash update-desktop-database 2>/dev/null; then
    update-desktop-database /usr/share/applications || true
fi
