import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// Captura errores de render para que la app no se quede en pantalla blanca.
// Cumple WCAG 3.3.1 Error Identification al anunciar el error con role="alert".
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ErrorBoundary]", error, info);
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <main
        role="alert"
        className="min-h-screen flex items-center justify-center bg-slate-50 p-6"
      >
        <div className="max-w-xl rounded-lg border border-red-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-bold text-red-800">
            Algo salió mal al cargar la aplicación
          </h1>
          <p className="mt-2 text-sm text-slate-700">
            {this.state.error.message}
          </p>
          <details className="mt-4 text-xs text-slate-600">
            <summary className="cursor-pointer font-medium">
              Detalles técnicos
            </summary>
            <pre className="mt-2 overflow-auto whitespace-pre-wrap rounded bg-slate-100 p-2">
              {this.state.error.stack}
            </pre>
          </details>
          <button
            type="button"
            onClick={this.reset}
            className="mt-4 rounded-md bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
          >
            Reintentar
          </button>
        </div>
      </main>
    );
  }
}
