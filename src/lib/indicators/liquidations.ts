import type { Candle } from "@/lib/binance/types";

/**
 * Liquidation Heatmap (Coinglass-style estimate from public data).
 *
 * For every candle we assume leveraged positions open near its close; their
 * liquidation prices sit at close*(1 ∓ (1/L − maint)). Each level's intensity
 * is the candle volume weighted by a typical leverage distribution, and the
 * level is consumed (removed) once price trades through it. The grid stores,
 * per candle, the intensity of every still-active level → bright bands are
 * price magnets where clustered liquidations wait.
 */

export interface LiquidationHeatmap {
  grid: Float32Array; // n*bins, row-major: grid[i*bins + b]
  bins: number;
  minPrice: number;
  binSize: number;
  maxIntensity: number; // p99 of non-zero cells, for color normalization
}

// Leverage tiers and how much of the volume is assumed at each — higher
// leverage dominates liquidation clusters on crypto perps.
const LEVERAGES: Array<[number, number]> = [
  [100, 0.3],
  [50, 0.25],
  [25, 0.2],
  [10, 0.15],
  [5, 0.1],
];
const MARGEN_MANTENIMIENTO = 0.005;

/** Niveles de apalancamiento disponibles para el filtro (mayor → menor). */
export const NIVELES_APALANCAMIENTO: number[] = LEVERAGES.map(([lev]) => lev);

/** Filtro de órdenes aplicado al CÁLCULO del heatmap (requiere recálculo). */
export interface FiltroHeatmap {
  /** Apalancamientos incluidos (subconjunto de NIVELES_APALANCAMIENTO). */
  apalancamientos: number[];
  /** Liquidaciones a mostrar: ambas, solo long (debajo) o solo short (arriba). */
  lado: "ambos" | "long" | "short";
}

/** Ajustes aplicados solo al DIBUJO (no requieren recálculo). */
export interface RenderHeatmap {
  /** Intensidad normalizada mínima (0..1) para pintar una celda: filtra ruido. */
  umbral: number;
  /** Opacidad global del heatmap (0..1). */
  opacidad: number;
}

export function computeLiquidationHeatmap(
  candles: Candle[],
  filtro?: FiltroHeatmap,
  bins = 240,
): LiquidationHeatmap | null {
  const n = candles.length;
  if (n < 2) return null;

  let low = Infinity;
  let high = -Infinity;
  for (const c of candles) {
    if (c.low < low) low = c.low;
    if (c.high > high) high = c.high;
  }
  // widen so the 5x levels (±~19.5%) of extreme closes stay inside the grid
  const minPrice = low * (1 - 0.2);
  const maxPrice = high * (1 + 0.2);
  const binSize = (maxPrice - minPrice) / bins;
  if (binSize <= 0) return null;

  const toBin = (p: number) =>
    Math.max(0, Math.min(bins - 1, Math.floor((p - minPrice) / binSize)));

  // filtro de órdenes: qué apalancamientos y qué lado (long/short) se incluyen
  const tiers = filtro
    ? LEVERAGES.filter(([lev]) => filtro.apalancamientos.includes(lev))
    : LEVERAGES;
  const conLong = !filtro || filtro.lado !== "short";
  const conShort = !filtro || filtro.lado !== "long";

  const active = new Float32Array(bins);
  const grid = new Float32Array(n * bins);

  for (let i = 0; i < n; i++) {
    const c = candles[i];
    // levels traded through by this candle get liquidated (consumed)
    const b0 = toBin(c.low);
    const b1 = toBin(c.high);
    for (let b = b0; b <= b1; b++) active[b] = 0;
    // new positions assumed opened at this candle's close
    for (const [lev, peso] of tiers) {
      const distancia = 1 / lev - MARGEN_MANTENIMIENTO;
      if (distancia <= 0) continue;
      const intensidad = c.volume * peso;
      if (conLong) active[toBin(c.close * (1 - distancia))] += intensidad; // longs below
      if (conShort) active[toBin(c.close * (1 + distancia))] += intensidad; // shorts above
    }
    grid.set(active, i * bins);
  }

  // robust normalization: 99th percentile of a sample of non-zero cells
  const muestra: number[] = [];
  for (let i = 0; i < grid.length; i += 29) {
    if (grid[i] > 0) muestra.push(grid[i]);
  }
  muestra.sort((a, b) => a - b);
  const maxIntensity =
    muestra.length > 0 ? muestra[Math.floor(muestra.length * 0.99)] : 1;

  return { grid, bins, minPrice, binSize, maxIntensity: maxIntensity || 1 };
}

/**
 * Perfil de liquidez: cuánta liquidación pendiente hay en cada precio, en UN
 * instante. Es el heatmap visto de perfil, para dibujarlo como barras
 * horizontales sobre el eje de precios.
 */
export interface PerfilLiquidez {
  /** Intensidad por bin de precio (misma escala y bins que la rejilla). */
  valores: Float32Array;
  /** Mayor valor de la columna: normaliza el largo de las barras. */
  max: number;
  /** Columna (vela) de la que se leyó. */
  columna: number;
}

/**
 * Perfil de UNA columna de la rejilla.
 *
 * Lee una sola columna a propósito, y no la suma de las visibles: `grid[i]` ya
 * contiene los niveles que siguen VIVOS en la vela `i` —el cálculo pone a cero
 * los que el precio atravesó—, así que sumar contaría cincuenta veces un nivel
 * que sobrevivió cincuenta velas. El perfil hablaría entonces de cuánto duraron
 * los niveles, no de cuánta liquidez queda pendiente, que es lo que se quiere
 * leer.
 *
 * Devuelve `null` si la columna está fuera de rango o si no hay nada que
 * dibujar (columna entera en cero): así quien dibuja no tiene que defenderse de
 * una división por cero.
 */
export function perfilLiquidez(
  heatmap: LiquidationHeatmap,
  columna: number,
): PerfilLiquidez | null {
  const { grid, bins } = heatmap;
  if (bins <= 0) return null;
  const columnas = Math.floor(grid.length / bins);
  const col = Math.floor(columna);
  if (!Number.isFinite(col) || col < 0 || col >= columnas) return null;

  // Copia (240 flotantes): `subarray` compartiría memoria con la rejilla y
  // cualquier recálculo posterior mutaría el perfil que se está dibujando.
  const valores = grid.slice(col * bins, (col + 1) * bins);
  let max = 0;
  for (let b = 0; b < valores.length; b++) {
    if (valores[b] > max) max = valores[b];
  }
  if (max <= 0) return null;
  return { valores, max, columna: col };
}

// Dark blue → cyan → green → yellow ramp (Coinglass-like), alpha grows with
// intensity so weak levels barely tint the chart.
const STOPS: Array<[number, [number, number, number]]> = [
  [0.0, [20, 40, 110]],
  [0.35, [0, 110, 220]],
  [0.6, [0, 210, 255]],
  [0.8, [120, 230, 120]],
  [1.0, [255, 240, 70]],
];

export function heatColor(v01: number): string {
  const [r, g, b, a] = heatRGBA(v01);
  return `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`;
}

/** Same ramp as heatColor but as RGBA bytes, for ImageData rendering. */
export function heatRGBA(v01: number): [number, number, number, number] {
  const v = Math.max(0, Math.min(1, v01));
  let i = 1;
  while (i < STOPS.length - 1 && STOPS[i][0] < v) i++;
  const [t0, c0] = STOPS[i - 1];
  const [t1, c1] = STOPS[i];
  const f = t1 === t0 ? 0 : (v - t0) / (t1 - t0);
  const r = Math.round(c0[0] + (c1[0] - c0[0]) * f);
  const g = Math.round(c0[1] + (c1[1] - c0[1]) * f);
  const b = Math.round(c0[2] + (c1[2] - c0[2]) * f);
  const alpha = Math.round(255 * (0.14 + 0.5 * v));
  return [r, g, b, alpha];
}

/**
 * Renders columns [desdeIdx, hastaIdx] of the grid into an offscreen canvas
 * (1 px per candle × 1 px per bin), ready to be stretched over the chart's
 * plot area with drawImage.
 */
export function crearImagenHeatmap(
  heatmap: LiquidationHeatmap,
  desdeIdx: number,
  hastaIdx: number,
  render?: RenderHeatmap,
): HTMLCanvasElement | null {
  const { grid, bins, maxIntensity } = heatmap;
  const umbral = render ? Math.max(0.02, render.umbral) : 0.02;
  const opacidad = render ? Math.max(0, Math.min(1, render.opacidad)) : 1;
  const nCols = hastaIdx - desdeIdx + 1;
  if (nCols <= 0) return null;
  const offscreen = document.createElement("canvas");
  offscreen.width = nCols;
  offscreen.height = bins;
  const offCtx = offscreen.getContext("2d");
  if (!offCtx) return null;
  const imagen = offCtx.createImageData(nCols, bins);
  const px = imagen.data;
  for (let col = 0; col < nCols; col++) {
    const fila = (desdeIdx + col) * bins;
    for (let b = 0; b < bins; b++) {
      const v = grid[fila + b];
      if (v <= 0) continue;
      const v01 = Math.min(1, v / maxIntensity);
      if (v01 < umbral) continue; // filtro de intensidad mínima (órdenes débiles)
      const [r, g, bl, a] = heatRGBA(v01);
      const idx = ((bins - 1 - b) * nCols + col) * 4;
      px[idx] = r;
      px[idx + 1] = g;
      px[idx + 2] = bl;
      px[idx + 3] = Math.round(a * opacidad);
    }
  }
  offCtx.putImageData(imagen, 0, 0);
  return offscreen;
}
