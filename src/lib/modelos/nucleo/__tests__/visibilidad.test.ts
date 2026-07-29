import { describe, expect, test } from "bun:test";
import {
  aislar,
  alternarCapa,
  alternarVisible,
  dibuja,
  VISIBILIDAD_POR_DEFECTO,
  visibilidadDe,
  type VisibilidadModelo,
} from "../visibilidad";
import { computeMetricasGrupo, sharpePorOperacion, type OperacionIA } from "@/lib/trades";

const IDS = ["sac", "ppo", "dqn"];
const vacio: Record<string, VisibilidadModelo> = {};

describe("defaults", () => {
  test("un modelo recién aparecido se dibuja entero", () => {
    expect(visibilidadDe(vacio, "sac")).toEqual(VISIBILIDAD_POR_DEFECTO);
    expect(dibuja(vacio, "sac", "posicion")).toBe(true);
    expect(dibuja(vacio, "sac", "barreras")).toBe(true);
  });
});

describe("interruptor maestro", () => {
  test("apagar el maestro apaga TODAS las capas", () => {
    const m = alternarVisible(vacio, "sac");
    expect(m.sac.visible).toBe(false);
    for (const capa of ["aperturas", "cierres", "posicion", "barreras"] as const) {
      expect(dibuja(m, "sac", capa)).toBe(false);
    }
  });

  test("volver a encenderlo devuelve las capas como estaban", () => {
    // apagar una capa, apagar el maestro, encender el maestro
    let m = alternarCapa(vacio, "sac", "barreras");
    m = alternarVisible(m, "sac");
    m = alternarVisible(m, "sac");
    expect(m.sac.visible).toBe(true);
    expect(dibuja(m, "sac", "barreras")).toBe(false); // la capa siguió apagada
    expect(dibuja(m, "sac", "posicion")).toBe(true);
  });

  test("apagar un modelo no toca a los demás", () => {
    const m = alternarVisible(vacio, "sac");
    expect(dibuja(m, "ppo", "posicion")).toBe(true);
    expect(dibuja(m, "dqn", "aperturas")).toBe(true);
  });
});

describe("capas sueltas", () => {
  test("se apagan de a una", () => {
    const m = alternarCapa(vacio, "sac", "cierres");
    expect(dibuja(m, "sac", "cierres")).toBe(false);
    expect(dibuja(m, "sac", "aperturas")).toBe(true);
  });

  test("SL/TP se pueden apagar dejando la caja de la posición", () => {
    const m = alternarCapa(vacio, "sac", "barreras");
    expect(dibuja(m, "sac", "barreras")).toBe(false);
    expect(dibuja(m, "sac", "posicion")).toBe(true);
  });
});

describe("aislar (ver solo uno)", () => {
  test("deja visible solo el elegido", () => {
    const m = aislar(vacio, IDS, "ppo");
    expect(m.ppo.visible).toBe(true);
    expect(m.sac.visible).toBe(false);
    expect(m.dqn.visible).toBe(false);
  });

  test("repetirlo sobre el ya aislado vuelve a mostrarlos todos", () => {
    // el botón es de ida y vuelta: no hace falta un "mostrar todos" aparte
    const uno = aislar(vacio, IDS, "ppo");
    const dos = aislar(uno, IDS, "ppo");
    expect(IDS.every((id) => dos[id].visible)).toBe(true);
  });

  test("aislar OTRO modelo mueve el foco, no lo desactiva todo", () => {
    const uno = aislar(vacio, IDS, "ppo");
    const dos = aislar(uno, IDS, "sac");
    expect(dos.sac.visible).toBe(true);
    expect(dos.ppo.visible).toBe(false);
  });

  test("aislar conserva las capas de cada modelo", () => {
    const conCapaApagada = alternarCapa(vacio, "sac", "cierres");
    const m = aislar(conCapaApagada, IDS, "sac");
    expect(m.sac.visible).toBe(true);
    expect(m.sac.cierres).toBe(false);
  });
});

// ── Sharpe: la métrica que hace comparables a dos modelos ──────────────────

const op = (pnlPct: number, i: number): OperacionIA => ({
  indice: i,
  lado: "long",
  tiempoEntradaMs: i * 1000,
  precioEntrada: 100,
  tiempoSalidaMs: i * 1000 + 500,
  precioSalida: 100 * (1 + pnlPct / 100),
  motivo: "senal",
  pnlUsd: pnlPct,
  pnlPct,
  acumuladoUsd: 0,
});

describe("Sharpe por operación", () => {
  test("premia la regularidad: mismo retorno medio, menos dispersión = mejor", () => {
    const parejo = [1, 1.1, 0.9, 1, 1.05].map(op);
    const erratico = [6, -4, 5, -3, 1].map(op);
    const a = sharpePorOperacion(parejo)!;
    const b = sharpePorOperacion(erratico)!;
    expect(a).toBeGreaterThan(b);
  });

  test("un modelo perdedor da Sharpe negativo", () => {
    expect(sharpePorOperacion([-1, -2, -1.5, -0.5].map(op))!).toBeLessThan(0);
  });

  test("con menos de dos operaciones no hay dispersión que medir", () => {
    expect(sharpePorOperacion([])).toBeNull();
    expect(sharpePorOperacion([op(5, 1)])).toBeNull();
  });

  test("todas iguales: desvío cero, sin riesgo que medir", () => {
    expect(sharpePorOperacion([2, 2, 2].map(op))).toBeNull();
  });

  test("viaja dentro de las métricas del grupo", () => {
    const m = computeMetricasGrupo([1, 2, 1.5].map(op));
    expect(m.sharpe).not.toBeNull();
    expect(Number.isFinite(m.sharpe!)).toBe(true);
  });

  test("no depende del tamaño de posición: dos motores con capitales distintos son comparables", () => {
    // mismo % por operación, importes en USD muy distintos
    const chico = [1, 2, 1.5].map(op);
    const grande = chico.map((o) => ({ ...o, pnlUsd: o.pnlUsd * 1000 }));
    expect(sharpePorOperacion(grande)).toBeCloseTo(sharpePorOperacion(chico)!, 12);
  });
});
