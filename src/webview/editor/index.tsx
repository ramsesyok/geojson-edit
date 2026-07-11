import { createRoot } from 'react-dom/client';
import 'ol/ol.css';
import './editor.css';
import { App } from './App';

declare global {
  interface Window {
    PMTILES_URI: string;
  }
}

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(<App pmtilesUri={window.PMTILES_URI} />);
}
