import type { Candle } from "@/lib/binance/types";
import { ema, rsi, macd } from "@/lib/indicators";

/**
 * Registro central de indicadores del chart, estilo TradingView.
 *
 * Para agregar un indicador nuevo alcanza con sumar una entrada a
 * `INDICADORES`: el menú «Indicadores» del header y el chart lo levantan
 * solos. Cada indicador declara sus series (una EMA es 1 línea; el MACD son
 * 2 líneas + 1 histograma) y si se superpone al precio o va en su propio
 * panel debajo del gráfico.
 */

export interface PuntoSerie {
  time: number; // unix seconds
  value: number;
  color?: string; // por-barra (histogramas)
}

export interface SerieIndicador {
  tipo: "linea" | "histograma";
  color: string;
  /** Calcula los puntos de la serie a partir de las velas */
  calcular: (velas: Candle[]) => PuntoSerie[];
}

export interface DefinicionIndicador {
  id: string;
  nombre: string;
  descripcion: string;
  /** true → panel propio debajo del precio; false → superpuesto al precio */
  panelPropio: boolean;
  series: SerieIndicador[];
}

const VERDE = "#26a69a";

function serieEMA(periodo: number, color: string): SerieIndicador {
  return { tipo: "linea", color, calcular: (velas) => ema(velas, periodo) };
}

export const INDICADORES: DefinicionIndicador[] = [
  {
    id: "ema20",
    nombre: "EMA 20",
    descripcion: "Media móvil exponencial · 20 períodos",
    panelPropio: false,
    series: [serieEMA(20, "#ffb74d")],
  },
  {
    id: "ema50",
    nombre: "EMA 50",
    descripcion: "Media móvil exponencial · 50 períodos",
    panelPropio: false,
    series: [serieEMA(50, "#2962ff")],
  },
  {
    id: "ema200",
    nombre: "EMA 200",
    descripcion: "Media móvil exponencial · 200 períodos",
    panelPropio: false,
    series: [serieEMA(200, "#ab47bc")],
  },
  {
    id: "volumen",
    nombre: "Volumen",
    descripcion: "Volumen por vela, coloreado según la dirección",
    panelPropio: true,
    series: [
      {
        tipo: "histograma",
        color: "#787b86",
        calcular: (velas) =>
          velas.map((v) => ({
            time: v.time,
            value: v.volume,
            color: v.close >= v.open ? "rgba(38,166,154,0.55)" : "rgba(239,83,80,0.55)",
          })),
      },
    ],
  },
  {
    id: "rsi",
    nombre: "RSI 14",
    descripcion: "Índice de fuerza relativa (Wilder) · 14 períodos",
    panelPropio: true,
    series: [{ tipo: "linea", color: "#ab47bc", calcular: (velas) => rsi(velas, 14) }],
  },
  {
    id: "macd",
    nombre: "MACD 12 26 9",
    descripcion: "Convergencia/divergencia de medias móviles",
    panelPropio: true,
    series: [
      {
        tipo: "histograma",
        color: VERDE,
        calcular: (velas) =>
          macd(velas).map((p) => ({
            time: p.time,
            value: p.histogram,
            color: p.histogram >= 0 ? "rgba(38,166,154,0.6)" : "rgba(239,83,80,0.6)",
          })),
      },
      {
        tipo: "linea",
        color: "#2962ff",
        calcular: (velas) => macd(velas).map((p) => ({ time: p.time, value: p.macd })),
      },
      {
        tipo: "linea",
        color: "#ff6d00",
        calcular: (velas) => macd(velas).map((p) => ({ time: p.time, value: p.signal })),
      },
    ],
  },
];

export function buscarIndicador(id: string): DefinicionIndicador | undefined {
  return INDICADORES.find((d) => d.id === id);
}
