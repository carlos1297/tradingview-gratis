import type { Conector } from "./tipos";

/**
 * transportes/websocket.ts — El motor empuja mensajes por WebSocket.
 *
 * Reconecta solo con backoff exponencial: un servicio que todavía está
 * cargando TensorFlow, un replay que reinicia entre pasadas o un corte de red
 * no dejan el modelo caído para siempre.
 *
 * A diferencia del transporte de archivo, acá los mensajes suelen ser
 * INCREMENTALES (solo los eventos nuevos de cada tick). Acumularlos es tarea
 * del adaptador, que recibe el estado previo — el transporte no interpreta.
 */

/** Backoff: primer reintento y tope. Suave, para no golpear un servicio que arranca. */
const REINTENTO_INICIAL_MS = 1000;
const REINTENTO_MAXIMO_MS = 10_000;

export const conectarWebSocket: Conector = ({ url, onDatos, onAviso }) => {
  let ws: WebSocket | null = null;
  let cerrado = false;
  let reintentoMs = REINTENTO_INICIAL_MS;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const conectar = () => {
    if (cerrado) return;
    ws = new WebSocket(url);

    ws.onopen = () => {
      reintentoMs = REINTENTO_INICIAL_MS;
    };

    ws.onmessage = (m: MessageEvent) => {
      let d: unknown;
      try {
        d = JSON.parse(String(m.data));
      } catch {
        return; // mensaje ilegible: se descarta, la conexión sigue
      }
      const tipo = (d as { tipo?: unknown } | null)?.tipo;
      if (tipo === "error") {
        // El servicio rechaza la conexión y explica por qué (p. ej. ya tiene
        // un consumidor: sirve a uno por vez). Sin esto el modelo no aparece
        // nunca y el reintento en bucle no deja ninguna pista.
        const mensaje = (d as { mensaje?: string }).mensaje ?? "sin detalle";
        onAviso?.(`el servicio rechazó la conexión: ${mensaje}`);
        return;
      }
      // Todo lo demás va al adaptador de la fuente, que decide qué hacer con
      // cada `tipo`. El transporte no conoce el protocolo del modelo.
      onDatos(d);
    };

    ws.onclose = () => {
      if (cerrado) return;
      timer = setTimeout(conectar, reintentoMs);
      reintentoMs = Math.min(reintentoMs * 2, REINTENTO_MAXIMO_MS);
    };

    ws.onerror = () => {
      // `onclose` se dispara a continuación y ahí se agenda la reconexión.
      ws?.close();
    };
  };

  conectar();

  return () => {
    cerrado = true;
    if (timer) clearTimeout(timer);
    ws?.close();
  };
};
