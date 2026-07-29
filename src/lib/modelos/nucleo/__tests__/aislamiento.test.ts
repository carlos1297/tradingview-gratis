import { beforeEach, describe, expect, test } from "bun:test";
import { useModelosStore } from "@/lib/store/modelos-store";
import { buildOperaciones, computeEstadisticas } from "@/lib/trades";
import { adaptar, estadoCrudoV1 } from "./ayuda";

/**
 * La promesa central del diseño multi-modelo: **agregar o quitar un modelo no
 * puede afectar a los demás**. Estos tests la verifican sobre el store, que es
 * donde conviven todos.
 */

const store = () => useModelosStore.getState();

beforeEach(() => {
  useModelosStore.setState({ estados: {}, modeloActivo: null, disponibles: [] });
});

describe("convivencia de varios modelos", () => {
  test("cada modelo guarda su propio estado, sin mezclarse", () => {
    store().publicarEstado("sac", adaptar(estadoCrudoV1({ posicion: "SHORT", equity: 498 })));
    store().publicarEstado(
      "ppo",
      adaptar(estadoCrudoV1({ modeloId: "ppo", modelo: "PPO", posicion: "LONG", equity: 1200 })),
    );

    expect(store().estados.sac.posicion).toBe("SHORT");
    expect(store().estados.sac.equity).toBe(498);
    expect(store().estados.ppo.posicion).toBe("LONG");
    expect(store().estados.ppo.equity).toBe(1200);
    expect(store().disponibles).toEqual(["sac", "ppo"]);
  });

  test("el primero en responder queda activo; después manda el usuario", () => {
    store().publicarEstado("sac", adaptar(estadoCrudoV1()));
    expect(store().modeloActivo).toBe("sac");

    store().publicarEstado("ppo", adaptar(estadoCrudoV1({ modeloId: "ppo" })));
    expect(store().modeloActivo).toBe("sac"); // no se lo roba el recién llegado

    store().setModeloActivo("ppo");
    store().publicarEstado("sac", adaptar(estadoCrudoV1()));
    expect(store().modeloActivo).toBe("ppo"); // ni un tick posterior
  });

  test("un tick de un modelo no altera el estado del otro", () => {
    store().publicarEstado("sac", adaptar(estadoCrudoV1({ equity: 498 })));
    const antes = store().estados.sac;

    store().publicarEstado("ppo", adaptar(estadoCrudoV1({ modeloId: "ppo", equity: 1200 })));

    // misma referencia: React ni siquiera re-renderiza el panel de SAC
    expect(store().estados.sac).toBe(antes);
  });

  test("quitar un modelo caído deja intactos los demás", () => {
    store().publicarEstado("sac", adaptar(estadoCrudoV1()));
    store().publicarEstado("ppo", adaptar(estadoCrudoV1({ modeloId: "ppo" })));

    store().quitarModelo("sac");

    expect(store().estados.sac).toBeUndefined();
    expect(store().estados.ppo).toBeDefined();
    expect(store().disponibles).toEqual(["ppo"]);
  });

  test("si cae el modelo ACTIVO, el foco pasa a otro disponible", () => {
    store().publicarEstado("sac", adaptar(estadoCrudoV1()));
    store().publicarEstado("ppo", adaptar(estadoCrudoV1({ modeloId: "ppo" })));
    expect(store().modeloActivo).toBe("sac");

    store().quitarModelo("sac");
    expect(store().modeloActivo).toBe("ppo");
  });

  test("si cae el último, no queda ningún activo colgado", () => {
    store().publicarEstado("sac", adaptar(estadoCrudoV1()));
    store().quitarModelo("sac");
    expect(store().modeloActivo).toBeNull();
    expect(store().disponibles).toEqual([]);
  });

  test("quitar un modelo que nunca existió es inocuo", () => {
    store().publicarEstado("sac", adaptar(estadoCrudoV1()));
    store().quitarModelo("fantasma");
    expect(store().disponibles).toEqual(["sac"]);
    expect(store().modeloActivo).toBe("sac");
  });
});

describe("estadísticas por modelo", () => {
  test("las operaciones de dos motores NO se mezclan", () => {
    // mezclarlas daría un win rate y un profit factor sin significado
    const sac = adaptar(
      estadoCrudoV1({
        senales: [
          { tiempoMs: 1, evento: "abrir_long", precio: 100 },
          { tiempoMs: 2, evento: "cerrar_long", precio: 110, pnlUsd: 10 },
        ],
      }),
    );
    const ppo = adaptar(
      estadoCrudoV1({
        modeloId: "ppo",
        senales: [
          { tiempoMs: 1, evento: "abrir_short", precio: 100 },
          { tiempoMs: 2, evento: "cerrar_short", precio: 110, pnlUsd: -10 },
        ],
      }),
    );

    const statsSac = computeEstadisticas(buildOperaciones(sac.senales));
    const statsPpo = computeEstadisticas(buildOperaciones(ppo.senales));

    expect(statsSac.tasaAcierto).toBe(100);
    expect(statsPpo.tasaAcierto).toBe(0);
    // y juntas darían un 50 % que no describe a ninguno de los dos
    expect(
      computeEstadisticas(buildOperaciones([...sac.senales, ...ppo.senales])).tasaAcierto,
    ).toBe(50);
  });

  test("la operación ABIERTA no entra en las estadísticas", () => {
    // el fixture termina con una apertura sin cierre: hay 1 op cerrada, no 2
    const e = adaptar(estadoCrudoV1());
    expect(e.senales).toHaveLength(3);
    expect(buildOperaciones(e.senales)).toHaveLength(1);
  });
});
