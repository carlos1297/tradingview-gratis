import { describe, expect, test } from "bun:test";
import type { Candle } from "@/lib/binance/types";
import { buscarHerramienta } from "../registro";
import type { LienzoHerramienta, PuntoResuelto } from "../tipos";

/**
 * El dibujo de una herramienta es puro: recibe un contexto 2D y coordenadas ya
 * resueltas. Eso permite ejercitarlo SIN navegador, contra un contexto
 * simulado que anota lo que se le pidió — que es como se verifica que la
 * etiqueta de la regla muestre de verdad precio, %, barras, tiempo y ticks.
 */

interface Trazo {
  textos: string[];
  rectangulos: number;
  lineas: number;
  arcos: number;
}

/** Contexto 2D mínimo que registra lo dibujado. */
function contextoFalso(): { ctx: CanvasRenderingContext2D; trazo: Trazo } {
  const trazo: Trazo = { textos: [], rectangulos: 0, lineas: 0, arcos: 0 };
  const ctx = {
    // estado
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    font: "",
    textAlign: "",
    textBaseline: "",
    globalAlpha: 1,
    // dibujo
    fillRect: () => void trazo.rectangulos++,
    strokeRect: () => void trazo.rectangulos++,
    roundRect: () => void trazo.rectangulos++,
    rect: () => {},
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => void trazo.lineas++,
    arc: () => void trazo.arcos++,
    stroke: () => {},
    fill: () => {},
    clip: () => {},
    save: () => {},
    restore: () => {},
    setLineDash: () => {},
    setTransform: () => {},
    clearRect: () => {},
    fillText: (t: string) => void trazo.textos.push(t),
    // el ancho real no importa: solo que la etiqueta pueda medirse
    measureText: (t: string) => ({ width: t.length * 6 }),
  } as unknown as CanvasRenderingContext2D;
  return { ctx, trazo };
}

const T0 = 1_700_000_000;
const velas: Candle[] = Array.from({ length: 40 }, (_, i) => ({
  time: T0 + i * 300, // velas de 5 minutos
  open: 64_000 + i,
  high: 64_010 + i,
  low: 63_990 + i,
  close: 64_000 + i,
  volume: 12,
}));

/** Dos puntos: 12 barras de 5m (1 hora) y +1,200 USD de subida. */
function lienzo(parcial: Partial<LienzoHerramienta> = {}): LienzoHerramienta {
  const a: PuntoResuelto = { tiempo: T0, precio: 64_000, x: 100, y: 400 };
  const b: PuntoResuelto = { tiempo: T0 + 12 * 300, precio: 65_200, x: 400, y: 150 };
  return { puntos: [a, b], completo: true, velas, ancho: 800, alto: 500, ...parcial };
}

describe("la herramienta de medición dibuja lo que promete", () => {
  const medicion = buscarHerramienta("medicion")!;

  test("está en el registro, pide 2 puntos y sabe pintarse", () => {
    expect(medicion).toBeDefined();
    expect(medicion.puntos).toBe(2);
    expect(typeof medicion.pintar).toBe("function");
  });

  test("la etiqueta trae precio, porcentaje, barras, tiempo y ticks", () => {
    const { ctx, trazo } = contextoFalso();
    medicion.pintar!(ctx, lienzo());
    const texto = trazo.textos.join(" | ");

    expect(texto).toContain("+1,200.00"); // cambio de precio, decimales fijos
    expect(texto).toContain("+1.88%"); //    variación porcentual
    expect(texto).toContain("12 barras"); // velas entre los dos puntos
    expect(texto).toContain("1h 0m"); //     tiempo transcurrido
    expect(texto).toContain("120.00K ticks"); // distancia en ticks, compactada
    expect(texto).toContain("Vol"); //       volumen del rango
  });

  test("el importe lleva decimales FIJOS: la etiqueta no cambia de ancho al moverse", () => {
    // Se recalcula con cada movimiento del cursor mientras se coloca el
    // segundo punto; con decimales variables el cartel bailaría.
    const { ctx, trazo } = contextoFalso();
    const l = lienzo();
    l.puntos[1] = { ...l.puntos[1], precio: 64_000 + 1200.5 };
    medicion.pintar!(ctx, l);
    expect(trazo.textos.join(" | ")).toContain("+1,200.50");
  });

  test("pocos ticks se muestran enteros, sin compactar", () => {
    const { ctx, trazo } = contextoFalso();
    const l = lienzo();
    l.puntos[1] = { ...l.puntos[1], precio: 64_001 }; // 1 USD = 100 ticks
    medicion.pintar!(ctx, l);
    expect(trazo.textos.join(" | ")).toContain("100 ticks");
  });

  test("una bajada se rotula con signo negativo", () => {
    const { ctx, trazo } = contextoFalso();
    const l = lienzo();
    l.puntos[1] = { ...l.puntos[1], precio: 63_000, y: 600 };
    medicion.pintar!(ctx, l);
    const texto = trazo.textos.join(" | ");
    expect(texto).toContain("−1,000.00");
    expect(texto).toContain("−1.56%");
    expect(texto).toContain("100.00K ticks");
  });

  test("una sola barra se rotula en singular", () => {
    const { ctx, trazo } = contextoFalso();
    const l = lienzo();
    l.puntos[1] = { ...l.puntos[1], tiempo: T0 + 300 };
    medicion.pintar!(ctx, l);
    expect(trazo.textos.join(" | ")).toContain("1 barra ");
  });

  test("dibuja zona, líneas y las dos puntas", () => {
    const { ctx, trazo } = contextoFalso();
    medicion.pintar!(ctx, lienzo());
    expect(trazo.rectangulos).toBeGreaterThan(0); // zona + caja de la etiqueta
    expect(trazo.lineas).toBeGreaterThan(0); //      referencia + flecha
    expect(trazo.arcos).toBe(2); //                  una punta por punto
  });

  test("en previa (segundo punto sin fijar) tampoco se rompe", () => {
    const { ctx, trazo } = contextoFalso();
    medicion.pintar!(ctx, lienzo({ completo: false }));
    expect(trazo.textos.length).toBeGreaterThan(0);
  });

  test("sin velas cargadas dibuja igual, con 0 barras", () => {
    const { ctx, trazo } = contextoFalso();
    medicion.pintar!(ctx, lienzo({ velas: [] }));
    expect(trazo.textos.join(" | ")).toContain("0 barras");
  });

  test("el cursor no dibuja nada: es la herramienta identidad", () => {
    const cursor = buscarHerramienta("cursor")!;
    expect(cursor.puntos).toBe(0);
    expect(cursor.pintar).toBeUndefined();
  });
});
