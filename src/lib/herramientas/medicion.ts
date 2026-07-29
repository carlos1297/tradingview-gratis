import type { Candle } from "@/lib/binance/types";
import type { PuntoGrafico } from "./tipos";

/**
 * medicion.ts — Qué hay entre dos puntos del gráfico.
 *
 * Módulo PURO: sin React, sin canvas, sin stores. Lo consume la herramienta
 * de medición del registro, y se puede testear con dos puntos y una lista de
 * velas. Todo lo que se muestra sale de acá; el dibujo solo lo rotula.
 */

export interface Medicion {
  /** Diferencia de precio, con signo (B − A). */
  deltaPrecio: number;
  /** Variación porcentual respecto del punto A. */
  pct: number;
  /** Velas entre los dos puntos. Medir dentro de la misma vela da 0. */
  barras: number;
  /** Tiempo transcurrido entre los dos puntos, en ms. */
  duracionMs: number;
  /** Distancia en ticks del par (|Δprecio| ÷ tamaño de tick). */
  ticks: number;
  /** Tamaño de tick usado para la cuenta anterior. */
  tamanoTick: number;
  /** Volumen acumulado de las velas del rango. */
  volumen: number;
  /** B por encima de A: tiñe el trazo de verde o rojo. */
  alcista: boolean;
}

/**
 * Tamaño de tick del par, deducido de la magnitud del precio.
 *
 * Binance publica el `tickSize` real en los filtros de `/exchangeInfo`, pero
 * `fetchExchangeSymbols()` hoy se queda solo con el nombre del par. Deducirlo
 * evita meterle una dependencia de red a un cálculo puro, y usa los MISMOS
 * tramos que `formatPrice`, así el número de ticks es coherente con los
 * decimales que el visor ya muestra.
 *
 * Si algún día hace falta exactitud al tick para pares raros, el arreglo es
 * conservar el filtro `PRICE_FILTER` en `SymbolInfo` y pasarlo por acá.
 */
export function tamanoTick(precio: number): number {
  const p = Math.abs(precio);
  if (p >= 1) return 0.01;
  if (p >= 0.01) return 0.0001;
  return 0.000001;
}

/**
 * Índice de la vela que abre en `tiempo`, o el de la anterior más cercana.
 *
 * Búsqueda binaria: las velas están ordenadas y esto corre en cada movimiento
 * del cursor mientras se coloca el segundo punto.
 */
function indiceDeVela(velas: readonly Candle[], tiempo: number): number {
  let bajo = 0;
  let alto = velas.length - 1;
  let encontrado = -1;
  while (bajo <= alto) {
    const medio = (bajo + alto) >> 1;
    if (velas[medio].time <= tiempo) {
      encontrado = medio;
      bajo = medio + 1;
    } else {
      alto = medio - 1;
    }
  }
  return encontrado;
}

/**
 * Mide entre dos puntos. El orden no importa para las magnitudes (barras,
 * duración, volumen); sí para el signo del precio, que siempre es B − A.
 */
export function calcularMedicion(
  a: PuntoGrafico,
  b: PuntoGrafico,
  velas: readonly Candle[] = [],
): Medicion {
  const deltaPrecio = b.precio - a.precio;
  const pct = a.precio === 0 ? 0 : (deltaPrecio / a.precio) * 100;
  const tick = tamanoTick(a.precio);

  // Barras por ÍNDICE, no contando velas dentro del rango: de la vela i a la
  // j hay |j − i| barras, no |j − i| + 1. Medir una vela contra sí misma es 0.
  const ia = indiceDeVela(velas, a.tiempo);
  const ib = indiceDeVela(velas, b.tiempo);
  const barras = ia >= 0 && ib >= 0 ? Math.abs(ib - ia) : 0;

  let volumen = 0;
  if (ia >= 0 && ib >= 0) {
    const desde = Math.min(ia, ib);
    const hasta = Math.max(ia, ib);
    for (let i = desde; i <= hasta; i++) volumen += velas[i].volume;
  }

  return {
    deltaPrecio,
    pct,
    barras,
    duracionMs: Math.abs(b.tiempo - a.tiempo) * 1000,
    ticks: Math.abs(deltaPrecio) / tick,
    tamanoTick: tick,
    volumen,
    alcista: deltaPrecio >= 0,
  };
}
