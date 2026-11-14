import { Dialog } from './Dialog.jsx';
import { Icon } from './Icons.jsx';

/** Aviso antes de imprimir: fila da térmica pausada ou com trabalhos na frente. */
export function QueueDialog({ queue, onClose, onClear, onPrint }) {
  const { paused, jobs } = queue || { paused: false, jobs: [] };
  return (
    <Dialog open={!!queue} onClose={onClose} className="modal queue">
      <form onSubmit={(e) => { e.preventDefault(); onClear(); }}>
        <header>
          <h2>{paused ? 'Impressora pausada' : 'Já tem impressão na fila'}</h2>
          <button type="button" className="btn quiet icon" aria-label="Fechar" onClick={onClose}><Icon name="close" /></button>
        </header>
        {paused && (
          <p>
            O sistema pausou a impressora, normalmente porque ela foi desligada ou
            desconectada no meio de uma impressão. Enquanto estiver pausada, nada sai.
          </p>
        )}
        {jobs.length > 0 && (
          <div>
            <p>{jobs.length === 1 ? 'Este trabalho vai sair antes:' : 'Estes ' + jobs.length + ' trabalhos vão sair antes:'}</p>
            <ul>{jobs.map((j) => <li key={j.id}>{j.title || 'Sem nome'}</li>)}</ul>
            <small className="hint">
              O que não foi enviado por este app (PDF, página de teste, “Automatic configuration”)
              passa pelo driver errado do sistema e sai como lixo na térmica.
            </small>
          </div>
        )}
        <footer>
          <button type="button" className="btn" onClick={onClose}>Voltar</button>
          {!paused && <button type="button" className="btn" onClick={onPrint}>Imprimir depois deles</button>}
          <button type="submit" className="btn primary" autoFocus>
            {jobs.length ? 'Limpar fila e imprimir' : 'Reativar e imprimir'}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
