import { esApertura, type ModelSignal } from "@/lib/modelos/senales";

/**
 * Reconstructs the AI's closed trades and profitability stats from the
 * senales.json events — powers the Strategy Tester panel.
 *
 * Módulo PURO: no toca React ni ningún store. Lo consumen el Probador de
 * estrategias y `lib/modelos/derivar.ts`, de modo que el PnL realizado del
 * panel y el de la lista de operaciones no pueden diferir nunca.
 */

export interface OperacionIA {
  indice: number;
  lado: "long" | "short";
  tiempoEntradaMs: number;
  precioEntrada: number;
  tiempoSalidaMs: number;
  precioSalida: number;
  motivo: string;
  pnlUsd: number;
  pnlPct: number;
  acumuladoUsd: number;
}

export interface EstadisticasIA {
  nOperaciones: number;
  ganadoras: number;
  perdedoras: number;
  tasaAcierto: number; // 0-100
  beneficioNetoUsd: number;
  gananciaBrutaUsd: number;
  perdidaBrutaUsd: number; // valor absoluto
  factorBeneficio: number | null; // null si no hubo pérdidas
  promedioUsd: number;
  mejorUsd: number;
  peorUsd: number;
  maxDrawdownUsd: number;
}

export function buildOperaciones(senales: ModelSignal[]): OperacionIA[] {
  const operaciones: OperacionIA[] = [];
  let abierta: { lado: "long" | "short"; tiempoMs: number; precio: number } | null =
    null;
  let acumulado = 0;

  for (const s of senales) {
    if (esApertura(s)) {
      abierta = {
        lado: s.evento === "abrir_long" ? "long" : "short",
        tiempoMs: s.tiempoMs,
        precio: s.precio,
      };
      continue;
    }
    // cierre: si no vimos la apertura (no debería pasar), lo saltamos
    if (!abierta) continue;
    const pnlUsd = s.pnlUsd ?? 0;
    acumulado += pnlUsd;
    const direccion = abierta.lado === "long" ? 1 : -1;
    operaciones.push({
      indice: operaciones.length + 1,
      lado: abierta.lado,
      tiempoEntradaMs: abierta.tiempoMs,
      precioEntrada: abierta.precio,
      tiempoSalidaMs: s.tiempoMs,
      precioSalida: s.precio,
      motivo: s.motivo ?? "senal",
      pnlUsd,
      pnlPct:
        abierta.precio > 0
          ? direccion * (s.precio / abierta.precio - 1) * 100
          : 0,
      acumuladoUsd: acumulado,
    });
    abierta = null;
  }
  return operaciones;
}

export function computeEstadisticas(operaciones: OperacionIA[]): EstadisticasIA {
  let ganadoras = 0;
  let gananciaBruta = 0;
  let perdidaBruta = 0;
  let mejor = 0;
  let peor = 0;
  let pico = 0;
  let maxDrawdown = 0;
  let acumulado = 0;

  for (const op of operaciones) {
    if (op.pnlUsd > 0) {
      ganadoras++;
      gananciaBruta += op.pnlUsd;
    } else {
      perdidaBruta += -op.pnlUsd;
    }
    mejor = Math.max(mejor, op.pnlUsd);
    peor = Math.min(peor, op.pnlUsd);
    acumulado += op.pnlUsd;
    pico = Math.max(pico, acumulado);
    maxDrawdown = Math.max(maxDrawdown, pico - acumulado);
  }

  const n = operaciones.length;
  return {
    nOperaciones: n,
    ganadoras,
    perdedoras: n - ganadoras,
    tasaAcierto: n > 0 ? (ganadoras / n) * 100 : 0,
    beneficioNetoUsd: acumulado,
    gananciaBrutaUsd: gananciaBruta,
    perdidaBrutaUsd: perdidaBruta,
    factorBeneficio: perdidaBruta > 0 ? gananciaBruta / perdidaBruta : null,
    promedioUsd: n > 0 ? acumulado / n : 0,
    mejorUsd: mejor,
    peorUsd: peor,
    maxDrawdownUsd: maxDrawdown,
  };
}

/** Métricas de un grupo de operaciones (para las columnas Todas/Largas/Cortas). */
export interface MetricasGrupo {
  netProfit: number;
  grossProfit: number;
  grossLoss: number; // valor absoluto
  maxRunup: number;
  maxDrawdown: number;
  profitFactor: number | null;
  totalTrades: number;
  winning: number;
  losing: number;
  percentProfitable: number; // 0-100
  avgTrade: number;
  avgWin: number;
  avgLoss: number; // valor absoluto
  ratioWinLoss: number | null;
  largestWin: number;
  largestLoss: number; // valor absoluto
  avgDuracionMs: number;
}

export function computeMetricasGrupo(ops: OperacionIA[]): MetricasGrupo {
  let winning = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let largestWin = 0;
  let largestLoss = 0;
  let sumWin = 0;
  let sumLoss = 0;
  let sumDur = 0;
  let cum = 0;
  let peak = 0;
  let trough = 0;
  let maxDD = 0;
  let maxRU = 0;

  for (const op of ops) {
    if (op.pnlUsd > 0) {
      winning++;
      grossProfit += op.pnlUsd;
      sumWin += op.pnlUsd;
      largestWin = Math.max(largestWin, op.pnlUsd);
    } else {
      grossLoss += -op.pnlUsd;
      sumLoss += -op.pnlUsd;
      largestLoss = Math.max(largestLoss, -op.pnlUsd);
    }
    cum += op.pnlUsd;
    peak = Math.max(peak, cum);
    trough = Math.min(trough, cum);
    maxDD = Math.max(maxDD, peak - cum);
    maxRU = Math.max(maxRU, cum - trough);
    sumDur += Math.max(0, op.tiempoSalidaMs - op.tiempoEntradaMs);
  }

  const n = ops.length;
  const losing = n - winning;
  const avgWin = winning > 0 ? sumWin / winning : 0;
  const avgLoss = losing > 0 ? sumLoss / losing : 0;
  return {
    netProfit: cum,
    grossProfit,
    grossLoss,
    maxRunup: maxRU,
    maxDrawdown: maxDD,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
    totalTrades: n,
    winning,
    losing,
    percentProfitable: n > 0 ? (winning / n) * 100 : 0,
    avgTrade: n > 0 ? cum / n : 0,
    avgWin,
    avgLoss,
    ratioWinLoss: avgLoss > 0 ? avgWin / avgLoss : null,
    largestWin,
    largestLoss,
    avgDuracionMs: n > 0 ? sumDur / n : 0,
  };
}

/** Métricas separadas por lado, como el resumen de rendimiento de TradingView. */
export function computeResumenTV(ops: OperacionIA[]): {
  todas: MetricasGrupo;
  largas: MetricasGrupo;
  cortas: MetricasGrupo;
} {
  return {
    todas: computeMetricasGrupo(ops),
    largas: computeMetricasGrupo(ops.filter((o) => o.lado === "long")),
    cortas: computeMetricasGrupo(ops.filter((o) => o.lado === "short")),
  };
}

/** Formatea una duración (ms) de forma compacta: "2d 3h" / "5h 12m" / "40m". */
export function formatDuracion(ms: number): string {
  if (!isFinite(ms) || ms <= 0) return "—";
  const min = Math.round(ms / 60000);
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/**
 * Operaciones sintéticas deterministas para previsualizar el panel sin cargar
 * un senales.json (botón "Ver demostración"). No son datos reales.
 */
export function generarOperacionesDemo(n = 46): OperacionIA[] {
  let seed = 20240102;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const ops: OperacionIA[] = [];
  let precio = 61250;
  let t = Date.UTC(2024, 0, 2, 9, 0);
  let acum = 0;
  for (let i = 0; i < n; i++) {
    const lado: "long" | "short" = rnd() > 0.45 ? "long" : "short";
    const precioEntrada = precio;
    const durH = 1 + Math.floor(rnd() * 22);
    const tEntrada = t;
    const tSalida = t + durH * 3_600_000;
    const mov = (rnd() - 0.42) * 0.022; // leve sesgo ganador
    const precioSalida = precioEntrada * (1 + mov);
    const dir = lado === "long" ? 1 : -1;
    const pnlPct = dir * (precioSalida / precioEntrada - 1) * 100;
    const pnlUsd = (pnlPct / 100) * 1000; // nocional 1000 USD
    acum += pnlUsd;
    const r = rnd();
    ops.push({
      indice: i + 1,
      lado,
      tiempoEntradaMs: tEntrada,
      precioEntrada,
      tiempoSalidaMs: tSalida,
      precioSalida,
      motivo: pnlUsd >= 0 ? (r > 0.5 ? "take_profit" : "senal") : r > 0.5 ? "stop_loss" : "senal",
      pnlUsd,
      pnlPct,
      acumuladoUsd: acum,
    });
    precio = precioSalida;
    t = tSalida + (1 + Math.floor(rnd() * 8)) * 3_600_000;
  }
  return ops;
}

const ETIQUETA_MOTIVO: Record<string, string> = {
  senal: "Señal",
  stop_loss: "Stop Loss",
  take_profit: "Take Profit",
  liquidacion: "Liquidación",
  fin_episodio: "Fin de datos",
};

export function etiquetaMotivo(motivo: string): string {
  return ETIQUETA_MOTIVO[motivo] ?? motivo;
}
