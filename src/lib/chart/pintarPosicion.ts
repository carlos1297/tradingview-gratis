import { hexToRgba } from "@/lib/indicators/volumeProfile";

/**
 * pintarPosicion.ts — Dibuja la operación abierta sobre el gráfico, al estilo
 * de la posición viva de TradingView.
 *
 * Vive fuera de ChartLigero y solo recibe un contexto 2D y coordenadas YA
 * resueltas a píxeles: no conoce la librería de gráficos, ni modelos, ni React.
 * Eso lo hace ejecutable fuera del navegador —se puede renderizar contra un
 * contexto simulado para revisar el resultado— y saca del componente la única
 * parte que es puro dibujo.
 *
 * Qué se ve, y por qué así:
 *
 *   ┌ SAC SHORT · 63,828.33 ┐ ┌ PnL +0.04 ┐
 *   ──────────────────────────────────────── entrada (sólida, azul)
 *   ░░░░░░░░ zona de riesgo (roja) ░░░░░░░░
 *   - - - - - - - - - - - - - - - - - - - - SL (punteada)
 *
 * · Las zonas sombreadas entre la entrada y cada barrera dan la relación
 *   riesgo/recompensa comparando dos alturas, sin leer ni calcular nada.
 * · El verde y el rojo son los del resto del visor; el azul de la entrada dice
 *   "hecho consumado": no es bueno ni malo, ya ocurrió.
 * · Los precios aparecen ADEMÁS en la escala de la derecha, publicados como
 *   priceLines nativas desde ChartLigero. Acá se repiten junto a su línea para
 *   poder leer la operación sin desviar la vista al eje.
 */

// ── Paleta ────────────────────────────────────────────────────────────
export const COLOR_GANANCIA = "#26a69a";
export const COLOR_PERDIDA = "#ef5350";
export const COLOR_ENTRADA = "#2962ff";

/** Opacidad de las zonas: visible sobre el fondo oscuro sin tapar las velas. */
const ALFA_ZONA = 0.12;

export interface DatosPosicion {
  lado: "long" | "short";
  /** Identidad que encabeza la etiqueta: "SAC", "PPO", "DEMO"… */
  etiqueta: string;
  precioEntrada: number;
  precioActual: number;
  stopLoss: number | null;
  takeProfit: number | null;
  /** Exposición en USD; sin ella el P/L se muestra solo en porcentaje. */
  nocional: number | null;
}

/** Coordenadas en píxeles, ya resueltas por quien tiene el gráfico. */
export interface GeometriaPosicion {
  /** x de la vela en que se abrió la operación. */
  xEntrada: number;
  /** Borde derecho del área de trazado. */
  xFin: number;
  yEntrada: number;
  ySl: number | null;
  yTp: number | null;
}

/** Precio con separador de miles y 2 decimales, como en la escala del gráfico. */
export function precioLegible(n: number) {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function trazarRectRedondeado(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Cápsula de dos tramos, como las etiquetas de posición de TradingView: uno
 * sólido con la identidad en blanco y otro translúcido con el dato. Se dibuja
 * de una pieza para que se lea como una etiqueta y no como dos pegadas.
 *
 * Devuelve el ancho total, para encadenar cápsulas en la misma fila.
 */
export function capsulaDoble(
  ctx: CanvasRenderingContext2D,
  fuerte: string,
  suave: string,
  x: number,
  yc: number,
  color: string,
) {
  const ALTO = 17;
  const PAD = 6;
  ctx.font = "600 10px Inter, system-ui, sans-serif";
  const wFuerte = ctx.measureText(fuerte).width + PAD * 2;
  ctx.font = "10px Inter, system-ui, sans-serif";
  const wSuave = suave ? ctx.measureText(suave).width + PAD * 2 : 0;
  const y = yc - ALTO / 2;

  ctx.fillStyle = hexToRgba(color, 0.22);
  trazarRectRedondeado(ctx, x, y, wFuerte + wSuave, ALTO, 3);
  ctx.fill();
  ctx.fillStyle = color;
  trazarRectRedondeado(ctx, x, y, wFuerte + (wSuave ? 3 : 0), ALTO, 3);
  ctx.fill();

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.font = "600 10px Inter, system-ui, sans-serif";
  ctx.fillText(fuerte, x + PAD, yc + 0.5);
  if (suave) {
    ctx.font = "10px Inter, system-ui, sans-serif";
    ctx.fillText(suave, x + wFuerte + PAD, yc + 0.5);
  }
  return wFuerte + wSuave;
}

/**
 * Pinta la operación completa. `ctx` ya viene recortado al área de trazado y
 * con la transformación de densidad de píxeles aplicada.
 */
export function pintarPosicion(
  ctx: CanvasRenderingContext2D,
  datos: DatosPosicion,
  geo: GeometriaPosicion,
) {
  const { xEntrada, xFin, yEntrada, ySl, yTp } = geo;
  const dir = datos.lado === "long" ? 1 : -1;
  const pnlPct = dir * (datos.precioActual / datos.precioEntrada - 1) * 100;
  // Con nocional real el P/L es dinero de verdad; en la demo se asume 0.5 BTC.
  const pnlUsd =
    datos.nocional !== null
      ? (pnlPct / 100) * datos.nocional
      : (datos.precioActual - datos.precioEntrada) * dir * 0.5;

  const colorPnl = pnlUsd >= 0 ? COLOR_GANANCIA : COLOR_PERDIDA;
  // El lado tiñe la identidad: verde comprando, rojo vendiendo. Es lo primero
  // que se busca en una posición y no debería hacer falta leer el texto.
  const colorLado = datos.lado === "long" ? COLOR_GANANCIA : COLOR_PERDIDA;

  // La operación se extiende desde su apertura hasta el BORDE derecho, no
  // hasta la última vela: sigue abierta, y cortarla ahí la haría parecer
  // cerrada. Es como TradingView dibuja una posición viva.
  const x0 = Math.min(xEntrada, xFin);

  // ── Zonas de objetivo y de riesgo ──────────────────────────────────
  // No se asume de qué lado cae cada barrera: se usa la coordenada real, así
  // un short (TP abajo, SL arriba) sale bien sin ninguna rama aparte.
  if (yTp !== null) {
    ctx.fillStyle = hexToRgba(COLOR_GANANCIA, ALFA_ZONA);
    ctx.fillRect(x0, Math.min(yEntrada, yTp), xFin - x0, Math.abs(yTp - yEntrada));
  }
  if (ySl !== null) {
    ctx.fillStyle = hexToRgba(COLOR_PERDIDA, ALFA_ZONA);
    ctx.fillRect(x0, Math.min(yEntrada, ySl), xFin - x0, Math.abs(ySl - yEntrada));
  }

  // ── Barreras ───────────────────────────────────────────────────────
  const barrera = (y: number | null, color: string) => {
    if (y === null) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(xFin, y);
    ctx.stroke();
    ctx.setLineDash([]);
  };
  barrera(yTp, COLOR_GANANCIA);
  barrera(ySl, COLOR_PERDIDA);

  // ── Línea de entrada ───────────────────────────────────────────────
  ctx.strokeStyle = COLOR_ENTRADA;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x0, yEntrada);
  ctx.lineTo(xFin, yEntrada);
  ctx.stroke();

  // Punto de apertura, sobre la vela exacta en que se abrió.
  ctx.fillStyle = COLOR_ENTRADA;
  ctx.beginPath();
  ctx.arc(xEntrada, yEntrada, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;
  ctx.stroke();

  // ── Etiquetas ──────────────────────────────────────────────────────
  //   [ SAC SHORT · 63,828.33 ] [ PnL +0.04 (+0.02%) ]
  const lado = datos.lado === "long" ? "LONG" : "SHORT";
  const yFila = yEntrada - 14;
  const anchoIdentidad = capsulaDoble(
    ctx,
    `${datos.etiqueta} ${lado}`,
    precioLegible(datos.precioEntrada),
    x0 + 6,
    yFila,
    colorLado,
  );
  const signo = pnlUsd >= 0 ? "+" : "−";
  capsulaDoble(
    ctx,
    "PnL",
    `${signo}${Math.abs(pnlUsd).toFixed(2)} (${signo}${Math.abs(pnlPct).toFixed(2)}%)`,
    x0 + 6 + anchoIdentidad + 4,
    yFila,
    colorPnl,
  );

  // TP y SL, cada uno pegado a su línea y SIEMPRE del lado contrario a la
  // entrada: así la cápsula queda fuera de la zona sombreada y no tapa las
  // velas que hay dentro, tanto en un long (TP arriba) como en un short
  // (TP abajo). Alinearlas "siempre arriba" las metía dentro de la zona en uno
  // de los dos casos.
  const etiquetaBarrera = (y: number | null, precio: number | null, texto: string, color: string) => {
    if (y === null || precio === null) return;
    const haciaAfuera = y < yEntrada ? -11 : 11;
    capsulaDoble(ctx, texto, precioLegible(precio), x0 + 6, y + haciaAfuera, color);
  };
  etiquetaBarrera(yTp, datos.takeProfit, "TP", COLOR_GANANCIA);
  etiquetaBarrera(ySl, datos.stopLoss, "SL", COLOR_PERDIDA);
}
