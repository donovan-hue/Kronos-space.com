import React from "react";

/**
 * KRONOS-UIX-AUDIT — límite de error global de la interfaz.
 *
 * Antes existía únicamente el boundary del fondo 3D (SceneBackground):
 * cualquier excepción al renderizar una pantalla de la app montaba el
 * «black screen of death» sin salida: ni explicación, ni reintento, ni
 * forma de volver. Este boundary envuelve el árbol completo (router y
 * proveedores incluidos) y ofrece tres caminos reales:
 *
 *   1. Reintentar el render (remonta el árbol sin recargar la página);
 *   2. Recargar la aplicación (limpia estado transitorio);
 *   3. Volver al inicio (enlace directo, funciona sin JS de la app).
 *
 * El registro del error en consola se conserva para no ocultar fallos.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, attempt: 0 };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // No se traga el error: queda visible para diagnóstico (regla
    // KRONOS: nunca ocultar errores de consola).
    console.error("[Kronos UI] Fallo al renderizar la interfaz:", error, info?.componentStack);
  }

  handleRetry = () => {
    this.setState((state) => ({ error: null, attempt: state.attempt + 1 }));
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.error) {
      // `key` fuerza un árbol nuevo al reintentar: los componentes con
      // estado interno corrupto vuelven a montar desde cero.
      return <div key={this.state.attempt} className="k-error-boundary-root">{this.props.children}</div>;
    }

    const detail = String(this.state.error?.message || this.state.error || "");

    return (
      <main className="k-error-fallback" role="alert" aria-labelledby="k-error-title">
        <div className="k-error-fallback-card">
          <span className="k-eyebrow">KRONOS · ERROR DE INTERFAZ</span>
          <h1 id="k-error-title">Algo se rompió en esta vista</h1>
          <p>
            La aplicación pudo continuar, pero esta pantalla falló al dibujarse.
            Tus datos en el servidor no se han perdido. Reintenta el render o
            vuelve al inicio.
          </p>
          {detail && (
            <p className="k-error-fallback-detail" title={detail}>
              {detail.length > 180 ? `${detail.slice(0, 180)}…` : detail}
            </p>
          )}
          <div className="k-error-fallback-actions">
            <button type="button" className="k-button k-button-primary" onClick={this.handleRetry}>
              Reintentar
            </button>
            <button type="button" className="k-button k-button-secondary" onClick={this.handleReload}>
              Recargar la aplicación
            </button>
            <a className="k-button k-button-secondary" href="/">
              Volver al inicio
            </a>
          </div>
        </div>
      </main>
    );
  }
}
