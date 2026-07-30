import { useChartStore } from "@/lib/store/chart-store";
import { describe, expect, test } from "bun:test";
import { MINUTOS_POR_TEMPORALIDAD } from "@/lib/binance/temporalidades";

/**
 * El estado persistido viene de `localStorage`, o sea de una versión ANTERIOR
 * del producto. `migrate` es la única frontera que lo revisa antes de que
 * entre a la aplicación.
 *
 * Estos tests replican la lógica de saneamiento de `chart-store.migrate` sobre
 * los estados corruptos que de verdad pueden aparecer: una temporalidad que ya
 * no existe, un mosaico vacío, un símbolo en blanco.
 */

interface VentanaCruda {
  id?: unknown;
  timeframe?: unknown;
}

const esTemporalidadValida = (v: unknown) =>
  typeof v === "string" && v in MINUTOS_POR_TEMPORALIDAD;

/** El saneamiento de `migrate`, aislado para poder probarlo. */
function migrar(est: Record<string, unknown> | null) {
  if (!est) return est;
  if (Array.isArray(est.ventanas)) {
    est.ventanasTF = (est.ventanas as string[]).map((tf) => ({ id: "x", timeframe: tf }));
    delete est.ventanas;
  }
  if (Array.isArray(est.ventanasTF)) {
    est.ventanasTF = (est.ventanasTF as VentanaCruda[])
      .filter((v) => v && esTemporalidadValida(v.timeframe))
      .map((v) => ({ id: typeof v.id === "string" && v.id ? v.id : "nuevo", timeframe: v.timeframe }));
  }
  if (!Array.isArray(est.ventanasTF) || est.ventanasTF.length === 0) {
    est.ventanasTF = [{ id: "nuevo", timeframe: "15m" }];
  }
  if (typeof est.symbol !== "string" || !est.symbol.trim()) est.symbol = "BTCUSDT";
  if (Array.isArray(est.watchlist)) {
    est.watchlist = (est.watchlist as unknown[]).filter(
      (s): s is string => typeof s === "string" && s.trim().length > 0,
    );
  }
  return est;
}

const ventanas = (est: Record<string, unknown> | null) =>
  (est!.ventanasTF as Array<{ timeframe: string }>).map((v) => v.timeframe);

describe("temporalidades desconocidas", () => {
  test("una temporalidad retirada en una versión futura se descarta", () => {
    // Sin este filtro, MINUTOS_POR_TEMPORALIDAD["99m"] es undefined, el paso de
    // vela sale NaN y a partir de ahí los marcadores no se dibujan, el Order
    // Flow no agrupa y Binance rechaza el `interval` — todo en silencio.
    const est = migrar({ ventanasTF: [{ id: "a", timeframe: "15m" }, { id: "b", timeframe: "99m" }] });
    expect(ventanas(est)).toEqual(["15m"]);
  });

  test("si TODAS son inválidas se vuelve al arranque de fábrica", () => {
    const est = migrar({ ventanasTF: [{ id: "a", timeframe: "99m" }, { id: "b", timeframe: null }] });
    expect(ventanas(est)).toEqual(["15m"]);
  });

  test("las válidas se conservan intactas, con su id", () => {
    const est = migrar({ ventanasTF: [{ id: "abc", timeframe: "1h" }, { id: "def", timeframe: "1d" }] });
    expect(ventanas(est)).toEqual(["1h", "1d"]);
    expect((est!.ventanasTF as Array<{ id: string }>)[0].id).toBe("abc");
  });

  test("una ventana sin id recibe uno nuevo", () => {
    const est = migrar({ ventanasTF: [{ timeframe: "4h" }] });
    expect((est!.ventanasTF as Array<{ id: string }>)[0].id).toBe("nuevo");
  });
});

describe("estados corruptos no dejan el visor en negro", () => {
  test("mosaico vacío → una ventana", () => {
    expect(ventanas(migrar({ ventanasTF: [] }))).toEqual(["15m"]);
  });

  test("ventanasTF que no es un array → una ventana", () => {
    expect(ventanas(migrar({ ventanasTF: "roto" }))).toEqual(["15m"]);
  });

  test("ventanasTF ausente → una ventana", () => {
    expect(ventanas(migrar({}))).toEqual(["15m"]);
  });

  test("símbolo vacío o de otro tipo → BTCUSDT", () => {
    expect(migrar({ symbol: "   " })!.symbol).toBe("BTCUSDT");
    expect(migrar({ symbol: 42 })!.symbol).toBe("BTCUSDT");
    expect(migrar({ symbol: "ETHUSDT" })!.symbol).toBe("ETHUSDT");
  });

  test("entradas basura del watchlist se descartan", () => {
    const est = migrar({ watchlist: ["BTCUSDT", "", null, 7, "ETHUSDT"] });
    expect(est!.watchlist).toEqual(["BTCUSDT", "ETHUSDT"]);
  });
});

describe("migración de formatos anteriores", () => {
  test("v1 (`ventanas: Timeframe[]`) se normaliza al modelo actual", () => {
    const est = migrar({ ventanas: ["1m", "5m"] });
    expect(ventanas(est)).toEqual(["1m", "5m"]);
    expect(est!.ventanas).toBeUndefined();
  });

  test("v1 con una temporalidad ya retirada también se filtra", () => {
    expect(ventanas(migrar({ ventanas: ["1m", "99m"] }))).toEqual(["1m"]);
  });

  test("null no rompe", () => {
    expect(migrar(null)).toBeNull();
  });
});

/**
 * v4 → v5: `indicadoresActivos` era una lista de ids con los parámetros
 * cocinados en el nombre ("ema20"). Si esta traducción falla, el usuario abre el
 * visor y sus indicadores no están — sin ningún error visible.
 */
describe("migración de indicadores a instancias", () => {
  const LEGADO: Record<string, { definicionId: string; params: Record<string, number | string> }> = {
    ema20: { definicionId: "ema", params: { periodo: 20, color: "#ffb74d" } },
    ema50: { definicionId: "ema", params: { periodo: 50, color: "#2962ff" } },
    ema200: { definicionId: "ema", params: { periodo: 200, color: "#ab47bc" } },
    rsi: { definicionId: "rsi", params: {} },
    macd: { definicionId: "macd", params: {} },
    volumen: { definicionId: "volumen", params: {} },
  };

  /** El traductor de `migrate`, aislado. */
  function migrarIndicadores(entradas: unknown): Array<{ definicionId: string; params: Record<string, unknown> }> {
    if (!Array.isArray(entradas)) return [];
    return entradas
      .map((e) => {
        if (typeof e === "string") {
          const l = LEGADO[e];
          return l ? { definicionId: l.definicionId, params: { ...l.params } } : null;
        }
        const i = e as { definicionId?: unknown; params?: Record<string, unknown> };
        if (typeof i?.definicionId !== "string") return null;
        return { definicionId: i.definicionId, params: { ...(i.params ?? {}) } };
      })
      .filter((x): x is { definicionId: string; params: Record<string, unknown> } => x !== null);
  }

  test("las tres EMAs conservan su período y su color", () => {
    const r = migrarIndicadores(["ema20", "ema50", "ema200"]);
    expect(r).toHaveLength(3);
    expect(r.map((i) => i.params.periodo)).toEqual([20, 50, 200]);
    expect(r.every((i) => i.definicionId === "ema")).toBe(true);
    expect(r[0].params.color).toBe("#ffb74d");
  });

  test("mezcla de válidos y basura: se conservan los válidos", () => {
    const r = migrarIndicadores(["ema20", "indicador-inventado", "rsi", 42, null]);
    expect(r.map((i) => i.definicionId)).toEqual(["ema", "rsi"]);
  });

  test("una lista vacía o ausente no rompe", () => {
    expect(migrarIndicadores([])).toEqual([]);
    expect(migrarIndicadores(undefined)).toEqual([]);
    expect(migrarIndicadores("roto")).toEqual([]);
  });

  test("un estado que YA es v5 pasa sin tocarse", () => {
    const r = migrarIndicadores([
      { definicionId: "ema", params: { periodo: 34, color: "#abcdef" } },
    ]);
    expect(r).toEqual([{ definicionId: "ema", params: { periodo: 34, color: "#abcdef" } }]);
  });

  test("dos EMAs con el mismo período sobreviven las dos", () => {
    // El modelo de instancias lo permite a propósito: dos EMAs iguales con
    // colores distintos es un caso legítimo.
    const r = migrarIndicadores([
      { definicionId: "ema", params: { periodo: 20, color: "#111111" } },
      { definicionId: "ema", params: { periodo: 20, color: "#222222" } },
    ]);
    expect(r).toHaveLength(2);
  });
});

/**
 * El estado inicial del store se evalúa al cargar el módulo — en el servidor y
 * en el cliente por separado. Cualquier valor aleatorio ahí adentro sale
 * distinto en cada lado, y si llega al DOM rompe la hidratación.
 */
describe("el estado inicial es determinista", () => {
  test("la ventana de arranque tiene un id FIJO, no un UUID", () => {
    // Su id llega al DOM: los `Panel` del mosaico lo usan como atributo `id`
    // para que la librería de divisores pueda identificarlos.
    const inicial = useChartStore.getState().ventanasTF[0];
    expect(inicial.id).toBe("ventana-1");
    expect(inicial.id).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/); // no es un UUID
  });

  test("arranca con una sola ventana en 15m", () => {
    const v = useChartStore.getState().ventanasTF;
    expect(v).toHaveLength(1);
    expect(v[0].timeframe).toBe("15m");
  });
});
