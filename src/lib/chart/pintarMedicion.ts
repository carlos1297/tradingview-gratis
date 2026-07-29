import { hexToRgba } from "@/lib/indicators/volumeProfile";
import { formatDuracion } from "@/lib/trades";
import { formatPrecioEstable, formatVolume } from "@/lib/format";
import type { Medicion } from "@/lib/herramientas/medicion";
import { COLOR_GANANCIA, COLOR_PERDIDA } from "./pintarPosicion";

/**
 * pintarMedicion.ts — Dibuja el rango medido, al estilo de la herramienta
 * «Price Range» de TradingView.
 *
 * Hermano de `pintarPosicion.ts`: recibe un contexto 2D y coordenadas YA
 * resueltas a píxeles, así que no conoce la librería de gráficos, ni React, ni
 * el store. Se puede renderizar contra un contexto simulado para revisarlo.
 *
 *        ┌──────────────────────────┐
 *        │  +1,204.50 (+1.89%)      │   etiqueta centrada, del lado
 *        │  12 barras · 1h 0m       │   contrario al movimiento
 *        │  120,450 ticks · Vol 3.4K│
 *        └──────────────────────────┘
 *   A ●──────────────╂──────────────┐  ← A: línea de referencia punteada
 *                    ▼              │
 *   ░░░░░░░░░░ zona teñida ░░░░░░░░░┘  ← verde si sube, rojo si baja
 *                                   B
 */

/** Opacidad de la zona: se ve sobre el fondo oscuro sin tapar las velas. */
const ALFA_ZONA = 0.16;
const ALTO_LINEA = 15;
const PAD = 7;

/** Los tres renglones de la etiqueta, ya formateados. */
function renglones(m: Medicion): string[] {
  const signo = m.deltaPrecio >= 0 ? "+" : "−";
  // `formatPrecioEstable`, no `formatPrice`: mientras colocás el segundo punto
  // este número se recalcula con cada movimiento del cursor, y `formatPrice`
  // descarta los decimales que no hacen falta ("1,200" y después "1,200.35").
  // Con los decimales fijos la etiqueta no cambia de ancho a cada paso.
  const precio = `${signo}${formatPrecioEstable(Math.abs(m.deltaPrecio))} (${signo}${Math.abs(m.pct).toFixed(2)}%)`;

  const barras = `${m.barras} ${m.barras === 1 ? "barra" : "barras"}`;
  // `formatDuracion` es el MISMO formateador que usan el Probador y la barra
  // de modelos ("2d 3h" / "5h 12m" / "40m"); devuelve "—" para cero, que es lo
  // correcto cuando los dos puntos caen en la misma vela.
  const tiempo = formatDuracion(m.duracionMs);

  // Los ticks se muestran SIEMPRE: es uno de los datos que se piden a una
  // regla. A 0.01 de tick un movimiento de BTC da cientos de miles, así que
  // por encima del millar se compactan con el mismo formateador que el
  // volumen ("120.00K ticks") en vez de esconderse.
  const ticks = Math.round(m.ticks);
  const ticksTexto = ticks >= 1000 ? formatVolume(ticks) : ticks.toLocaleString("en-US");

  return [precio, `${barras} · ${tiempo}`, `${ticksTexto} ticks · Vol ${formatVolume(m.volumen)}`];
}

/** Caja de texto centrada en `xc`, con el borde dentro del área de trazado. */
function etiqueta(
  ctx: CanvasRenderingContext2D,
  textos: string[],
  xc: number,
  yArriba: number,
  color: string,
  ancho: number,
) {
  ctx.font = "600 11px Inter, system-ui, sans-serif";
  const w = Math.max(...textos.map((t) => ctx.measureText(t).width)) + PAD * 2;
  const h = textos.length * ALTO_LINEA + PAD * 1.5;

  // No dejar que la etiqueta se salga por los lados ni por arriba: en un rango
  // pegado al borde quedaría cortada por el recorte del área de trazado.
  const x = Math.max(2, Math.min(ancho - w - 2, xc - w / 2));
  const y = Math.max(2, yArriba);

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 3);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  textos.forEach((t, i) => {
    ctx.font = i === 0 ? "600 11px Inter, system-ui, sans-serif" : "10px Inter, system-ui, sans-serif";
    ctx.globalAlpha = i === 0 ? 1 : 0.92;
    ctx.fillText(t, x + w / 2, y + PAD * 0.75 + i * ALTO_LINEA + ALTO_LINEA / 2);
  });
  ctx.globalAlpha = 1;
}

export interface GeometriaMedicion {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** Ancho del área de trazado, para que la etiqueta no se salga. */
  ancho: number;
  /** `false` = todavía se está colocando el segundo punto: trazo punteado. */
  completo: boolean;
}

export function pintarMedicion(
  ctx: CanvasRenderingContext2D,
  m: Medicion,
  geo: GeometriaMedicion,
) {
  const { ax, ay, bx, by, ancho, completo } = geo;
  const color = m.alcista ? COLOR_GANANCIA : COLOR_PERDIDA;

  const izq = Math.min(ax, bx);
  const der = Math.max(ax, bx);
  const arriba = Math.min(ay, by);
  const abajo = Math.max(ay, by);
  const xc = (ax + bx) / 2;

  // ── Zona medida ────────────────────────────────────────────────────
  ctx.fillStyle = hexToRgba(color, ALFA_ZONA);
  ctx.fillRect(izq, arriba, Math.max(1, der - izq), Math.max(1, abajo - arriba));

  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.setLineDash(completo ? [] : [4, 3]);
  ctx.strokeRect(izq, arriba, Math.max(1, der - izq), Math.max(1, abajo - arriba));
  ctx.setLineDash([]);

  // ── Referencia del precio de partida ───────────────────────────────
  ctx.strokeStyle = hexToRgba(color, 0.75);
  ctx.setLineDash([2, 3]);
  ctx.beginPath();
  ctx.moveTo(izq, ay);
  ctx.lineTo(der, ay);
  ctx.stroke();
  ctx.setLineDash([]);

  // ── Flecha de dirección, en el centro ──────────────────────────────
  // Se dibuja de A hacia B: la punta dice para dónde se movió el precio sin
  // tener que leer el signo.
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(xc, ay);
  ctx.lineTo(xc, by);
  ctx.stroke();
  if (Math.abs(by - ay) > 8) {
    const dir = by > ay ? 1 : -1;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(xc, by);
    ctx.lineTo(xc - 4, by - 6 * dir);
    ctx.lineTo(xc + 4, by - 6 * dir);
    ctx.closePath();
    ctx.fill();
  }

  // ── Puntas ─────────────────────────────────────────────────────────
  for (const [x, y] of [
    [ax, ay],
    [bx, by],
  ] as const) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#131722";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // ── Etiqueta ───────────────────────────────────────────────────────
  // Del lado contrario al que apunta la flecha, para no taparla: arriba de la
  // zona si el precio subió, debajo si bajó.
  const textos = renglones(m);
  const altoEtiqueta = textos.length * ALTO_LINEA + PAD * 1.5;
  const yEtiqueta = m.alcista ? arriba - altoEtiqueta - 6 : abajo + 6;
  etiqueta(ctx, textos, xc, yEtiqueta, color, ancho);
}
