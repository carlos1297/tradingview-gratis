/**
 * transportes/tipos.ts — Interfaz que debe cumplir CUALQUIER transporte.
 *
 * Un transporte es lo único que sabe *cómo viajan los bytes* desde el motor
 * hasta el visor (sondear un archivo, escuchar un WebSocket, abrir un SSE…).
 * No sabe qué modelo es, ni qué significan los datos: entrega el JSON crudo y
 * el adaptador de la fuente se encarga del resto.
 *
 * Este módulo NO importa nada del dominio a propósito. Así `tipos.ts` puede
 * derivar el tipo `Transporte` del registro de transportes sin ciclo de
 * imports, y agregar un transporte nuevo no obliga a tocar el contrato.
 */

export interface OpcionesTransporte {
  /** Ruta o URL de la fuente, ya validada como no vacía. */
  url: string;
  /** Cada cuánto consultar, en ms. Los transportes push lo ignoran. */
  msSondeo: number;
  /** Un mensaje/lectura del motor, sin interpretar. */
  onDatos: (crudo: unknown) => void;
  /**
   * La fuente dejó de existir (404 tras haber respondido antes). El núcleo lo
   * usa para sacar el modelo del selector en vez de dejar un fantasma.
   * Un transporte que no puede distinguir ese caso simplemente no lo llama.
   */
  onAusente: () => void;
  /** Diagnóstico para consola: rechazo del servidor, formato ilegible… */
  onAviso?: (mensaje: string) => void;
}

/**
 * Abre la conexión y devuelve la función que la cierra. La firma es la de un
 * cleanup de `useEffect` a propósito: el núcleo la usa tal cual.
 */
export type Conector = (opciones: OpcionesTransporte) => () => void;
