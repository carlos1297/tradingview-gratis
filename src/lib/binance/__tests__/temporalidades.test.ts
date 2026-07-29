import { describe, expect, test } from "bun:test";
import {
  MINUTOS_POR_TEMPORALIDAD,
  ms_queAbarca,
  temporalidadParaPeriodo,
  VELAS_POR_CARGA,
} from "../temporalidades";

const DIA = 86_400_000;

describe("cuánto abarca una carga de velas", () => {
  test("1000 velas de 15m son ~10 días, no un backtest de meses", () => {
    expect(ms_queAbarca("15m") / DIA).toBeCloseTo(10.4, 1);
  });

  test("cuanto más gruesa la temporalidad, más período entra", () => {
    expect(ms_queAbarca("1h")).toBeGreaterThan(ms_queAbarca("15m"));
    expect(ms_queAbarca("1d")).toBeGreaterThan(ms_queAbarca("4h"));
  });

  test("todas las temporalidades del visor tienen duración declarada", () => {
    for (const [tf, min] of Object.entries(MINUTOS_POR_TEMPORALIDAD)) {
      expect(`${tf}=${min > 0}`).toBe(`${tf}=true`);
    }
  });
});

describe("temporalidadParaPeriodo", () => {
  test("elige la MÁS FINA que alcanza: no pierde detalle de más", () => {
    // 5 días entran en 15m (10.4 días de cobertura)
    expect(temporalidadParaPeriodo(5 * DIA)).toBe("15m");
  });

  test("el caso que rompía el visor: un backtest de 249 días", () => {
    // senales.json de validación: 2025-03-05 → 2025-11-09. En 15m —el default—
    // solo se cargaban 10 días y el gráfico se veía vacío.
    const elegida = temporalidadParaPeriodo(249 * DIA);
    expect(ms_queAbarca(elegida)).toBeGreaterThanOrEqual(249 * DIA);
    expect(elegida).toBe("6h");
  });

  test("un período de un día se queda en velas finas", () => {
    expect(MINUTOS_POR_TEMPORALIDAD[temporalidadParaPeriodo(DIA)]).toBeLessThanOrEqual(5);
  });

  test("un período absurdo devuelve la más gruesa en vez de romper", () => {
    // mejor ver la parte más reciente que no ver nada: el scroll trae el resto
    expect(temporalidadParaPeriodo(100 * 365 * DIA)).toBe("1M");
  });

  test("acepta otra cantidad de velas", () => {
    // con la mitad de velas hace falta el doble de temporalidad
    const conMil = temporalidadParaPeriodo(20 * DIA, 1000);
    const conQuinientas = temporalidadParaPeriodo(20 * DIA, 500);
    expect(MINUTOS_POR_TEMPORALIDAD[conQuinientas]).toBeGreaterThanOrEqual(
      MINUTOS_POR_TEMPORALIDAD[conMil],
    );
  });

  test("la elegida SIEMPRE cubre el período pedido (salvo lo imposible)", () => {
    for (const dias of [1, 7, 30, 90, 180, 249, 365, 900]) {
      const elegida = temporalidadParaPeriodo(dias * DIA);
      expect(`${dias}d -> ${ms_queAbarca(elegida) >= dias * DIA}`).toBe(`${dias}d -> true`);
    }
  });

  test("VELAS_POR_CARGA es el tope real de la API de Binance", () => {
    expect(VELAS_POR_CARGA).toBe(1000);
  });
});
