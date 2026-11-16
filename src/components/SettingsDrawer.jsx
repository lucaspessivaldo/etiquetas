import { Dialog } from './Dialog.jsx';
import { Icon } from './Icons.jsx';

function Switch({ checked, onChange, title, hint }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" aria-hidden="true" />
      <span className="text">{title}<small>{hint}</small></span>
    </label>
  );
}

export function SettingsDrawer({ open, onClose, settings, set }) {
  return (
    <Dialog open={open} onClose={onClose} className="drawer">
      <form method="dialog" onSubmit={(e) => { e.preventDefault(); onClose(); }}>
        <header>
          <h2>Configurações</h2>
          <button className="btn quiet icon" aria-label="Fechar"><Icon name="close" /></button>
        </header>

        <label className="field">
          <span>Resolução do ZPL</span>
          <select value={settings.dpmm} onChange={(e) => set('dpmm', e.target.value)}>
            <option value="6">152 dpi</option>
            <option value="8">203 dpi (padrão)</option>
            <option value="12">300 dpi</option>
            <option value="24">600 dpi</option>
          </select>
          <small>Quase sempre 203 dpi. Só mude se a etiqueta sair muito grande ou pequena.</small>
        </label>

        <label className="field">
          <span>Girar etiqueta</span>
          <select value={settings.rotate} onChange={(e) => set('rotate', e.target.value)}>
            <option value="0">Não girar</option>
            <option value="90">90°</option>
            <option value="180">180°</option>
            <option value="270">270°</option>
          </select>
          <small>Use se a impressora puxa o papel em outra orientação.</small>
        </label>

        <Switch
          checked={settings.mono}
          onChange={(v) => set('mono', v)}
          title="Preto e branco puro"
          hint="Texto e códigos de barras mais nítidos na impressão."
        />
        <Switch
          checked={settings.copies}
          onChange={(v) => set('copies', v)}
          title="Respeitar número de cópias"
          hint="Gera uma página por cópia pedida no arquivo (^PQ)."
        />
      </form>
    </Dialog>
  );
}
