import { MousePointer2, Ruler } from "lucide-react";
import { pintarMedicion } from "@/lib/chart/pintarMedicion";
import { calcularMedicion } from "./medicion";
import type { DefinicionHerramienta } from "./tipos";

/**
 * registro.ts — Catálogo de herramientas de la barra lateral.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  PARA AGREGAR UNA HERRAMIENTA NUEVA alcanza con sumar una entrada acá.
 *
 *  No hay que tocar la barra lateral (se arma sola recorriendo el catálogo),
 *  ni `ChartLigero` (ya sabe juntar N puntos con clic, previsualizar el trazo
 *  y resolver los puntos a píxeles en cada repintado), ni el store.
 *
 *  Ejemplo — una línea de tendencia:
 *
 *    {
 *      id: "tendencia",
 *      nombre: "Línea de tendencia",
 *      descripcion: "Dos puntos: une dos extremos del precio",
 *      icono: TrendingUp,
 *      atajo: "t",
 *      puntos: 2,
 *      cursor: "crosshair",
 *      pintar: (ctx, { puntos, completo }) => {
 *        const [a, b] = puntos;
 *        ctx.strokeStyle = "#2962ff";
 *        ctx.lineWidth = 1.5;
 *        ctx.setLineDash(completo ? [] : [4, 3]);
 *        ctx.beginPath();
 *        ctx.moveTo(a.x, a.y);
 *        ctx.lineTo(b.x, b.y);
 *        ctx.stroke();
 *        ctx.setLineDash([]);
 *      },
 *    }
 *
 *  Un rectángulo o un Fibonacci son igual de directos (2 puntos, otro
 *  `pintar`); un canal usa `puntos: 3`. Los puntos llegan ya resueltos a
 *  píxeles Y con su `tiempo`/`precio` de origen, así que una herramienta que
 *  necesite el dominio —contar barras, leer las velas— lo tiene en el lienzo.
 * ─────────────────────────────────────────────────────────────────────────
 */

export const HERRAMIENTAS: DefinicionHerramienta[] = [
  {
    id: "cursor",
    nombre: "Cursor",
    descripcion:
      "Navegación: arrastrar para desplazar, rueda para zoom, y la leyenda OHLC sigue a la vela bajo el puntero.",
    icono: MousePointer2,
    atajo: "v",
    // 0 puntos = no dibuja nada. Es la herramienta identidad: el gráfico se
    // comporta como siempre, que es justo lo que tiene que hacer el cursor.
    puntos: 0,
  },
  {
    id: "medicion",
    nombre: "Medición",
    descripcion:
      "Dos clics sobre el gráfico: muestra el cambio de precio, el porcentaje, las barras entre ambos puntos, el tiempo transcurrido y la distancia en ticks.",
    icono: Ruler,
    atajo: "m",
    puntos: 2,
    cursor: "crosshair",
    pintar: (ctx, { puntos, completo, velas, ancho }) => {
      const [a, b] = puntos;
      if (!a || !b) return;
      pintarMedicion(
        ctx,
        calcularMedicion(a, b, velas),
        { ax: a.x, ay: a.y, bx: b.x, by: b.y, ancho, completo },
      );
    },
  },
];

/** La que está activa al arrancar, y a la que se vuelve con Escape. */
export const HERRAMIENTA_POR_DEFECTO = "cursor";

export function buscarHerramienta(id: string): DefinicionHerramienta | undefined {
  return HERRAMIENTAS.find((h) => h.id === id);
}

/** Herramienta que corresponde a una tecla, para los atajos del teclado. */
export function herramientaPorAtajo(tecla: string): DefinicionHerramienta | undefined {
  const t = tecla.toLowerCase();
  return HERRAMIENTAS.find((h) => h.atajo === t);
}
