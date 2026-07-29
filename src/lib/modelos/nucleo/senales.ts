/**
 * senales.ts — Vocabulario de eventos de trading. Es la pieza MÁS básica del
 * dominio: no importa nada.
 *
 * Vivía dentro de `lib/store/chart-store.ts`, y eso invertía la dependencia:
 * el contrato de los modelos (`tipos.ts`) y el cálculo de operaciones
 * (`lib/trades.ts`) —que no tienen nada que ver con la interfaz— terminaban
 * importando desde un store de Zustand con `persist` y `"use client"`. Acá el
 * sentido es el correcto: la interfaz depende del dominio, nunca al revés.
 *
 * `chart-store.ts` re-exporta estos tipos, así que todo import previo
 * (`from "@/lib/store/chart-store"`) sigue compilando igual.
 */

/** Los cuatro eventos que puede emitir cualquier motor. Cerrado a propósito. */
export const EVENTOS_SENAL = [
  "abrir_long",
  "abrir_short",
  "cerrar_long",
  "cerrar_short",
] as const;

export type EventoSenal = (typeof EVENTOS_SENAL)[number];

/**
 * Una apertura o un cierre. Formato compartido por los tres orígenes de datos
 * del visor —`senales.json` de backtest, `estado_vivo.json` y el feed
 * WebSocket— para que el Probador de estrategias los procese con el mismo
 * código.
 */
export interface ModelSignal {
  /** Epoch en MILISEGUNDOS, UTC. */
  tiempoMs: number;
  evento: EventoSenal;
  /** Precio de ejecución, ya con slippage aplicado. */
  precio: number;
  /** Solo en cierres: "stop_loss" | "take_profit" | "liquidacion" | "senal"… */
  motivo?: string;
  /** Solo en cierres: resultado neto de la operación, en USD. */
  pnlUsd?: number;
}

/** Un archivo/lote de señales con el contexto mínimo para interpretarlas. */
export interface ModelSignalsFile {
  /** Par al que pertenecen los precios: "BTCUSDT". */
  simbolo: string;
  /** De dónde salen: "test", "SAC en vivo"… Se muestra tal cual. */
  split: string;
  checkpoint?: string;
  senales: ModelSignal[];
  /**
   * Quién puso estas señales. Determina cómo se comporta el gráfico:
   *
   * · `"archivo"` — un `senales.json` de backtest cargado a mano. Sus señales
   *   son de un período HISTÓRICO, así que el gráfico salta a esa fecha y se
   *   queda quieto: no tiene sentido suscribirse al vivo para mirar marzo.
   * · `"vivo"` — un motor publicando ahora. El gráfico sigue en tiempo real.
   *
   * Sin esta distinción las dos fuentes escribían en el mismo lugar y el
   * gráfico trataba a un modelo en vivo como si fuera un backtest: dejaba de
   * suscribirse al WebSocket y las velas se congelaban.
   *
   * Opcional por compatibilidad; ausente se trata como `"archivo"`, que es el
   * comportamiento que ya existía.
   */
  origen?: "vivo" | "archivo";
}

const EVENTOS = new Set<string>(EVENTOS_SENAL);

export function esEventoSenal(v: unknown): v is EventoSenal {
  return typeof v === "string" && EVENTOS.has(v);
}

/**
 * Filtra una lista cruda dejando solo señales usables.
 *
 * Un motor con un bug —un `tiempoMs` en segundos, un evento mal escrito, un
 * `null` colado en el array— no puede tumbar el visor ni ensuciar las
 * estadísticas: lo inválido se descarta y el resto se muestra. Es la frontera
 * de confianza entre un proceso externo y la interfaz.
 */
export function sanearSenales(v: unknown): ModelSignal[] {
  if (!Array.isArray(v)) return [];
  const limpias: ModelSignal[] = [];
  for (const s of v) {
    if (!s || typeof s !== "object") continue;
    const c = s as Record<string, unknown>;
    if (!esEventoSenal(c.evento)) continue;
    if (typeof c.tiempoMs !== "number" || !Number.isFinite(c.tiempoMs)) continue;
    // precio > 0, no solo "es un número": un precio 0 o negativo no existe en
    // ningún mercado, y dibujarlo arruina la escala del gráfico. Aparece de
    // verdad — un motor que emite la apertura mirando la posición ANTES de
    // cerrarla publica una señal a 0 con el precio de entrada ya limpiado.
    if (typeof c.precio !== "number" || !Number.isFinite(c.precio) || c.precio <= 0) {
      continue;
    }
    limpias.push({
      tiempoMs: c.tiempoMs,
      evento: c.evento,
      precio: c.precio,
      ...(typeof c.motivo === "string" ? { motivo: c.motivo } : {}),
      ...(typeof c.pnlUsd === "number" && Number.isFinite(c.pnlUsd)
        ? { pnlUsd: c.pnlUsd }
        : {}),
    });
  }
  return limpias;
}

/** ¿Es una apertura? Evita repetir la comparación doble por todo el código. */
export function esApertura(s: ModelSignal): boolean {
  return s.evento === "abrir_long" || s.evento === "abrir_short";
}

export function esCierre(s: ModelSignal): boolean {
  return s.evento === "cerrar_long" || s.evento === "cerrar_short";
}
