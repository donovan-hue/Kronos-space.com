import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useDialogFocusRestore } from "../ui/useDialogFocusRestore.js";
import { useOrbitLoop } from "../../navigation/useOrbitLoop.js";
import { motionEnabled } from "../../lib/motionPreference.js";
import { motion } from "motion/react";
import { DialogOverlay } from "@/components/ui/dialog";
import {
  NAV_GROUPS,
  NAV_ICONS,
  SECTION_LABELS,
  getCurrentSection,
  buildRings
} from "../../navigation/model.jsx";
import { useNavFlags } from "../../navigation/useNavFlags";
import { SceneBackground } from "../../three";

/**
 * KRONOS ORBIT MAP — navegación espacial 3D (capa funcional, no decorativa).
 *
 * Arquitectura (regla 20): interacción 3D → estado → ROUTER → pantalla
 * real → datos reales. Cada nodo del mapa es un <Link> autenticado del
 * router; no existe ninguna "pantalla falsa": el mapa solo cambia CÓMO
 * se elige el destino, nunca QUÉ destino es.
 *
 * Modelo espacial (regla 8):
 *   anillo 0 · Núcleo    → lo que se visita a diario
 *   anillo 1 · Red       → personas, comunidades, directo
 *   anillo 2 · Sistema   → tu cuenta, estudio IA, seguridad
 * El anillo no es ornamento: comunica jerarquía y proximidad — lo
 * céntrico es frecuente; lo exterior, estructural.
 *
 * Foco (regla 9): al señalar un nodo, ese nodo avanza hacia el usuario
 * (translateZ + Presencia cromada) y el resto reduce protagonismo. El
 * centro del mapa muestra SIEMPRE «dónde estoy»; al enfoca, muestra
 * «a dónde iría» con la ruta destino.
 *
 * Accesibilidad (regla 17): el mapa es un DIÁLOGO Radix (foco atrapado,
 * Escape, bloqueo de scroll, restauración) sobre links reales; ↑↓←→
 * recorren los nodos; con `prefers-reduced-motion` Motion omite las
 * transformaciones y CSS congela la escena; sin WebGL queda el campo
 * de estrellas CSS. En pantallas pequeñas o de poca altura (o con
 * pointer:coarse fino) el sistema cambia a MODO CONSTELACIÓN: la misma
 * información, en rejilla sin perspectiva — nunca se pierde una ruta
 * por no poder renderizar 3D.
 */

const RING_LABELS = ["Núcleo", "Red", "Sistema"];
const RING_START_ANGLE = [-Math.PI / 2, Math.PI / 11, Math.PI / 16];

function nodeGeometry(rings) {
  // Posiciones unitarias por anillo: círculo completo, reparto par, con
  // ángulo inicial distinto por anillo para evitar "columnas" visuales.
  const nodes = [];
  rings.forEach((items, ring) => {
    const n = items.length;
    items.forEach((item, i) => {
      const angle = RING_START_ANGLE[ring] + (i / Math.max(n, 1)) * Math.PI * 2;
      nodes.push({
        ...item,
        ring,
        x: Number((Math.cos(angle)).toFixed(4)),
        y: Number((Math.sin(angle)).toFixed(4)),
        z: Math.round((Math.sin(angle) + 1) * 400) // el frente pinta delante
      });
    });
  });
  return nodes;
}

export default function OrbitMap({ open, onClose, onNavigate }) {
  const location = useLocation();
  const section = getCurrentSection(location.pathname);
  const { filterItems } = useNavFlags();
  const contentRef = useRef(null);
  const nodeRefs = useRef(new Map());
  // Escape / cierre devuelven el foco al botón que abrió el mapa.
  const handleCloseFocus = useDialogFocusRestore(open);
  const [highlight, setHighlight] = useState(null);
  const [compact, setCompact] = useState(false);

  // Modo constelación: pantallas cortas/estrechas o sin hover fino.
  // Se escucha el media-query en vivo (rotación del dispositivo,
  // ventana redimensionada) — la navegación no queda nunca en un
  // limbo entre modos.
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const query = window.matchMedia("(max-width: 880px), (max-height: 580px), (hover: none) and (pointer: coarse)");
    const onChange = (event) => setCompact(event.matches);
    setCompact(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const nodes = useMemo(() => {
    const visible = NAV_GROUPS.map((group) => ({
      ...group,
      items: filterItems(group.items)
    })).filter((group) => group.items.length > 0);
    return nodeGeometry(buildRings(visible.flatMap((group) => group.items)));
  }, [filterItems]);

  // Escape → Radix; las flechas mueven el foco entre nodos. Enter lo
  // activa (comportamiento nativo del <a>). No hay gestos obligatorios.
  function handleKeyDown(event) {
    if (!["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();

    const order = nodes.map((node) => node.id);
    const currentIndex = order.indexOf(document.activeElement?.dataset?.orbitNode);
    const forward = event.key === "ArrowRight" || event.key === "ArrowDown";

    let nextIndex;
    if (currentIndex === -1) {
      // Desde el centro o cualquier parte: entra al anillo más poblado.
      nextIndex = forward ? 0 : order.length - 1;
    } else {
      nextIndex = (currentIndex + (forward ? 1 : -1) + order.length) % order.length;
    }

    const target = nodeRefs.current.get(order[nextIndex]);
    if (target) {
      target.focus();
      // Mantener el nodo enfocado dentro del viewport del anillo. En
      // entornos sin scroll API (tests) se omite sin romper la navegación.
      if (typeof target.scrollIntoView === "function") {
        target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
      }
    }
  }

  const highlighted = highlight ? nodes.find((node) => node.id === highlight) : null;
  const currentNode = nodes.find((node) => node.id === section);

  // ── Bucle orbital ──────────────────────────────────────────────
  // El campo vive en un bucle continuo: los anillos revolucionaN sobre la
  // elipse proyectada, cada uno a su velocidad (y el de en medio, en
  // sentido contrario). El motor escribe --x/--y/z-index directamente en
  // los nodos: el giro usa la misma geometría que el layout estático y no
  // re-renderiza React por frame. Se congela al señalar un destino (apuntar
  // a lo que se mueve no puede ser un test de reflejos), en modo compacto y
  // con prefers-reduced-motion (allí el campo queda en su composición fija,
  // que ya es funcional por sí sola).
  const loopEls = useRef(new Map());
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const loopAllowed = typeof window !== "undefined" && motionEnabled();
  const loopOn = open && !compact && loopAllowed;

  const registerLoopEl = useCallback((id, el) => {
    if (el) loopEls.current.set(id, el);
    else loopEls.current.delete(id);
  }, []);

  const getLoopTargets = useCallback(() => {
    const out = [];
    for (const [id, el] of loopEls.current) {
      const node = nodesRef.current.find((n) => n.id === id);
      if (node) out.push({ el, node });
    }
    return out;
  }, []);

  useOrbitLoop({ active: loopOn, frozen: Boolean(highlighted), getTargets: getLoopTargets });

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setHighlight(null);
          onClose();
        }
      }}
    >
      <DialogPrimitive.Portal>
        <DialogOverlay />
        <DialogPrimitive.Content
          ref={contentRef}
          className={`k-orbit-stage ${compact ? "is-compact" : ""}`}
          aria-label="Mapa orbital de navegación de Kronos"
          onKeyDown={handleKeyDown}
          onCloseAutoFocus={handleCloseFocus}
        >
          <DialogPrimitive.Title className="k-sr-only">
            Mapa orbital de navegación
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="k-sr-only">
            Selecciona una sección para viajar a ella. Usa las flechas para recorrer los nodos, Entrar para abrir y Escape para cerrar.
          </DialogPrimitive.Description>

          {/* Capa de profundidad: solo en modo espacial. En móvil/compacto
              no se paga GPU: el CSS ya da el campo estático. */}
          {!compact && open && (
            <SceneBackground scene="orbit-field" className="k-orbit-scene" />
          )}

          <header className="k-orbit-topline">
            <div className="k-orbit-current">
              <span className="k-eyebrow">Estás en</span>
              <strong>{SECTION_LABELS[section] || "Kronos"}</strong>
            </div>
            <div className="k-orbit-rings-legend" aria-hidden="true">
              <span className="lg-0"><i />Núcleo</span>
              <span className="lg-1"><i />Red</span>
              <span className="lg-2"><i />Sistema</span>
            </div>
            <DialogPrimitive.Close asChild>
              <button type="button" className="k-button k-button-ghost k-orbit-close" aria-label="Cerrar mapa orbital">
                ✕
              </button>
            </DialogPrimitive.Close>
          </header>

          <div className={`k-orbit-field ${highlighted ? "has-focus" : ""} ${loopOn ? "is-looping" : ""}`}>
            {/* Centro: el «yo estoy aquí» permanente. Con foco, el anillo
                informativo del destino — orientación sin adivinar. */}
            <div className="k-orbit-core" aria-hidden="true">
              <span className="k-orbit-core-mark">{highlighted ? "→" : "K"}</span>
              <span className="k-orbit-core-label">
                {highlighted ? highlighted.label : currentNode ? currentNode.label : "Kronos"}
              </span>
              <span className="k-orbit-core-desc">
                {highlighted
                  ? `Ir a ${highlighted.to}`
                  : "Elige un destino · ↑↓←→ · Entrar"}
              </span>
            </div>

            {nodes.map((node) => {
              const isCurrent = node.id === section;
              const isHigh = highlighted?.id === node.id;
              return (
                <div
                  key={node.id}
                  ref={(el) => registerLoopEl(node.id, el)}
                  className={[
                    "k-orbit-node",
                    `is-ring-${node.ring}`,
                    isCurrent ? "is-current" : "",
                    isHigh ? "is-high" : ""
                  ].join(" ")}
                  style={{
                    "--x": node.x,
                    "--y": node.y,
                    zIndex: compact ? "auto" : node.z
                  }}
                >
                  <motion.div
                    className="k-orbit-node-motion"
                    initial={{ opacity: 0, scale: 0.72 }}
                    animate={{ opacity: 1, scale: isHigh ? 1.075 : 1 }}
                    transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1], delay: 0.02 + node.ring * 0.05 + node.z / 40000 }}
                  >
                    <Link
                      to={node.to}
                      ref={(el) => {
                        if (el) nodeRefs.current.set(node.id, el);
                        else nodeRefs.current.delete(node.id);
                      }}
                      data-orbit-node={node.id}
                      aria-current={isCurrent ? "page" : undefined}
                      className="k-orbit-node-link"
                      onMouseEnter={() => setHighlight(node.id)}
                      onMouseLeave={() => setHighlight((prev) => (prev === node.id ? null : prev))}
                      onFocus={() => setHighlight(node.id)}
                      onBlur={() => setHighlight((prev) => (prev === node.id ? null : prev))}
                      onClick={() => {
                        // Aviso al shell: el próximo cambio de plano es
                        // un salto desde el mapa → entra con zoom, no con
                        // desliz lateral (navTransition planSectionShift).
                        if (typeof onNavigate === "function") onNavigate();
                        onClose();
                      }}
                    >
                      <span className="k-orbit-node-disc" aria-hidden="true">
                        {NAV_ICONS[node.icon]}
                      </span>
                      <span className="k-orbit-node-copy">
                        <strong>{node.label}</strong>
                        <small>{RING_LABELS[node.ring]}{isCurrent ? " · actual" : ""}</small>
                      </span>
                    </Link>
                  </motion.div>
                </div>
              );
            })}
          </div>

          <footer className="k-orbit-footer">
            <span aria-hidden="true">{compact ? "Toca un destino para viajar" : "Arrastra la mirada: el anillo interior es tu día a día"}</span>
            <kbd>Esc</kbd>
          </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
