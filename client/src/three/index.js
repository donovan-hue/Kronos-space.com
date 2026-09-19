// ============================================================
// KRONOS-3D — API pública de la capa 3D
// ------------------------------------------------------------
// Único punto de entrada que debe importar el resto de la app. El
// código pesado (three, fiber, drei) vive tras un React.lazy dentro
// de SceneBackground: mientras una escena no se monte, nada de eso
// se descarga y el bundle principal queda intacto.
//
// Escenas disponibles:
//   "auth"       → fondo cinematográfico de login/registro
//   "kairos-orb" → orbe cromado decorativo del hub de Kairos
// ============================================================

export { default as SceneBackground } from "./SceneBackground";
export { getGraphicsTier, supportsWebGL } from "./capabilities";
