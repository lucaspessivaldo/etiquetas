import { createRoot } from 'react-dom/client';
import App from './App.jsx';
// Fontes da interface empacotadas junto (o app não pode buscar nada na internet).
import '@fontsource-variable/inter/wght.css';
import '@fontsource/anton/latin-400.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import './styles/fonts.css';
import './styles/app.css';

createRoot(document.getElementById('root')).render(<App />);
