import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource-variable/cascadia-mono';
import '@fontsource-variable/noto-sans-mono';
import './index.css';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(<App />);
