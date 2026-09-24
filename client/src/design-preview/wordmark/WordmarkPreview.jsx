import { Component, lazy, Suspense, useEffect, useRef, useState } from 'react';
import '../preview.css';
import './wordmark.css';
import WelcomeParticles from './WelcomeParticles';
const FloatingWordmark = lazy(() => import('./FloatingWordmark'));
class GlyphBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <span className="wm-loading">No se pudo cargar la vista 3D. Recarga la página.</span> : this.props.children; }
}
export default function WordmarkPreview() {
  const tagline = useRef();
  const [welcomeRun, setWelcomeRun] = useState(0);
  const [theme, setTheme] = useState('dark');
  const [systemLight, setSystemLight] = useState(() => matchMedia('(prefers-color-scheme: light)').matches);
  const [reduce, setReduce] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [manualPause, setManualPause] = useState(null);
  const [hidden, setHidden] = useState(document.hidden);
  useEffect(() => {
    const color = matchMedia('(prefers-color-scheme: light)');
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const updateColor = () => setSystemLight(color.matches);
    const updateMotion = () => setReduce(motion.matches);
    const updateHidden = () => setHidden(document.hidden);
    color.addEventListener('change', updateColor);
    motion.addEventListener('change', updateMotion);
    document.addEventListener('visibilitychange', updateHidden);
    return () => {
      color.removeEventListener('change', updateColor);
      motion.removeEventListener('change', updateMotion);
      document.removeEventListener('visibilitychange', updateHidden);
    };
  }, []);
  const paused = manualPause ?? reduce;
  const light = theme === 'light' || (theme === 'system' && systemLight);
  return <div className="design-preview wordmark-preview" data-theme={light ? 'light' : 'dark'}>
    <header className="dp-header"><a className="dp-wordmark" href="/design-preview">KRONOS<span>SPACE</span></a><span className="dp-badge">Laboratorio · Metal en movimiento</span></header>
    <main className="wm-main">
      <p className="dp-eyebrow">02 / UN NOMBRE CON VIDA</p>
      <WelcomeParticles light={light} paused={paused || hidden} replay={welcomeRun} targetRef={tagline} />
      <h1 className="wm-floating" aria-label="KRONOS SPACE, todas las letras 3D metálicas con reflejos ondulantes">
        <GlyphBoundary><Suspense fallback={<span className="wm-loading">Preparando letras 3D…</span>}>
          <FloatingWordmark paused={paused || hidden} light={light} />
        </Suspense></GlyphBoundary>
      </h1>
      <div ref={tagline} className="wm-tagline" role="img" aria-label="Tu espacio. Tu tiempo. Tu dominio." />
      <p className="wm-caption">LETRAS CON VOLUMEN · SIN PLACA NI FONDO</p>
      <p className="wm-description">Todas las letras comparten el mismo metal brillante. Los reflejos ondulan suavemente como la luz sobre el agua, sin deformar el nombre.</p>
      <section className="dp-controls" aria-label="Ajustes de la vista de prueba">
        <fieldset><legend>Apariencia</legend><div className="dp-options">
          {[['dark', 'Oscuro'], ['light', 'Claro'], ['system', 'Sistema']].map(([value, label]) => <label key={value}>
            <input type="radio" name="wordmark-theme" value={value} checked={theme === value} onChange={() => setTheme(value)} /><span>{label}</span>
          </label>)}
        </div></fieldset>
        <button className="dp-motion" type="button" onClick={event => { event.currentTarget.closest('.design-preview').scrollTo({ top: 0 }); setWelcomeRun(value => value + 1); setManualPause(false); }}>Repetir bienvenida</button>
        <button className="dp-motion" type="button" aria-pressed={paused} onClick={() => setManualPause(!paused)}>{paused ? 'Reanudar movimiento' : 'Pausar movimiento'}</button>
      </section>
      <p className="dp-note">Reflejos ondulantes continuos. Reanuda el movimiento para verlos.<br />KRONOS completo · Sin estrellas ni enjambres · SPACE en 3D.<br />Prueba independiente · La superficie de pirámides guardada permanece intacta.</p>
    </main>
    <footer className="dp-footer"><span>KRONOS / METAL EN MOVIMIENTO</span><a href="/login">Volver a la aplicación ↗</a></footer>
  </div>;
}
