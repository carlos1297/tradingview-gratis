"use client";

import { conectarWebSocket } from "@/lib/modelos/nucleo/transportes/websocket";
import type { ModelSignal } from "@/lib/modelos/nucleo/senales";

/**
 * liveFeed.ts — COMPATIBILIDAD. La implementación real vive ahora en
 * `lib/modelos/nucleo/transportes/websocket.ts`, junto al resto de los transportes.
 *
 * Este archivo se conserva porque era la API pública del cliente WebSocket del
 * servicio de paper trading (`modelo_PPO/main.py`) y puede estar importado
 * desde fuera. Delega en el transporte: no hay dos implementaciones.
 *
 * Código nuevo: registrá el modelo en `lib/modelos/registro.ts` con
 * `transporte: "websocket"` y olvidate de este módulo.
 */

/** @deprecated Usá `ModelSignal` de `lib/modelos/nucleo/senales.ts`. */
export type EventoVivo = ModelSignal;

/** Forma del mensaje `tipo: "estado"` del servicio PPO. */
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
 *
 * `onConexion` ya no refleja los estados intermedios del socket: el transporte
 * no los expone porque ningún componente los usa (la salud del motor se juzga
 * por la antigüedad del estado, en `derivar.saludMotor`, que es más fiable —
 * un socket abierto contra un motor colgado igual está muerto). Se sigue
 * llamando con "fin" cuando el servicio anuncia el final del replay.
 */
export function conectarFeedVivo(
  url: string,
  onEstado: (e: EstadoVivo) => void,
  onConexion?: (c: EstadoConexion) => void,
): () => void {
  return conectarWebSocket({
    url,
    msSondeo: 0, // push: no aplica
    onDatos: (crudo) => {
      const d = crudo as { tipo?: string } & Partial<EstadoVivo>;
      if (d?.tipo === "estado") onEstado(d as EstadoVivo);
      else if (d?.tipo === "fin") onConexion?.("fin");
    },
    onAusente: () => {},
    onAviso: (m) => console.warn(`[feed vivo] ${m}`),
  });
}
