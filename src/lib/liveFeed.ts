"use client";

/**
 * liveFeed.ts — Cliente WebSocket del servicio de paper trading en vivo
 * (servicio_vivo/main.py). Se conecta a `ws://host:port/ws` y entrega cada
 * mensaje "estado" del modelo PPO. Reconecta solo con backoff si el socket cae
 * (p. ej. mientras el servicio termina de cargar TensorFlow al arrancar, o si
 * el replay del split todavía no empezó).
 *
 * No conoce React ni el store: es un primitivo reutilizable. Lo cablea
 * `lib/modelos/useModelosIA.ts`, que lo usa para las fuentes del registro con
 * transporte "websocket" y traduce cada mensaje con adaptarFeedWebSocket.
 */

export interface EventoVivo {
  tiempoMs: number;
  evento: "abrir_long" | "abrir_short" | "cerrar_long" | "cerrar_short";
  precio: number;
  motivo?: string;
  pnlUsd?: number;
}

export interface EstadoVivo {
  tipo: "estado";
  tiempoMs: number;
  precio: number;
  equity: number;
  pnlTotalPct: number;
  posicion: -1 | 0 | 1;
  regimen: string | null;
  confianza: number | null;
  motivoRiesgo: string | null;
  eventos: EventoVivo[];
  fin?: boolean;
  quiebra?: boolean;
}

export type EstadoConexion = "conectando" | "conectado" | "desconectado" | "fin";

/**
 * Abre la conexión y devuelve una función para cerrarla (limpieza del efecto).
 * `onEstado` recibe cada tick del modelo; `onConexion` (opcional) los cambios
 * de estado de la conexión, para pintar un indicador.
 */
export function conectarFeedVivo(
  url: string,
  onEstado: (e: EstadoVivo) => void,
  onConexion?: (c: EstadoConexion) => void,
): () => void {
  let ws: WebSocket | null = null;
  let cerrado = false;
  let reintentoMs = 1000;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const conectar = () => {
    if (cerrado) return;
    onConexion?.("conectando");
    ws = new WebSocket(url);

    ws.onopen = () => {
      reintentoMs = 1000;
      onConexion?.("conectado");
    };
    ws.onmessage = (m: MessageEvent) => {
      let d: { tipo?: string } & Partial<EstadoVivo>;
      try {
        d = JSON.parse(String(m.data));
      } catch {
        return;
      }
      if (d.tipo === "estado") onEstado(d as EstadoVivo);
      else if (d.tipo === "fin") onConexion?.("fin");
    };
    ws.onclose = () => {
      if (cerrado) return;
      onConexion?.("desconectado");
      // backoff exponencial suave hasta 10 s: el servicio puede tardar en
      // cargar el modelo, o el replay puede reiniciar entre pasadas.
      timer = setTimeout(conectar, reintentoMs);
      reintentoMs = Math.min(reintentoMs * 2, 10000);
    };
    ws.onerror = () => {
      // onclose se dispara a continuación y ahí se agenda la reconexión.
      ws?.close();
    };
  };

  conectar();

  return () => {
    cerrado = true;
    if (timer) clearTimeout(timer);
    ws?.close();
  };
}
