import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  Bookmark,
  ChevronLeft,
  Compass,
  Heart,
  Home,
  Image,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  Settings,
  Sparkles,
  UserRound,
} from "lucide-react";

const concepts = [
  {
    id: "flux",
    number: "01",
    name: "Moiré Flux",
    note: "Cinético · preciso · magnético",
    color: "#c7ff4a",
  },
  {
    id: "fold",
    number: "02",
    name: "Impossible Fold",
    note: "Geométrico · profundo · estructural",
    color: "#8b7cff",
  },
];

const navItems = [
  [Home, "Inicio"],
  [Compass, "Explorar"],
  [Sparkles, "Kairos AI"],
  [MessageCircle, "Mensajes"],
  [Bookmark, "Guardado"],
];

function Mark() {
  return (
    <div className="dl-mark" aria-label="Kronospace">
      <span className="dl-mark-frame" />
      <span className="dl-mark-shift" />
    </div>
  );
}

function FeedPreview() {
  return (
    <div className="dl-product-shell">
      <aside className="dl-sidebar">
        <div className="dl-brand"><Mark /><strong>KRONOS</strong></div>
        <nav>
          {navItems.map(([Icon, label], index) => (
            <button className={index === 0 ? "is-active" : ""} key={label} type="button">
              <Icon size={19} strokeWidth={1.7} /><span>{label}</span>
            </button>
          ))}
        </nav>
        <button className="dl-create" type="button"><Plus size={18} /> Crear</button>
        <div className="dl-user-mini">
          <div className="dl-avatar">DR</div>
          <div><strong>Donovan</strong><span>@donovan</span></div>
          <MoreHorizontal size={17} />
        </div>
      </aside>

      <main className="dl-feed">
        <header className="dl-mobile-head"><div className="dl-brand"><Mark /><strong>KRONOS</strong></div><Bell size={19} /></header>
        <div className="dl-feed-head">
          <div><span className="dl-eyebrow">TU ESPACIO</span><h1>Buenos días, Donovan</h1></div>
          <button aria-label="Buscar" type="button"><Search size={19} /></button>
        </div>

        <section className="dl-stories" aria-label="Historias">
          <article className="dl-story dl-story-you"><Plus size={18} /><span>Tu historia</span></article>
          {[["AR", "Aurora"], ["LM", "Liam"], ["NS", "Nessa"], ["KA", "Kai"]].map(([initials, name], i) => (
            <article className={`dl-story dl-story-${i + 1}`} key={name}><b>{initials}</b><span>{name}</span></article>
          ))}
        </section>

        <section className="dl-composer">
          <div className="dl-avatar">DR</div>
          <span>Comparte algo extraordinario…</span>
          <button type="button"><Image size={17} /> <span>Media</span></button>
        </section>

        <article className="dl-post">
          <header>
            <div className="dl-avatar dl-avatar-aurora">AM</div>
            <div><strong>Aurora Méndez</strong><span>@auroram · 12 min</span></div>
            <button aria-label="Más opciones" type="button"><MoreHorizontal size={20} /></button>
          </header>
          <p>Hay instantes que parecen existir fuera del tiempo. Un pequeño estudio sobre luz, materia y silencio.</p>
          <div className="dl-art" role="img" aria-label="Composición abstracta de ilusión óptica">
            <i className="dl-art-plane" /><i className="dl-art-shift" /><span>OPTICAL<br />STUDY 07</span>
          </div>
          <footer>
            <button type="button"><Heart size={18} /> 2.4k</button>
            <button type="button"><MessageCircle size={18} /> 128</button>
            <button type="button"><Send size={18} /> 34</button>
            <button className="dl-save" type="button"><Bookmark size={18} /></button>
          </footer>
        </article>
      </main>

      <aside className="dl-rail">
        <div className="dl-rail-top"><button aria-label="Notificaciones" type="button"><Bell size={18} /><i /></button><button aria-label="Ajustes" type="button"><Settings size={18} /></button></div>
        <section className="dl-trending">
          <span className="dl-eyebrow">AHORA EN KRONOS</span><h2>En tendencia</h2>
          {[['Diseño generativo', '8.2k publicaciones'], ['Tiempo & espacio', '5.7k publicaciones'], ['Cine independiente', '3.1k publicaciones']].map(([title, count], i) => (
            <article key={title}><span>0{i + 1}</span><div><strong>{title}</strong><small>{count}</small></div><MoreHorizontal size={16} /></article>
          ))}
        </section>
        <section className="dl-kairos-card"><Sparkles size={22} /><span className="dl-eyebrow">KAIROS AI</span><h2>Crea más allá de lo imaginable.</h2><button type="button">Abrir estudio <span>↗</span></button></section>
      </aside>

      <nav className="dl-mobile-nav">
        <Home className="is-active" /><Compass /><Plus className="dl-mobile-plus" /><MessageCircle /><UserRound />
      </nav>
    </div>
  );
}

function LoginPreview() {
  return (
    <div className="dl-login-shell">
      <div className="dl-login-art">
        <div className="dl-login-brand"><Mark /><strong>KRONOSPACE</strong></div>
        <div className="dl-login-copy"><span className="dl-eyebrow">CREA / CONECTA / PUBLICA</span><h1>Ideas que<br />toman forma.</h1><p>Una red social para desarrollar, compartir y llevar más lejos tu trabajo creativo.</p></div>
        <div className="dl-login-illusion" aria-hidden="true"><i /><span /></div>
        <small>© 2026 KRONOSPACE</small>
      </div>
      <div className="dl-login-form-wrap">
        <div className="dl-login-form">
          <span className="dl-eyebrow">ACCESO PRIVADO</span><h2>Bienvenido de nuevo</h2><p>Ingresa a tu espacio personal.</p>
          <label>Correo electrónico<input type="email" placeholder="nombre@correo.com" /></label>
          <label>Contraseña<input type="password" placeholder="••••••••••••" /></label>
          <div className="dl-form-row"><label><input type="checkbox" defaultChecked /> Recordarme</label><button type="button">Recuperar acceso</button></div>
          <button className="dl-login-primary" type="button">Entrar a Kronospace <span>→</span></button>
          <div className="dl-or"><span>o continúa con</span></div>
          <button className="dl-google" type="button"><b>G</b> Continuar con Google</button>
          <p className="dl-register-copy">¿Eres nuevo? <button type="button">Crear una cuenta</button></p>
        </div>
      </div>
    </div>
  );
}

function ConceptSample({ concept, onOpen }) {
  const samplePosts = {
    flux: {
      eyebrow: "SELECCIÓN PARA TI",
      title: "El movimiento comienza con una idea.",
      copy: "Probando ritmo, contraste y capas para una nueva identidad editorial interactiva.",
      author: "Aurora Méndez"
    },
    fold: {
      eyebrow: "TRABAJO DESTACADO",
      title: "Una estructura puede cambiar la perspectiva.",
      copy: "Sistema modular para convertir una composición compleja en una experiencia clara.",
      author: "Nico Salvat"
    }
  };
  const content = samplePosts[concept.id];

  return (
    <article className={`dl-sample-card dl-theme-${concept.id}`}>
      <header>
        <div className="dl-brand"><Mark /><strong>KRONOS</strong></div>
        <div className="dl-sample-head-actions"><Search size={15} /><Bell size={15} /><span className="dl-avatar">K</span></div>
      </header>
      <nav className="dl-sample-nav">
        <Home className="is-active" size={17} /><Compass size={17} /><Sparkles size={17} /><MessageCircle size={17} />
      </nav>
      <main>
        <div className="dl-sample-welcome">
          <span className="dl-eyebrow">{content.eyebrow}</span>
          <h2>{content.title}</h2>
          <button type="button" aria-label="Crear contenido"><Plus size={18} /></button>
        </div>
        <div className="dl-sample-stories">
          {["Tú", "AM", "NS", "MV"].map((item, index) => <span className={index === 0 ? "is-you" : ""} key={item}>{index === 0 ? <Plus size={13} /> : item}</span>)}
        </div>
        <article className="dl-sample-post">
          <header><span className="dl-avatar">{content.author.slice(0, 1)}</span><div><strong>{content.author}</strong><small>hace 12 min</small></div><MoreHorizontal size={17} /></header>
          <p>{content.copy}</p>
          <div className="dl-sample-art"><i /><span>VISUAL<br />STUDY 07</span></div>
          <footer><span>👋</span><MessageCircle size={16} /><Send size={16} /><Bookmark size={16} /></footer>
        </article>
      </main>
      <footer className="dl-sample-label">
        <div><span>{concept.number}</span><strong>{concept.name}</strong><small>{concept.note}</small></div>
        <button type="button" onClick={() => onOpen(concept.id)}>Abrir muestra <span>↗</span></button>
      </footer>
    </article>
  );
}

export default function DesignLab() {
  const [concept, setConcept] = useState(concepts[0].id);
  const [screen, setScreen] = useState("compare");
  const navigate = useNavigate();
  const active = concepts.find((item) => item.id === concept);

  return (
    <div className={`dl-page dl-theme-${concept}`}>
      <header className="dl-lab-header">
        <div><button className="dl-back" type="button" onClick={() => navigate(-1)}><ChevronLeft size={16} /> Volver</button><span className="dl-lab-title">KRONOSPACE / DESIGN DIRECTIONS</span></div>
        <div className="dl-screen-switch" aria-label="Pantalla de muestra">
          <button className={screen === "compare" ? "is-active" : ""} onClick={() => setScreen("compare")} type="button">Comparar 2</button>
          <button className={screen === "app" ? "is-active" : ""} onClick={() => setScreen("app")} type="button">Aplicación</button>
          <button className={screen === "login" ? "is-active" : ""} onClick={() => setScreen("login")} type="button">Acceso</button>
        </div>
      </header>

      {screen === "compare" ? (
        <section className="dl-comparison-wrap">
          <div className="dl-comparison-heading">
            <div><span className="dl-eyebrow">DOS DIRECCIONES / UNA SOLA PANTALLA</span><h1>Ilusión óptica para una red de creadores.</h1></div>
            <p>Dos sistemas completos sobre negro profundo. Sin planetas, relojes, dioses ni referencias literales al nombre.</p>
          </div>
          <div className="dl-comparison-grid">
            {concepts.map((item) => (
              <ConceptSample
                concept={item}
                key={item.id}
                onOpen={(id) => {
                  setConcept(id);
                  setScreen("app");
                }}
              />
            ))}
          </div>
        </section>
      ) : (
        <>
          <section className="dl-concept-picker">
            {concepts.map((item) => (
              <button className={concept === item.id ? "is-active" : ""} onClick={() => setConcept(item.id)} type="button" key={item.id}>
                <span className="dl-number">{item.number}</span><i style={{ "--swatch": item.color }} /><span><strong>{item.name}</strong><small>{item.note}</small></span>
              </button>
            ))}
          </section>

          <section className="dl-preview-wrap">
            <div className="dl-preview-meta"><div><span>PROPUESTA {active.number}</span><strong>{active.name}</strong></div><span className="dl-live-dot">DEMO INTERACTIVA</span></div>
            <div className="dl-device-frame">{screen === "app" ? <FeedPreview /> : <LoginPreview />}</div>
          </section>
        </>
      )}

      <footer className="dl-lab-footer"><span>Selecciona una dirección para explorarla.</span><span>Diseño conceptual · Sin modificar todavía la app principal</span></footer>
    </div>
  );
}
