import type { Candle } from "@/lib/binance/types";

/**
 * Volume Profile Visible Range (VPVR), estilo TradingView.
 *
 * Se calcula solo sobre las velas del rango visible del chart. Como Binance
 * kline no trae volumen por precio dentro de la vela, se distribuye el volumen
 * de cada vela de forma uniforme entre los bins que cubre su rango [low, high]
 * (aproximación estándar sin datos tick a tick). El volumen se separa en
 * alcista/bajista según la dirección de la vela (close ≥ open) para pintar el
 * perfil en dos colores. A partir del histograma por precio se derivan:
 *   · POC (Point of Control): el bin de mayor volumen.
 *   · Value Area (VA): rango contiguo alrededor del POC que concentra el
 *     `vaPercent` del volumen total (70% por defecto) → VAH y VAL.
 *   · HVN/LVN: nodos de alto/bajo volumen (picos y valles locales del perfil).
 */

export interface VolumeProfile {
  rows: number;
  minPrice: number;
  binSize: number;
  buy: Float64Array; // volumen alcista por bin
  sell: Float64Array; // volumen bajista por bin
  total: Float64Array; // buy + sell por bin
  maxBin: number; // volumen máximo en un bin (normalización)
  totalVol: number; // volumen total del perfil
  pocIndex: number; // bin del Point of Control
  vaLowIndex: number; // bin inferior del Value Area (VAL)
  vaHighIndex: number; // bin superior del Value Area (VAH)
  hvn: number[]; // índices de High Volume Nodes (picos)
  lvn: number[]; // índices de Low Volume Nodes (valles)
}

export function computeVolumeProfile(
  candles: Candle[],
  desdeIdx: number,
  hastaIdx: number,
  rows: number,
  vaPercent: number,
): VolumeProfile | null {
  if (hastaIdx <= desdeIdx || rows < 2) return null;

  let minPrice = Infinity;
  let maxPrice = -Infinity;
  for (let i = desdeIdx; i <= hastaIdx; i++) {
    const c = candles[i];
    if (!c) continue;
    if (c.low < minPrice) minPrice = c.low;
    if (c.high > maxPrice) maxPrice = c.high;
  }
  if (!isFinite(minPrice) || !isFinite(maxPrice) || maxPrice <= minPrice) return null;

  const binSize = (maxPrice - minPrice) / rows;
  if (binSize <= 0) return null;
  const toBin = (p: number) =>
    Math.max(0, Math.min(rows - 1, Math.floor((p - minPrice) / binSize)));

  const buy = new Float64Array(rows);
  const sell = new Float64Array(rows);

  for (let i = desdeIdx; i <= hastaIdx; i++) {
    const c = candles[i];
    if (!c || c.volume <= 0) continue;
    const b0 = toBin(c.low);
    const b1 = toBin(c.high);
    const vPorBin = c.volume / (b1 - b0 + 1);
    const alcista = c.close >= c.open;
    for (let b = b0; b <= b1; b++) {
      if (alcista) buy[b] += vPorBin;
      else sell[b] += vPorBin;
    }
  }

  const total = new Float64Array(rows);
  let maxBin = 0;
  let pocIndex = 0;
  let totalVol = 0;
  for (let b = 0; b < rows; b++) {
    total[b] = buy[b] + sell[b];
    totalVol += total[b];
    if (total[b] > maxBin) {
      maxBin = total[b];
      pocIndex = b;
    }
  }
  if (maxBin <= 0) return null;

  // Value Area: expandir desde el POC sumando el vecino de mayor volumen hasta
  // cubrir vaPercent del total.
  const objetivo = totalVol * vaPercent;
  let acum = total[pocIndex];
  let lo = pocIndex;
  let hi = pocIndex;
  while (acum < objetivo && (lo > 0 || hi < rows - 1)) {
    const abajo = lo > 0 ? total[lo - 1] : -1;
    const arriba = hi < rows - 1 ? total[hi + 1] : -1;
    if (arriba >= abajo) {
      hi++;
      acum += total[hi];
    } else {
      lo--;
      acum += total[lo];
    }
  }

  // HVN/LVN: picos y valles locales del perfil total
  const hvn: number[] = [];
  const lvn: number[] = [];
  for (let b = 1; b < rows - 1; b++) {
    const cur = total[b];
    const izq = total[b - 1];
    const der = total[b + 1];
    if (cur > izq && cur > der && cur > maxBin * 0.4) hvn.push(b);
    if (cur < izq && cur < der && cur > 0 && cur < maxBin * 0.15) lvn.push(b);
  }

  return {
    rows,
    minPrice,
    binSize,
    buy,
    sell,
    total,
    maxBin,
    totalVol,
    pocIndex,
    vaLowIndex: lo,
    vaHighIndex: hi,
    hvn,
    lvn,
  };
}

/** "#rrggbb" (o "#rgb") + alpha → "rgba(r,g,b,a)". */
export function hexToRgba(hex: string, alpha: number): string {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${r},${g},${b},${a.toFixed(3)})`;
}
