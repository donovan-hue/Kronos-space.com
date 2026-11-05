import { useQuery } from "@tanstack/react-query";
import { getAiUsage } from "../../services/aiService";
import { queryKeys } from "../../services/queryKeys";

/**
 * Consumo de IA del mes.
 *
 * Antes solo existía el limitador: decía cuántos intentos quedaban en 15
 * minutos, no lo que la cuenta llevaba gastado. Cada capacidad se muestra en su
 * propia unidad (`mensajes`, `imágenes`, `videos`, `guiones`, `caracteres`)
 * porque sumarlas daría un número que no significa nada.
 *
 * Los errores se muestran aparte: una operación que el proveedor rechazó no
 * consume cuota de producto, pero sí explica por qué el mes se ve raro.
 *
 * Si la capacidad tiene cuota, se dice «N de M» y cuánto queda; al agotarse se
 * marca la fila y se explica que las rutas responden 402 hasta el día 1. Sin
 * cuota declarada no se inventa un techo: solo se muestra el consumo.
 */

function formatNumber(value) {
  return new Intl.NumberFormat("es-MX").format(Number(value) || 0);
}

const ETIQUETAS = {
  chat: "Chat",
  image: "Imagen",
  video: "Video",
  script: "Guion",
  voice: "Voz"
};

export default function AiUsagePanel() {
  const usageQuery = useQuery({
    queryKey: queryKeys.aiUsage,
    queryFn: getAiUsage
  });

  const capacidades = usageQuery.data?.capacidades || [];
  const error = usageQuery.error
    ? usageQuery.error.response?.data?.error || "No se pudo leer el consumo de IA."
    : "";

  return (
    <section className="k-surface k-ai-usage" aria-label="Consumo de IA del mes">
      <div className="k-section-heading">
        <div>
          <h2>Consumo de IA</h2>
          <span className="k-muted">
            {usageQuery.data?.desde
              ? `Desde el ${new Date(usageQuery.data.desde).toLocaleDateString("es-MX", { day: "2-digit", month: "long" })}`
              : "Mes en curso"}
          </span>
        </div>
        <button
          className="k-button k-button-secondary"
          type="button"
          onClick={() => usageQuery.refetch()}
          disabled={usageQuery.isFetching}
        >
          {usageQuery.isFetching ? "Actualizando..." : "Actualizar"}
        </button>
      </div>

      {error && (
        <div className="k-state k-state-error" role="alert">
          <p>{error}</p>
          <button className="k-button k-button-secondary" type="button" onClick={() => usageQuery.refetch()}>
            Reintentar
          </button>
        </div>
      )}

      {usageQuery.isPending ? (
        <p className="k-muted" role="status">Cargando consumo...</p>
      ) : !error && (
        <dl className="k-ai-usage-list">
          {capacidades.map((item) => (
            <div
              className={`k-ai-usage-row${item.agotada ? " is-agotada" : ""}`}
              key={item.capability}
            >
              <dt>{ETIQUETAS[item.capability] || item.capability}</dt>
              <dd>
                <strong>{formatNumber(item.units)}</strong>{" "}
                {item.cuota ? (
                  <>
                    <span className="k-muted">de {formatNumber(item.cuota)} {item.unit}</span>
                    {item.agotada ? (
                      <span className="k-ai-usage-errors">{" "}· límite del mes alcanzado</span>
                    ) : (
                      <span className="k-muted">{" "}· quedan {formatNumber(item.restante)}</span>
                    )}
                  </>
                ) : (
                  <span className="k-muted">{item.unit}</span>
                )}
                {item.errores > 0 && (
                  <span className="k-ai-usage-errors">
                    {" "}· {formatNumber(item.errores)} con error
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
