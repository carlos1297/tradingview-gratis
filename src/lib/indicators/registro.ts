import type { Candle } from "@/lib/binance/types";
import { ema, rsi, macd } from "@/lib/indicators";

/**
 * registro.ts — Catálogo de indicadores del chart, estilo TradingView.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  PARA AGREGAR UN INDICADOR alcance con sumar una entrada a `INDICADORES`.
 *
 *  No hay que tocar el menú (se arma solo), ni el panel de ajustes (es
 *  GENÉRICO: se construye recorriendo `parametros`), ni el chart (crea las
 *  series que declare `series()`).
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Dos decisiones de forma que conviene entender:
 *
 * **Los parámetros son DATOS, no closures.** Antes el período y el color
 * estaban cocinados —`serieEMA(20, "#ffb74d")`— y cambiarlos exigía editar
 * código. Ahora cada definición declara sus `parametros` y recibe los valores;
 * de ahí salen la configuración editable y las tres EMAs colapsadas en una que
 * se agrega las veces que haga falta.
 *
 * **`calcular` es por INDICADOR, no por serie.** Antes cada serie traía su
 * propio `calcular`, y como el MACD tiene tres, `macd()` corría tres veces por
 * recálculo: medido sobre 1000 velas eran 0.74 de los 0.87 ms de TODOS los
 * indicadores juntos — el 85% del costo, tirado. Devolviendo un array por serie
 * de una sola pasada, el problema no puede volver a aparecer.
 */

export interface PuntoSerie {
  time: number; // unix seconds
  value: number;
  color?: string; // por-barra (histogramas)
}

/** Valores de los parámetros de UNA instancia de indicador. */
export type ValoresParametros = Record<string, number | string>;

/** Un parámetro configurable. De acá se construye el panel de ajustes. */
export interface ParametroIndicador {
  clave: string;
  etiqueta: string;
  tipo: "numero" | "color";
  porDefecto: number | string;
  /** Solo para `tipo: "numero"`. */
  min?: number;
  max?: number;
}

/** Tipo y color de una serie, ya resueltos con los parámetros. */
export interface SerieMeta {
  tipo: "linea" | "histograma";
  color: string;
}

/**
 * Una línea horizontal de referencia dentro del panel del indicador: las zonas
 * de sobrecompra/sobreventa del RSI, el cero de un oscilador, etc.
 */
export interface LineaReferencia {
  valor: number;
  color: string;
  estilo?: "solida" | "guiones" | "punteada";
  /** Rótulo sobre la línea, dentro del panel. */
  etiqueta?: string;
}

export interface DefinicionIndicador {
  /** Id de la DEFINICIÓN: "ema", "rsi"… (no de una instancia concreta). */
  id: string;
  /** Nombre genérico para el catálogo: "EMA". */
  nombre: string;
  descripcion: string;
  /** true → panel propio debajo del precio; false → superpuesto al precio. */
  panelPropio: boolean;
  /** Se puede agregar más de una vez, cada una con sus ajustes. */
  multiple: boolean;
  parametros: ParametroIndicador[];
  /** Etiqueta de una instancia concreta: "EMA 34". */
  etiqueta: (p: ValoresParametros) => string;
  /** Las series que dibuja, con su color resuelto. */
  series: (p: ValoresParametros) => SerieMeta[];
  /**
   * Calcula TODAS las series de una sola pasada: una entrada del array por
   * cada serie que devuelve `series()`, en el mismo orden.
   */
  calcular: (velas: Candle[], p: ValoresParametros) => PuntoSerie[][];
  /**
   * Líneas horizontales de referencia («zonas»). Opcional: un indicador que no
   * las declara no dibuja ninguna.
   *
   * El chart las publica como priceLines y —esto es lo importante— estira la
   * escala del panel para que SIEMPRE se vean. Sin eso, un RSI que se mueve
   * entre 40 y 60 dejaría sus zonas de 70 y 30 fuera de la vista, que es
   * justamente cuando sirven.
   */
  referencias?: (p: ValoresParametros) => LineaReferencia[];
}

// ── Lectura de parámetros, tolerante ──────────────────────────────────
// Los valores vienen del store, o sea de localStorage: pueden faltar o venir
// con el tipo equivocado. Se lee con un default en vez de propagar un NaN.

function num(p: ValoresParametros, clave: string, porDefecto: number): number {
  const v = p[clave];
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : porDefecto;
}

/**
 * Como `num`, pero acotado a un rango.
 *
 * `num` exige `v > 0`, que es lo correcto para un período pero no para un
 * nivel: una zona de sobreventa en 0 es legítima. Acá el rango se respeta tal
 * como lo declara el parámetro, y un valor fuera de él se recorta en vez de
 * descartarse — quien guardó 999 quería el máximo, no el default.
 */
function numEn(
  p: ValoresParametros,
  clave: string,
  porDefecto: number,
  min: number,
  max: number,
): number {
  const v = p[clave];
  if (typeof v !== "number" || !Number.isFinite(v)) return porDefecto;
  return Math.min(max, Math.max(min, Math.round(v)));
}

function col(p: ValoresParametros, clave: string, porDefecto: string): string {
  const v = p[clave];
  return typeof v === "string" && v.trim() ? v : porDefecto;
}

const VERDE = "#26a69a";
const ROJO = "#ef5350";

export const INDICADORES: DefinicionIndicador[] = [
  {
    id: "ema",
    nombre: "EMA",
    descripcion: "Media móvil exponencial. Se puede agregar varias con distinto período.",
    panelPropio: false,
    multiple: true,
    parametros: [
      { clave: "periodo", etiqueta: "Período", tipo: "numero", porDefecto: 20, min: 1, max: 500 },
      { clave: "color", etiqueta: "Color", tipo: "color", porDefecto: "#ffb74d" },
    ],
    etiqueta: (p) => `EMA ${num(p, "periodo", 20)}`,
    series: (p) => [{ tipo: "linea", color: col(p, "color", "#ffb74d") }],
    calcular: (velas, p) => [ema(velas, num(p, "periodo", 20))],
  },

  {
    id: "rsi",
    nombre: "RSI",
    descripcion:
      "Índice de fuerza relativa (Wilder) con sus zonas de sobrecompra y sobreventa, en su propio panel.",
    panelPropio: true,
    multiple: true,
    parametros: [
      { clave: "periodo", etiqueta: "Período", tipo: "numero", porDefecto: 14, min: 2, max: 200 },
      // Los rangos NO se solapan a propósito: sobrecompra vive en [51,100] y
      // sobreventa en [0,49], así que las dos zonas no pueden cruzarse por
      // mucho que se editen, y no hace falta validación extra en ningún lado.
      { clave: "sobrecompra", etiqueta: "Sobrecompra", tipo: "numero", porDefecto: 70, min: 51, max: 100 },
      { clave: "sobreventa", etiqueta: "Sobreventa", tipo: "numero", porDefecto: 30, min: 0, max: 49 },
      { clave: "color", etiqueta: "Línea RSI", tipo: "color", porDefecto: "#ab47bc" },
      { clave: "colorZonas", etiqueta: "Zonas", tipo: "color", porDefecto: "#787b86" },
    ],
    etiqueta: (p) => `RSI ${num(p, "periodo", 14)}`,
    series: (p) => [{ tipo: "linea", color: col(p, "color", "#ab47bc") }],
    calcular: (velas, p) => [rsi(velas, num(p, "periodo", 14))],
    referencias: (p) => {
      const color = col(p, "colorZonas", "#787b86");
      const arriba = numEn(p, "sobrecompra", 70, 51, 100);
      const abajo = numEn(p, "sobreventa", 30, 0, 49);
      return [
        { valor: arriba, color, estilo: "guiones", etiqueta: String(arriba) },
        { valor: abajo, color, estilo: "guiones", etiqueta: String(abajo) },
      ];
    },
  },

  {
    id: "macd",
    nombre: "MACD",
    descripcion: "Convergencia/divergencia de medias móviles: histograma + señal.",
    panelPropio: true,
    multiple: false,
    parametros: [
      { clave: "rapida", etiqueta: "EMA rápida", tipo: "numero", porDefecto: 12, min: 1, max: 200 },
      { clave: "lenta", etiqueta: "EMA lenta", tipo: "numero", porDefecto: 26, min: 2, max: 400 },
      { clave: "senal", etiqueta: "Señal", tipo: "numero", porDefecto: 9, min: 1, max: 100 },
      { clave: "colorMacd", etiqueta: "Línea MACD", tipo: "color", porDefecto: "#2962ff" },
      { clave: "colorSenal", etiqueta: "Línea señal", tipo: "color", porDefecto: "#ff6d00" },
      { clave: "colorHistograma", etiqueta: "Histograma", tipo: "color", porDefecto: VERDE },
    ],
    etiqueta: (p) =>
      `MACD ${num(p, "rapida", 12)} ${num(p, "lenta", 26)} ${num(p, "senal", 9)}`,
    series: (p) => [
      { tipo: "histograma", color: col(p, "colorHistograma", VERDE) },
      { tipo: "linea", color: col(p, "colorMacd", "#2962ff") },
      { tipo: "linea", color: col(p, "colorSenal", "#ff6d00") },
    ],
    // UNA sola llamada a macd(), repartida en las tres series. Antes cada serie
    // llamaba por su cuenta y el mismo cálculo se hacía tres veces.
    calcular: (velas, p) => {
      const m = macd(velas, num(p, "rapida", 12), num(p, "lenta", 26), num(p, "senal", 9));
      return [
        m.map((x) => ({
          time: x.time,
          value: x.histogram,
          color: x.histogram >= 0 ? "rgba(38,166,154,0.6)" : "rgba(239,83,80,0.6)",
        })),
        m.map((x) => ({ time: x.time, value: x.macd })),
        m.map((x) => ({ time: x.time, value: x.signal })),
      ];
    },
  },

  {
    id: "volumen",
    nombre: "Volumen",
    descripcion: "Volumen por vela, coloreado según la dirección.",
    panelPropio: true,
    multiple: false,
    parametros: [
      { clave: "colorAlcista", etiqueta: "Alcista", tipo: "color", porDefecto: VERDE },
      { clave: "colorBajista", etiqueta: "Bajista", tipo: "color", porDefecto: ROJO },
    ],
    etiqueta: () => "Volumen",
    series: () => [{ tipo: "histograma", color: "#787b86" }],
    calcular: (velas, p) => [
      velas.map((v) => ({
        time: v.time,
        value: v.volume,
        color: v.close >= v.open ? col(p, "colorAlcista", VERDE) : col(p, "colorBajista", ROJO),
      })),
    ],
  },
];

export function buscarIndicador(id: string): DefinicionIndicador | undefined {
  return INDICADORES.find((d) => d.id === id);
}

/**
 * Valores iniciales de una definición, tomados de sus `parametros`.
 *
 * Vive acá para que ni el store ni la interfaz repitan los defaults: el registro
 * es la única fuente.
 */
export function paramsPorDefecto(def: DefinicionIndicador): ValoresParametros {
  const salida: ValoresParametros = {};
  for (const p of def.parametros) salida[p.clave] = p.porDefecto;
  return salida;
}
