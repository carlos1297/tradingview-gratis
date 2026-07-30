import type { Timeframe } from "./types";

/**
 * temporalidades.ts — Cuánto dura cada vela, y qué temporalidad hace falta
 * para que un período entre en una sola carga de velas.
 *
 * Existe porque el gráfico carga un número FIJO de velas (1000 por petición a
 * Binance), así que la temporalidad decide cuánto tiempo abarca la pantalla:
 * 1000 velas de 15m son 10 días, 1000 velas de 1d son casi 3 años. Pedirle al
 * chart un rango visible más ancho que los datos que cargó lo deja casi vacío.
 */

/** Minutos que dura una vela de cada temporalidad. */
export const MINUTOS_POR_TEMPORALIDAD: Record<Timeframe, number> = {
  "1m": 1,
  "3m": 3,
  "5m": 5,
  "15m": 15,
  "30m": 30,
  "1h": 60,
  "2h": 120,
  "4h": 240,
  "6h": 360,
  "8h": 480,
  "12h": 720,
  "1d": 1440,
  "3d": 4320,
  "1w": 10080,
  "1M": 43200, // 30 días — aproximación suficiente para dimensionar
};

/** Velas que devuelve una carga base del gráfico (tope de la API de Binance). */
export const VELAS_POR_CARGA = 1000;

/**
 * Velas de la PRIMERA pintada del gráfico.
 *
 * Las suficientes para llenar la pantalla con velas LEGIBLES; el resto llega
 * después, en segundo plano. Antes cada ventana esperaba las 1000 antes de
 * dibujar nada: con el mosaico eso son 1000 × ventana abierta antes de ver la
 * primera imagen, y encima 1000 velas en ~900 px quedan comprimidas a menos de
 * un píxel cada una.
 *
 * Tiene que ser MENOR que `VELAS_POR_CARGA`, o la completación pediría cero.
 */
export const VELAS_PRIMERA_PINTADA = 120;

/** Cuánto tiempo, en ms, abarca una carga completa de esta temporalidad. */
export function ms_queAbarca(
  temporalidad: Timeframe,
  velas: number = VELAS_POR_CARGA,
): number {
  return MINUTOS_POR_TEMPORALIDAD[temporalidad] * 60_000 * velas;
}

/** De la más fina a la más gruesa: el orden en que se busca la que alcanza. */
const ORDENADAS = (Object.keys(MINUTOS_POR_TEMPORALIDAD) as Timeframe[]).sort(
  (a, b) => MINUTOS_POR_TEMPORALIDAD[a] - MINUTOS_POR_TEMPORALIDAD[b],
);

/**
 * La temporalidad MÁS FINA cuyas `velas` velas cubren `duracionMs`.
 *
 * Se usa al cargar las señales de un backtest: un `senales.json` de validación
 * puede abarcar 8 meses, y en 15m —el default del visor— esa carga son 10 días.
 * El gráfico saltaba al final del backtest y encuadraba los 8 meses completos,
 * de los cuales tenía datos para el 4%: se veía casi vacío y los marcadores
 * fuera de rango no se dibujaban. Eligiendo la temporalidad por el largo del
 * período, las operaciones entran todas en pantalla.
 *
 * Se prefiere la más fina que alcance para no perder detalle de precio sin
 * necesidad. Si ni la más gruesa cubre el período, devuelve esa (mejor ver la
 * parte más reciente que nada) — el scroll hacia la izquierda carga el resto.
 */
export function temporalidadParaPeriodo(
  duracionMs: number,
  velas: number = VELAS_POR_CARGA,
): Timeframe {
  return (
    ORDENADAS.find((t) => ms_queAbarca(t, velas) >= duracionMs) ??
    ORDENADAS[ORDENADAS.length - 1]
  );
}
