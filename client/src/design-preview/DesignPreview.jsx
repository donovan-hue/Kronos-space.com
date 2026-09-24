import { Component, lazy, Suspense, useEffect, useState } from 'react';
import './preview.css';
const NanoScene = lazy(() => import('./NanoScene'));

function useMedia(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);
  return matches;
}
class SceneBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <p className="dp-fallback">La vista 3D necesita WebGL. Los temas siguen disponibles.</p> : this.props.children; }
}
export default function DesignPreview() {
  const [theme, setTheme] = useState('dark');
  const systemLight = useMedia('(prefers-color-scheme: light)');
  const reduce = useMedia('(prefers-reduced-motion: reduce)');
  const [manualPause, setManualPause] = useState(null);
  const [hidden, setHidden] = useState(document.hidden);
  useEffect(() => {
    const update = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  const paused = manualPause ?? reduce;
  const light = theme === 'light' || (theme === 'system' && systemLight);
  return <div className="design-preview" data-theme={light ? 'light' : 'dark'}>
    <header className="dp-header">
      <a className="dp-wordmark" href="/login">KRONOS<span>SPACE</span></a>
      <span className="dp-badge">Laboratorio de diseño</span>
    </header>
    <main className="dp-main">
      <div className="dp-intro"><span className="dp-eyebrow">01 / MATERIA EN MOVIMIENTO</span>
        <h1>La misma forma.<br /><span>Otra forma de verla.</span></h1>
        <p>Pirámides encajadas entre sí cubren toda la figura, sin franjas planas. Caras triangulares con profundidad, negro metálico y reflejos plateados en movimiento.</p>
      </div>
      <div className="dp-stage" role="img" aria-label="Figura Kronos opaca, cubierta completamente de pirámides triangulares contiguas, negro metálico brillante, con torsión y movimiento en espiral">
        <SceneBoundary><Suspense fallback={<p className="dp-fallback" role="status">Preparando la figura…</p>}>
          <NanoScene light={light} paused={paused || hidden} />
        </Suspense></SceneBoundary>
        <span className="dp-caption">SUPERFICIE DE PIRÁMIDES / KRONOS</span>
      </div>
      <section className="dp-controls" aria-label="Ajustes de la vista de prueba">
        <fieldset><legend>Apariencia</legend><div className="dp-options">
          {[['dark', 'Oscuro'], ['light', 'Claro'], ['system', 'Sistema']].map(([value, label]) => <label key={value}>
            <input type="radio" name="preview-theme" value={value} checked={theme === value} onChange={() => setTheme(value)} />
            <span>{label}</span>
          </label>)}
        </div></fieldset>
        <button type="button" className="dp-motion" aria-pressed={paused} onClick={() => setManualPause(!paused)}>{paused ? 'Reanudar movimiento' : 'Pausar movimiento'}</button>
      </section>
      <p className="dp-note">Vista independiente · No modifica tu cuenta ni el diseño actual.<br />Sección hexagonal real · Negro metálico pulido.</p>
    </main>
    <footer className="dp-footer"><span>KRONOS / DESIGN LAB</span><a href="/login">Volver a la aplicación ↗</a></footer>
  </div>;
}
