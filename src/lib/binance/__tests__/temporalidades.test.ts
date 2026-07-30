import { describe, expect, test } from "bun:test";
import {
  MINUTOS_POR_TEMPORALIDAD,
  ms_queAbarca,
  temporalidadParaPeriodo,
  VELAS_POR_CARGA,
  VELAS_PRIMERA_PINTADA,
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

/**
 * Carga progresiva: el gráfico pinta `VELAS_PRIMERA_PINTADA` para aparecer
 * cuanto antes y completa el resto en segundo plano con la misma función del
 * scroll infinito.
 */
describe("velas de la primera pintada", () => {
  test("son menos que una carga completa, o la completación pediría cero", () => {
    expect(VELAS_PRIMERA_PINTADA).toBeGreaterThan(0);
    expect(VELAS_PRIMERA_PINTADA).toBeLessThan(VELAS_POR_CARGA);
  });

  test("el faltante a completar es el resto exacto", () => {
    const faltan = VELAS_POR_CARGA - VELAS_PRIMERA_PINTADA;
    expect(faltan).toBeGreaterThan(0);
    expect(VELAS_PRIMERA_PINTADA + faltan).toBe(VELAS_POR_CARGA);
  });

  test("alcanzan para llenar una pantalla con velas legibles", () => {
    // ~900 px de ancho útil: con 120 velas son ~7 px por vela (se distingue el
    // cuerpo de la mecha). Con las 1000 de antes eran menos de 1 px.
    expect(900 / VELAS_PRIMERA_PINTADA).toBeGreaterThan(4);
  });

  test("no alcanzan para una EMA 200: por eso la completación es automática", () => {
    // `ema()` devuelve vacío si hay menos velas que su período. Si algún día
    // este test falla porque VELAS_PRIMERA_PINTADA subió por encima de 200, la
    // completación deja de ser necesaria para que la EMA 200 aparezca.
    expect(VELAS_PRIMERA_PINTADA).toBeLessThan(200);
  });
});

describe("la primera pintada NO afecta al dimensionado de períodos", () => {
  test("ms_queAbarca sigue midiendo una carga COMPLETA", () => {
    // Se completa hasta VELAS_POR_CARGA, así que lo que abarca una ventana no
    // cambió: si esto usara VELAS_PRIMERA_PINTADA, cargar un backtest elegiría
    // una temporalidad 8 veces más gruesa de la necesaria.
    expect(ms_queAbarca("15m")).toBe(15 * 60_000 * VELAS_POR_CARGA);
  });

  test("un backtest de 249 días sigue eligiendo 6h", () => {
    expect(temporalidadParaPeriodo(249 * DIA)).toBe("6h");
  });
});
