/**
 * FASE 8 (frontend) — estado de carga de una ruta diferida.
 *
 * Con la división de código por ruta, cambiar de sección puede exigir una
 * descarga. Ese instante necesita: altura estable (para no desplazar lo que
 * ya está pintado), anuncio a lectores de pantalla y respeto por
 * `prefers-reduced-motion` (sin giro para quien lo pide).
 */
export default function RouteFallback({ label = "Cargando sección…" }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="flex min-h-[50vh] w-full items-center justify-center"
    >
      <span className="sr-only">{label}</span>
      <span
        aria-hidden="true"
        className="h-8 w-8 rounded-full border-2 border-white/20 border-t-white/80 motion-safe:animate-spin"
      />
    </div>
  );
}
