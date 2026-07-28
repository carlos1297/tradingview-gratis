import type { ModelSignal } from "./senales";
import type { Transporte as TransporteId } from "./transportes";

/**
 * tipos.ts — Contrato CANÓNICO de un motor de IA en vivo.
 *
 * Este es el único formato que conoce la interfaz. Cada motor (SAC, PPO, …)
 * publica su propio JSON y un adaptador lo traduce a `EstadoModeloIA`. Así el
 * panel, el gráfico y los paneles de rendimiento no saben —ni les importa—
 * qué modelo están mostrando.
 *
 * Agregar un modelo nuevo = un adaptador + una entrada en el registro.
 * Ningún componente cambia.
 */

/** Versión del contrato que publica el motor. v0 = JSON legado sin versionar. */
export const CONTRATO_ACTUAL = 1;

/**
 * Cadencia por defecto de una fuente. Los dos motores del proyecto deciden
 * por cierre de vela de 5 minutos; una fuente con otro ritmo lo declara en su
 * entrada del registro (`msSondeo` / `msFresco`) sin tocar el núcleo.
 */
export const MS_SONDEO_POR_DEFECTO = 5_000;
/** Una vela 5m + margen: pasado esto, el motor va atrasado. */
export const MS_FRESCO_POR_DEFECTO = 6 * 60 * 1000;

export type EstadoMotor = "arrancando" | "operando" | "detenido" | "error";

export type LadoPosicion = "LONG" | "SHORT" | "FLAT";

/**
 * Qué está pidiendo el modelo AHORA. Se deriva de la acción continua y de la
 * posición vigente — no lo publica el motor, para que un modelo discreto
 * (PPO con acciones {comprar, vender, mantener}) encaje igual.
 */
export type SenalOperativa = "COMPRAR" | "VENDER" | "MANTENER" | "CERRAR";

/** Estado en vivo de UN modelo, ya normalizado. */
export interface EstadoModeloIA {
  /** Versión del contrato del JSON de origen (0 = legado). */
  contrato: number;
  /** Identificador estable del modelo: "sac", "ppo", … */
  modeloId: string;
  /** Nombre para mostrar: "SAC", "PPO". */
  modeloEtiqueta: string;

  estado: EstadoMotor;
  mensaje: string | null;
  simbolo: string;
  /** Siempre false en paper trading. La interfaz lo muestra explícito. */
  dineroReal: boolean;
  checkpoint: string | null;

  // ── Mercado ──────────────────────────────────────────────────────────
  precio: number | null;
  ultimaVelaMs: number | null;
  /**
   * ¿El reloj del motor es el de pared?
   *
   * `false` = replay de datos históricos (el servicio PPO reproduce el split de
   * test). Es determinante: con un motor en replay, el precio en vivo de
   * Binance NO puede compararse contra un precio de entrada de hace dos años —
   * el PnL saldría disparatado. La interfaz usa `precio` del motor y no el tick
   * del feed. Un motor que no lo publica se asume en vivo (compatibilidad).
   */
  enVivo: boolean;
  /** Cuándo escribió el motor este estado (para el semáforo de frescura). */
  actualizadoMs: number;

  // ── Cuenta ───────────────────────────────────────────────────────────
  capitalInicial: number | null;
  /** Billetera: incluye el PnL ya realizado, no el flotante. */
  saldo: number | null;
  /** saldo + PnL no realizado. */
  equity: number | null;

  // ── Posición abierta (todo null si FLAT) ─────────────────────────────
  posicion: LadoPosicion;
  precioEntrada: number | null;
  aperturaMs: number | null;
  /** Exposición en USD (margen × apalancamiento). */
  nocional: number | null;
  apalancamiento: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  /** Precio al que la posición se liquidaría. Con apalancamiento, es el dato
   *  que de verdad limita la operación. */
  precioLiquidacion: number | null;

  // ── Decisión del agente ──────────────────────────────────────────────
  /** Acción continua en [-1, 1]: signo = dirección, |a| = convicción. */
  accion: number | null;
  /** |accion| por debajo de esto = intención de quedarse plano. */
  zonaMuerta: number;
  /**
   * Régimen de mercado que percibe el modelo ("alcista", "lateral"…), o `null`
   * si no lo publica. Opcional a propósito: no todos los motores tienen un
   * clasificador de régimen, y el panel muestra "—" para los que no.
   */
  regimen: string | null;
  /**
   * Por qué el motor de riesgo vetó o recortó la decisión del agente en este
   * tick ("regimen_lateral", "veto_colchon_liquidacion"…). `null` = no
   * intervino. Explica los casos en que el modelo pide operar y no pasa nada.
   */
  motivoRiesgo: string | null;

  // ── Acumulados de la corrida ─────────────────────────────────────────
  operaciones: number;
  comisiones: number | null;
  funding: number | null;
  /** Aperturas/cierres en el mismo formato que senales.json del backtest. */
  senales: ModelSignal[];
}

/**
 * Todo lo que el panel muestra pero NADIE almacena: se recalcula en cada
 * render desde `EstadoModeloIA` + el precio de mercado. Mantenerlo derivado
 * evita que el motor y la interfaz se contradigan.
 */
export interface VistaOperacion {
  lado: LadoPosicion;
  hayPosicion: boolean;
  senal: SenalOperativa;
  /** |accion| normalizada a 0..1. */
  confianza: number;

  precioEntrada: number | null;
  precioActual: number | null;

  pnlNoRealizadoUsd: number | null;
  pnlNoRealizadoPct: number | null;
  pnlRealizadoUsd: number | null;
  pnlTotalUsd: number | null;
  pnlTotalPct: number | null;

  /** Cuánto lleva abierta la operación, en ms. */
  duracionMs: number | null;
  nocional: number | null;

  stopLoss: number | null;
  takeProfit: number | null;
  /** Recompensa ÷ riesgo según las distancias reales a TP y SL. */
  riesgoRecompensa: number | null;
  /** Cuánto falta hasta el stop, en % del precio actual (negativo = pasado). */
  distanciaStopPct: number | null;
  distanciaTakePct: number | null;
  /** Cuánto falta hasta la liquidación, en % del precio actual. */
  distanciaLiquidacionPct: number | null;
}

/** Salud del motor, derivada de la antigüedad del último estado escrito. */
export type SaludMotor = "operando" | "arrancando" | "atrasado" | "detenido" | "error";

/**
 * Cómo llega el estado de un motor. El catálogo vive en
 * `transportes/index.ts`; este tipo se deriva de sus claves, así que sumar un
 * transporte nuevo (SSE, long-poll…) no obliga a editar este archivo.
 *
 * Los dos que ya existen en el proyecto:
 *   "archivo"   — el motor escribe un JSON en public/ y la interfaz lo sondea
 *                 (modelo_SAC/operar_vivo.py → estado_vivo.json)
 *   "websocket" — el motor empuja mensajes por WS (modelo_PPO/main.py)
 */
export type { Transporte } from "./transportes";

/**
 * Traduce el JSON crudo de UN motor al contrato canónico.
 *
 * `previo` es el último estado conocido de ese mismo modelo: los transportes
 * incrementales (WebSocket, que manda solo los eventos nuevos de cada tick)
 * lo usan para acumular. Los adaptadores de archivo lo ignoran, porque cada
 * lectura ya trae el estado completo.
 */
export type Adaptador = (
  crudo: unknown,
  fuente: FuenteModelo,
  previo: EstadoModeloIA | null,
) => EstadoModeloIA | null;

/**
 * Una fuente de datos registrada. Agregar un modelo = añadir uno de estos al
 * registro; no se toca ningún componente.
 */
export interface FuenteModelo {
  id: string;
  etiqueta: string;
  /** Texto corto para el tooltip del selector. */
  descripcion: string;
  /** Color de acento del modelo en la interfaz. */
  color: string;
  transporte: TransporteId;
  /**
   * Origen del estado: ruta en public/ para "archivo", URL ws:// para
   * "websocket". `undefined` = fuente desactivada (p. ej. la variable de
   * entorno del servicio no está definida): se ignora sin romper nada.
   */
  url: string | undefined;
  adaptar: Adaptador;

  // ── Cadencia (opcional; hay defaults sensatos para 5m) ────────────────
  /**
   * Cada cuánto sondear la fuente, en ms. Solo aplica al transporte
   * "archivo". Default: `MS_SONDEO_POR_DEFECTO`.
   *
   * Es POR FUENTE porque la cadencia la fija el motor: uno que decide por
   * vela de 5 minutos no gana nada con un sondeo de 1 s, y uno que publica
   * cada segundo se ve entrecortado con uno de 5 s.
   */
  msSondeo?: number;
  /**
   * A partir de qué desfase el motor se considera ATRASADO, en ms. El doble
   * de este valor lo marca DETENIDO. Default: `MS_FRESCO_POR_DEFECTO`
   * (una vela de 5m + margen).
   *
   * Un motor de barras horarias con el default aparecería "detenido" el 95%
   * del tiempo; uno de 1 minuto tardaría 12 minutos en delatar que murió.
   */
  msFresco?: number;
}
