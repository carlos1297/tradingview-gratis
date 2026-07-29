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
