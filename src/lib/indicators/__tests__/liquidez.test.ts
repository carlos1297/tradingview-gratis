import { describe, expect, test } from "bun:test";
import type { Candle } from "@/lib/binance/types";
import {
  computeLiquidationHeatmap,
  perfilLiquidez,
  type LiquidationHeatmap,
} from "@/lib/indicators/liquidations";
import { encendido } from "@/lib/store/chart-store";

/**
 * El perfil lateral es la lectura NUMÉRICA del heatmap: de acá salen el largo
 * de cada barra y el valor que muestra la etiqueta. Un error de agregación no
 * rompe nada visiblemente —las barras se siguen dibujando— pero el número que
 * lee el usuario para decidir una operación es otro.
 */

/** Rejilla armada a mano: 3 velas × 4 bins, con valores reconocibles. */
function rejilla(): LiquidationHeatmap {
  const bins = 4;
  const grid = new Float32Array([
    // vela 0: el nivel del bin 1 está vivo
    0, 10, 0, 0,
    // vela 1: sigue vivo y se suma otro en el bin 3
    0, 10, 0, 4,
    // vela 2: el precio atravesó el bin 1 y lo consumió
    0, 0, 0, 4,
  ]);
  return { grid, bins, minPrice: 100, binSize: 10, maxIntensity: 10 };
}

describe("perfilLiquidez lee una columna, no la suma", () => {
  test("devuelve exactamente la columna pedida", () => {
    const p = perfilLiquidez(rejilla(), 1)!;
    expect(Array.from(p.valores)).toEqual([0, 10, 0, 4]);
    expect(p.columna).toBe(1);
  });

  test("NO acumula las columnas anteriores", () => {
    // El bin 1 vale 10 en las velas 0 y 1. Sumando daría 20 y el perfil diría
    // que hay el doble de liquidez pendiente de la que hay: un nivel que
    // sobrevive muchas velas se contaría una vez por vela.
    const p = perfilLiquidez(rejilla(), 1)!;
    expect(p.valores[1]).toBe(10);
  });

  test("un nivel consumido por el precio vale 0 desde esa vela", () => {
    // Es lo que hace útil al perfil: muestra lo que QUEDA, no lo que hubo.
    const p = perfilLiquidez(rejilla(), 2)!;
    expect(p.valores[1]).toBe(0);
    expect(p.valores[3]).toBe(4);
  });

  test("`max` es el mayor de esa columna, no el de la rejilla", () => {
    // Normaliza el largo de las barras: con el máximo global, una columna
    // floja se dibujaría como una hilera de rayas invisibles.
    expect(perfilLiquidez(rejilla(), 2)!.max).toBe(4);
    expect(perfilLiquidez(rejilla(), 1)!.max).toBe(10);
  });

  test("es una copia: recalcular el heatmap no muta el perfil dibujado", () => {
    const h = rejilla();
    const p = perfilLiquidez(h, 1)!;
    h.grid[1 * 4 + 1] = 999;
    expect(p.valores[1]).toBe(10);
  });
});

describe("perfilLiquidez no puede romper el dibujo", () => {
  test("columna fuera de rango → null", () => {
    const h = rejilla();
    expect(perfilLiquidez(h, 3)).toBeNull();
    expect(perfilLiquidez(h, -1)).toBeNull();
    expect(perfilLiquidez(h, NaN)).toBeNull();
  });

  test("columna vacía → null (nadie divide por cero)", () => {
    const h = rejilla();
    h.grid.fill(0);
    expect(perfilLiquidez(h, 1)).toBeNull();
  });

  test("los índices se truncan: una columna fraccionaria no lee fuera", () => {
    expect(perfilLiquidez(rejilla(), 1.9)!.columna).toBe(1);
  });
});

describe("sobre un heatmap real", () => {
  const velas: Candle[] = Array.from({ length: 60 }, (_, i) => {
    const c = 60_000 + Math.sin(i / 7) * 500;
    return { time: i * 900, open: c, high: c + 50, low: c - 50, close: c, volume: 5 };
  });

  test("la última columna trae niveles vivos y todos son finitos", () => {
    const h = computeLiquidationHeatmap(velas)!;
    const p = perfilLiquidez(h, velas.length - 1)!;
    expect(p).not.toBeNull();
    expect(p.valores.length).toBe(h.bins);
    expect(p.valores.every((v) => Number.isFinite(v) && v >= 0)).toBe(true);
    expect(p.max).toBeGreaterThan(0);
  });

  test("el precio de un bin se reconstruye con minPrice + b*binSize", () => {
    // Es la cuenta que hacen el dibujo y la etiqueta; si el bin se saliera del
    // rango, la barra aparecería a una altura que no le corresponde.
    const h = computeLiquidationHeatmap(velas)!;
    const p = perfilLiquidez(h, velas.length - 1)!;
    for (let b = 0; b < p.valores.length; b++) {
      if (p.valores[b] <= 0) continue;
      const precio = h.minPrice + (b + 0.5) * h.binSize;
      expect(precio).toBeGreaterThan(h.minPrice);
      expect(precio).toBeLessThan(h.minPrice + h.bins * h.binSize);
    }
  });
});

/**
 * `persist` mezcla superficialmente: una `liqHeatmapConfig` guardada antes de
 * esta función reemplaza al objeto por defecto ENTERO, así que los campos
 * nuevos llegan como `undefined`. Sin tolerancia, las dos capas se apagarían
 * solas en la próxima recarga de quien ya tenía la aplicación abierta.
 */
describe("una config guardada sin los campos nuevos no apaga el heatmap", () => {
  test("ausente = encendido", () => {
    const guardada = { umbral: 0.05, opacidad: 1 } as { mostrarBloques?: boolean };
    expect(encendido(guardada.mostrarBloques)).toBe(true);
  });

  test("solo un `false` explícito apaga", () => {
    expect(encendido(false)).toBe(false);
    expect(encendido(true)).toBe(true);
  });
});
