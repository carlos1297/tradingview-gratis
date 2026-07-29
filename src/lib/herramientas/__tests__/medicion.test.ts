import { describe, expect, test } from "bun:test";
import type { Candle } from "@/lib/binance/types";
import { calcularMedicion, tamanoTick } from "../medicion";

/**
 * La medición es lo único de la herramienta que se puede equivocar en silencio:
 * el dibujo se ve, pero un porcentaje mal calculado parece correcto. Todo lo
 * que la etiqueta muestra sale de acá.
 */

const T0 = 1_700_000_000; // segundos unix, alineado a la hora

/** Velas de 1 minuto, precio y volumen deterministas. */
function velas(n: number, paso = 60): Candle[] {
  return Array.from({ length: n }, (_, i) => ({
    time: T0 + i * paso,
    open: 100 + i,
    high: 101 + i,
    low: 99 + i,
    close: 100 + i,
    volume: 10,
  }));
}

describe("cambio de precio y porcentaje", () => {
  test("subida: signo positivo y % sobre el punto de partida", () => {
    const m = calcularMedicion({ tiempo: T0, precio: 100 }, { tiempo: T0 + 600, precio: 110 });
    expect(m.deltaPrecio).toBeCloseTo(10, 9);
    expect(m.pct).toBeCloseTo(10, 9);
    expect(m.alcista).toBe(true);
  });

  test("bajada: el signo lo da B − A, no el orden de los clics", () => {
    const m = calcularMedicion({ tiempo: T0, precio: 110 }, { tiempo: T0 + 600, precio: 99 });
    expect(m.deltaPrecio).toBeCloseTo(-11, 9);
    expect(m.pct).toBeCloseTo(-10, 9);
    expect(m.alcista).toBe(false);
  });

  test("medir hacia atrás en el tiempo sigue midiendo el precio de A a B", () => {
    const m = calcularMedicion({ tiempo: T0 + 600, precio: 100 }, { tiempo: T0, precio: 110 });
    expect(m.deltaPrecio).toBeCloseTo(10, 9);
    expect(m.duracionMs).toBe(600_000); // la duración es absoluta
  });

  test("precio de partida cero no explota", () => {
    const m = calcularMedicion({ tiempo: T0, precio: 0 }, { tiempo: T0, precio: 10 });
    expect(m.pct).toBe(0);
    expect(Number.isFinite(m.pct)).toBe(true);
  });
});

describe("barras entre los dos puntos", () => {
  const v = velas(20);

  test("de la vela 0 a la 5 hay 5 barras, no 6", () => {
    // Contar las velas del rango daría 6; TradingView cuenta los saltos.
    const m = calcularMedicion({ tiempo: T0, precio: 100 }, { tiempo: T0 + 5 * 60, precio: 105 }, v);
    expect(m.barras).toBe(5);
  });

  test("dentro de la misma vela: 0 barras", () => {
    const m = calcularMedicion({ tiempo: T0, precio: 100 }, { tiempo: T0, precio: 105 }, v);
    expect(m.barras).toBe(0);
  });

  test("el orden de los clics no cambia la cuenta", () => {
    const a = { tiempo: T0 + 12 * 60, precio: 112 };
    const b = { tiempo: T0 + 3 * 60, precio: 103 };
    expect(calcularMedicion(a, b, v).barras).toBe(9);
    expect(calcularMedicion(b, a, v).barras).toBe(9);
  });

  test("un punto entre dos velas se ancla a la vela que lo contiene", () => {
    // 90 s = mitad de la vela 1 en un gráfico de 1m
    const m = calcularMedicion({ tiempo: T0, precio: 100 }, { tiempo: T0 + 90, precio: 101 }, v);
    expect(m.barras).toBe(1);
  });

  test("sin velas cargadas devuelve 0 en vez de romperse", () => {
    const m = calcularMedicion({ tiempo: T0, precio: 100 }, { tiempo: T0 + 600, precio: 110 }, []);
    expect(m.barras).toBe(0);
    expect(m.volumen).toBe(0);
    expect(m.deltaPrecio).toBeCloseTo(10, 9); // el precio se mide igual
  });
});

describe("tiempo transcurrido", () => {
  test("se devuelve en ms, para poder usar formatDuracion", () => {
    const m = calcularMedicion({ tiempo: T0, precio: 100 }, { tiempo: T0 + 3600, precio: 100 });
    expect(m.duracionMs).toBe(3_600_000);
  });

  test("no depende de la temporalidad, solo de los tiempos", () => {
    const enVelasDe1m = calcularMedicion(
      { tiempo: T0, precio: 100 },
      { tiempo: T0 + 3600, precio: 100 },
      velas(100, 60),
    );
    const enVelasDe5m = calcularMedicion(
      { tiempo: T0, precio: 100 },
      { tiempo: T0 + 3600, precio: 100 },
      velas(100, 300),
    );
    expect(enVelasDe1m.duracionMs).toBe(enVelasDe5m.duracionMs);
    // pero las barras SÍ dependen: una hora son 60 velas de 1m o 12 de 5m
    expect(enVelasDe1m.barras).toBe(60);
    expect(enVelasDe5m.barras).toBe(12);
  });
});

describe("distancia en ticks", () => {
  test("los tramos siguen los de formatPrice", () => {
    expect(tamanoTick(64_000)).toBe(0.01);
    expect(tamanoTick(1)).toBe(0.01);
    expect(tamanoTick(0.5)).toBe(0.0001);
    expect(tamanoTick(0.001)).toBe(0.000001);
  });

  test("el tick sale del precio de PARTIDA, no del de llegada", () => {
    // Si no, medir de 0.9 a 1.1 cambiaría de escala a mitad de camino.
    const m = calcularMedicion({ tiempo: T0, precio: 0.9 }, { tiempo: T0, precio: 1.1 });
    expect(m.tamanoTick).toBe(0.0001);
  });

  test("siempre positivo: es una distancia", () => {
    const subida = calcularMedicion({ tiempo: T0, precio: 100 }, { tiempo: T0, precio: 110 });
    const bajada = calcularMedicion({ tiempo: T0, precio: 110 }, { tiempo: T0, precio: 100 });
    expect(subida.ticks).toBeCloseTo(1000, 6);
    expect(bajada.ticks).toBeCloseTo(1000, 6);
  });
});

describe("volumen del rango", () => {
  test("suma las velas de los dos extremos, ambas incluidas", () => {
    const m = calcularMedicion(
      { tiempo: T0, precio: 100 },
      { tiempo: T0 + 4 * 60, precio: 104 },
      velas(20),
    );
    expect(m.volumen).toBe(50); // 5 velas × 10
  });
});
