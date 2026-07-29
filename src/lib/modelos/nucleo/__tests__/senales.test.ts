import { describe, expect, test } from "bun:test";
import { esApertura, esCierre, esEventoSenal, sanearSenales } from "../senales";

describe("sanearSenales — frontera de confianza con el motor", () => {
  test("deja pasar una señal bien formada, con sus opcionales", () => {
    const [s] = sanearSenales([
      { tiempoMs: 1, evento: "cerrar_long", precio: 110, motivo: "take_profit", pnlUsd: 10 },
    ]);
    expect(s).toEqual({
      tiempoMs: 1,
      evento: "cerrar_long",
      precio: 110,
      motivo: "take_profit",
      pnlUsd: 10,
    });
  });

  test("omite los opcionales ausentes en vez de dejarlos undefined", () => {
    const [s] = sanearSenales([{ tiempoMs: 1, evento: "abrir_long", precio: 100 }]);
    expect("motivo" in s).toBe(false);
    expect("pnlUsd" in s).toBe(false);
  });

  test("descarta lo que no es una señal usable", () => {
    expect(
      sanearSenales([
        null,
        undefined,
        "texto",
        42,
        {},
        { evento: "abrir_long", precio: 100 }, // sin hora
        { tiempoMs: 1, precio: 100 }, // sin evento
        { tiempoMs: 1, evento: "abrir_long" }, // sin precio
        { tiempoMs: 1, evento: "bailar", precio: 100 }, // evento inventado
        { tiempoMs: NaN, evento: "abrir_long", precio: 100 },
        { tiempoMs: 1, evento: "abrir_long", precio: Infinity },
      ]),
    ).toEqual([]);
  });

  test("descarta precios imposibles (0 o negativos)", () => {
    // caso real: un motor que emite la apertura mirando la posición ANTES de
    // cerrarla publica una señal con el precio de entrada ya limpiado a 0
    expect(
      sanearSenales([
        { tiempoMs: 1785247200000, evento: "abrir_short", precio: 0 },
        { tiempoMs: 1785247200000, evento: "abrir_long", precio: -5 },
      ]),
    ).toEqual([]);
  });

  test("una señal fantasma no arrastra a las buenas del mismo lote", () => {
    const limpias = sanearSenales([
      { tiempoMs: 1785247200000, evento: "abrir_short", precio: 63066.28 },
      { tiempoMs: 1785253500000, evento: "cerrar_short", precio: 64025.08, pnlUsd: -1.59 },
      { tiempoMs: 1785253500000, evento: "abrir_short", precio: 0 }, // la fantasma
    ]);
    expect(limpias).toHaveLength(2);
    expect(limpias.at(-1)!.evento).toBe("cerrar_short");
  });

  test("lo que no es un array da lista vacía, no una excepción", () => {
    expect(sanearSenales(null)).toEqual([]);
    expect(sanearSenales({ senales: [] })).toEqual([]);
    expect(sanearSenales("[]")).toEqual([]);
  });

  test("conserva el orden: buildOperaciones empareja recorriendo en secuencia", () => {
    const limpias = sanearSenales([
      { tiempoMs: 3, evento: "abrir_long", precio: 100 },
      { tiempoMs: 1, evento: "cerrar_long", precio: 110 },
      { tiempoMs: 2, evento: "abrir_short", precio: 105 },
    ]);
    expect(limpias.map((s) => s.tiempoMs)).toEqual([3, 1, 2]);
  });
});

describe("predicados del vocabulario", () => {
  test("esEventoSenal acepta los cuatro eventos y nada más", () => {
    for (const e of ["abrir_long", "abrir_short", "cerrar_long", "cerrar_short"]) {
      expect(esEventoSenal(e)).toBe(true);
    }
    expect(esEventoSenal("abrir")).toBe(false);
    expect(esEventoSenal("ABRIR_LONG")).toBe(false);
    expect(esEventoSenal(null)).toBe(false);
  });

  test("esApertura / esCierre parten el vocabulario en dos", () => {
    const s = (evento: string) => ({ tiempoMs: 1, precio: 1, evento }) as never;
    expect(esApertura(s("abrir_long"))).toBe(true);
    expect(esApertura(s("abrir_short"))).toBe(true);
    expect(esApertura(s("cerrar_long"))).toBe(false);
    expect(esCierre(s("cerrar_short"))).toBe(true);
    expect(esCierre(s("abrir_short"))).toBe(false);
  });
});
