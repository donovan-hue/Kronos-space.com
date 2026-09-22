import { Component } from "react";

/**
 * Error Boundary de KRONOS (C-4).
 *
 * Sin esto, cualquier excepción de render tumba la aplicación completa
 * (pantalla blanca). Se monta un boundary global en App y uno por ruta
 * (vía `RouteErrorBoundary`) para que un fallo aísle solo su pantalla.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorId: "" };
  }

  static getDerivedStateFromError() {
    return {
      hasError: true,
      errorId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    };
  }

  componentDidCatch(error, info) {
    // Log operacional sin PII: mensaje + componente que falló.
    console.error("RENDER_ERROR", {
      errorId: this.state.errorId,
      message: error?.message || String(error),
      componentStack: String(info?.componentStack || "").split("\n").slice(0, 4).join(" ").slice(0, 300)
    });
    this.props.onError?.(error, info);
  }

  componentDidUpdate(prevProps) {
    // Al navegar a otra pantalla el boundary se reinicia solo.
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false, errorId: "" });
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <section className="page" aria-labelledby="render-error-title">
        <div className="k-feed-state" role="alert">
          <h2 id="render-error-title">Algo no se pudo mostrar</h2>
          <p>Ocurrió un error al dibujar esta pantalla. Tus datos están a salvo.</p>
          <p className="k-muted">Referencia: {this.state.errorId}</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="k-button k-button-primary"
              onClick={() => this.setState({ hasError: false, errorId: "" })}
            >
              Reintentar
            </button>
            <button
              type="button"
              className="k-button k-button-secondary"
              onClick={() => window.location.assign("/home")}
            >
              Ir al inicio
            </button>
          </div>
        </div>
      </section>
    );
  }
}

export default ErrorBoundary;
