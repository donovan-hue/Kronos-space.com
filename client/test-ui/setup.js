/**
 * KRONOS-AUDIT-004 — aislamiento de red de las pruebas de interfaz.
 *
 * Las especificaciones montan pantallas reales. Cualquier pantalla que
 * llame a un servicio que la prueba no haya simulado acaba haciendo una
 * petición XHR de verdad desde jsdom. jsdom no puede servirla, así que
 * revertía con `AggregateError` impreso en la salida de la suite.
 *
 * Eso tenía dos consecuencias indeseadas:
 *
 *  1. Ruido. La suite imprimía decenas de trazas de error que hacían
 *     dificil ver un fallo real (con `block-014-drafts.spec.jsx` como caso
 *     mínimo y reproducible: `CreatePost` usa `getCircles` y `getOrbits`,
 *     que la prueba nunca simulaba).
 *  2. Falsa sensación de cobertura. La prueba pasaba porque la petición
 *     fallaba y el componente mostraba su estado vacío, no porque el
 *     estado vacío fuese el comportamiento comprobado.
 *
 * Aquí se sustituye el adaptador de axios por uno que rechaza de
 * inmediato y con un error reconocible. El contrato no cambia: sigue siendo
 * un fallo de red sin `response`, así que los interceptores de
 * `apiClient.js` se comportan igual y los componentes que capturan el error
 * siguen mostrando su estado de respaldo. Lo que cambia es que ahora es
 * determinista, instantáneo y silencioso.
 *
 * Ninguna prueba depende de red real: la aplicación resuelve sus URLs
 * relativas a `/api` y jsdom no tiene servidor.
 */

import axios from "axios";

const TEST_NETWORK_ERROR_CODE = "ERR_NETWORK_DISABLED_IN_TESTS";

/** Marca el error para poder distinguirlo de un fallo de la aplicación. */
export function isDisabledNetworkError(error) {
  return error?.code === TEST_NETWORK_ERROR_CODE;
}

/** Adaptador que nunca sale a la red y falla con una forma conocida. */
function disabledNetworkAdapter(config) {
  const url = `${config?.baseURL || ""}${config?.url || ""}`;
  const method = String(config?.method || "get").toUpperCase();

  const error = new Error(
    `NETWORK_DISABLED_IN_TESTS: ${method} ${url} — simula el servicio que consume esta pantalla con vi.mock`
  );

  error.code = TEST_NETWORK_ERROR_CODE;
  error.config = config;
  error.isAxiosError = true;
  error.request = {};

  return Promise.reject(error);
}

// `apiClient.js` crea su instancia con `axios.create`, que hereda los
// valores por defecto en el momento de crearla. Definir el adaptador aquí
// —antes de que las especificaciones importen nada— cubre tanto esa
// instancia como cualquier uso directo de axios.
axios.defaults.adapter = disabledNetworkAdapter;

/**
 * Contexto gráfico nulo sin el aviso de jsdom.
 *
 * jsdom no trae canvas: `getContext` no está implementado y devuelve `null`
 * tras imprimir "Not implemented: HTMLCanvasElement.prototype.getContext"
 * en cada llamada. `three/capabilities.js` llama a ese método a propósito
 * para decidir si puede cargar la escena 3D, así que el aviso aparecía
 * decenas de veces por ejecución.
 *
 * El valor de retorno no cambia: sigue siendo `null`, que es justo lo que
 * jsdom ya devolvía y lo que hace que `supportsWebGL()` informe que no hay
 * WebGL y la aplicación use su respaldo. Solo desaparece el ruido.
 *
 * Las especificaciones que necesitan un contexto real lo siguen simulando
 * por su cuenta con `vi.spyOn(HTMLCanvasElement.prototype, "getContext")`,
 * que sustituye esta misma función.
 */
const silentCanvasContext = function getContext() {
  return null;
};

if (typeof HTMLCanvasElement !== "undefined") {
  HTMLCanvasElement.prototype.getContext = silentCanvasContext;
}
