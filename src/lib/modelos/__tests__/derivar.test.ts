import { describe, expect, test } from "bun:test";
import {
  MS_FRESCO,
  posicionParaGrafico,
  saludMotor,
  senalOperativa,
  vistaOperacion,
} from "../derivar";
import { adaptar, estadoCrudoV1 } from "./ayuda";

/**
 * derivar.ts es la regla de oro de la arquitectura: el motor publica HECHOS y
 * la interfaz calcula LECTURAS. Estos tests fijan esas cuentas, que son las
 * mismas para SAC, PPO y cualquier modelo futuro — si un modelo nuevo publica
 * los hechos del contrato, obtiene estas lecturas gratis.
 */

describe("senalOperativa", () => {
  const senal = (accion: number, posicion = "FLAT") =>
    senalOperativa(adaptar(estadoCrudoV1({ accion, posicion })));

  test("dentro de la zona muerta, estando plano, es MANTENER", () => {
    expect(senal(0.05)).toBe("MANTENER");
  });

  test("dentro de la zona muerta, con posición, es CERRAR", () => {
    expect(senal(0.05, "LONG")).toBe("CERRAR");
  });

  test("acción positiva fuera de la zona muerta, estando plano, es COMPRAR", () => {
    expect(senal(0.7)).toBe("COMPRAR");
  });

  test("acción negativa fuera de la zona muerta, estando plano, es VENDER", () => {
    expect(senal(-0.7)).toBe("VENDER");
  });

  test("pedir la posición que ya se tiene es MANTENER", () => {
    expect(senal(0.7, "LONG")).toBe("MANTENER");
    expect(senal(-0.7, "SHORT")).toBe("MANTENER");
  });

  test("pedir el lado contrario es dar vuelta la posición", () => {
    expect(senal(0.7, "SHORT")).toBe("COMPRAR");
    expect(senal(-0.7, "LONG")).toBe("VENDER");
  });

  test("un modelo de acciones discretas encaja publicando -1 / 0 / 1", () => {
    expect(senal(1)).toBe("COMPRAR");
    expect(senal(-1)).toBe("VENDER");
    expect(senal(0)).toBe("MANTENER");
  });
});

describe("vistaOperacion — PnL flotante", () => {
  const AHORA = 1785258100000;

  test("SHORT gana cuando el precio baja", () => {
    const e = adaptar(estadoCrudoV1({ posicion: "SHORT", precioEntrada: 64000, nocional: 1000 }));
    const v = vistaOperacion(e, 63360, AHORA); // −1 %
    expect(v.pnlNoRealizadoPct).toBeCloseTo(1, 6);
    expect(v.pnlNoRealizadoUsd).toBeCloseTo(10, 6);
  });

  test("LONG pierde cuando el precio baja", () => {
    const e = adaptar(estadoCrudoV1({ posicion: "LONG", precioEntrada: 64000, nocional: 1000 }));
    const v = vistaOperacion(e, 63360, AHORA);
    expect(v.pnlNoRealizadoPct).toBeCloseTo(-1, 6);
    expect(v.pnlNoRealizadoUsd).toBeCloseTo(-10, 6);
  });

  test("sin nocional publicado, equity − saldo ES el flotante", () => {
    const e = adaptar(
      estadoCrudoV1({
        posicion: "LONG",
        precioEntrada: 64000,
        nocional: undefined,
        equity: 498.09,
        saldo: 498.37,
      }),
    );
    expect(vistaOperacion(e, 63900, AHORA).pnlNoRealizadoUsd).toBeCloseTo(-0.28, 6);
  });

  test("estando FLAT no hay flotante", () => {
    const v = vistaOperacion(adaptar(estadoCrudoV1({ posicion: "FLAT" })), 64000, AHORA);
    expect(v.hayPosicion).toBe(false);
    expect(v.pnlNoRealizadoUsd).toBeNull();
    expect(v.duracionMs).toBeNull();
  });

  test("un motor en REPLAY ignora el precio de mercado de hoy", () => {
    // clave para PPO: su entrada es de hace dos años; medir contra el BTC de
    // ahora daría cientos de por ciento de PnL que no existen
    const e = adaptar(
      estadoCrudoV1({ enVivo: false, posicion: "LONG", precioEntrada: 30000, precio: 30300 }),
    );
    const v = vistaOperacion(e, 64000, AHORA);
    expect(v.precioActual).toBe(30300);
    expect(v.pnlNoRealizadoPct).toBeCloseTo(1, 6);
  });

  test("un motor EN VIVO prefiere el precio del feed al de su última vela", () => {
    const e = adaptar(estadoCrudoV1({ posicion: "LONG", precioEntrada: 64000, precio: 64100 }));
    expect(vistaOperacion(e, 64500, AHORA).precioActual).toBe(64500);
  });

  test("sin feed cae al precio del propio motor", () => {
    const e = adaptar(estadoCrudoV1({ posicion: "LONG", precio: 64100 }));
    expect(vistaOperacion(e, null, AHORA).precioActual).toBe(64100);
  });
});

describe("vistaOperacion — barreras y riesgo", () => {
  const AHORA = 1785258100000;

  test("riesgo/recompensa sale de las distancias reales a cada barrera", () => {
    const e = adaptar(
      estadoCrudoV1({
        posicion: "LONG",
        precioEntrada: 1000,
        stopLoss: 985, // riesgo 15
        takeProfit: 1030, // recompensa 30
      }),
    );
    expect(vistaOperacion(e, 1000, AHORA).riesgoRecompensa).toBeCloseTo(2, 6);
  });

  test("las distancias a SL/TP son positivas mientras no se tocaron (LONG)", () => {
    const e = adaptar(
      estadoCrudoV1({ posicion: "LONG", precioEntrada: 1000, stopLoss: 990, takeProfit: 1010 }),
    );
    const v = vistaOperacion(e, 1000, AHORA);
    expect(v.distanciaStopPct!).toBeGreaterThan(0);
    expect(v.distanciaTakePct!).toBeGreaterThan(0);
  });

  test("las distancias a SL/TP son positivas mientras no se tocaron (SHORT)", () => {
    const e = adaptar(
      estadoCrudoV1({ posicion: "SHORT", precioEntrada: 1000, stopLoss: 1010, takeProfit: 990 }),
    );
    const v = vistaOperacion(e, 1000, AHORA);
    expect(v.distanciaStopPct!).toBeGreaterThan(0);
    expect(v.distanciaTakePct!).toBeGreaterThan(0);
  });

  test("la distancia al stop se vuelve negativa una vez pasado", () => {
    const e = adaptar(estadoCrudoV1({ posicion: "LONG", precioEntrada: 1000, stopLoss: 990 }));
    expect(vistaOperacion(e, 985, AHORA).distanciaStopPct!).toBeLessThan(0);
  });

  test("sin barreras publicadas no se inventa un ratio", () => {
    const e = adaptar(
      estadoCrudoV1({ posicion: "LONG", stopLoss: undefined, takeProfit: undefined }),
    );
    const v = vistaOperacion(e, 64000, AHORA);
    expect(v.riesgoRecompensa).toBeNull();
    expect(v.distanciaStopPct).toBeNull();
  });

  test("el colchón hasta la liquidación es siempre positivo", () => {
    const e = adaptar(
      estadoCrudoV1({ posicion: "LONG", precioEntrada: 64000, precioLiquidacion: 58000 }),
    );
    expect(vistaOperacion(e, 64000, AHORA).distanciaLiquidacionPct!).toBeGreaterThan(0);
  });
});

describe("vistaOperacion — cronómetro", () => {
  test("en vivo mide contra el reloj de pared", () => {
    const e = adaptar(estadoCrudoV1({ posicion: "LONG", aperturaMs: 1785253800000 }));
    expect(vistaOperacion(e, null, 1785253800000 + 3600_000).duracionMs).toBe(3600_000);
  });

  test("en replay mide contra el reloj del MOTOR", () => {
    // con el reloj de pared una apertura histórica daría años de operación abierta
    const e = adaptar(
      estadoCrudoV1({
        enVivo: false,
        posicion: "LONG",
        aperturaMs: 1600000000000,
        ultimaVelaMs: 1600003600000,
      }),
    );
    expect(vistaOperacion(e, null, Date.now()).duracionMs).toBe(3600_000);
  });

  test("nunca es negativa aunque los relojes no coincidan", () => {
    const e = adaptar(estadoCrudoV1({ posicion: "LONG", aperturaMs: 2_000_000_000_000 }));
    expect(vistaOperacion(e, null, 1_000_000_000_000).duracionMs).toBe(0);
  });
});

describe("saludMotor", () => {
  const AHORA = 1785258100000;
  const conEdad = (ms: number, extra: Record<string, unknown> = {}) =>
    adaptar(estadoCrudoV1({ actualizadoMs: AHORA - ms, ...extra }));

  test("recién escrito: operando", () => {
    expect(saludMotor(conEdad(1000), AHORA)).toBe("operando");
  });

  test("pasado el umbral: atrasado", () => {
    expect(saludMotor(conEdad(MS_FRESCO + 1000), AHORA)).toBe("atrasado");
  });

  test("al doble del umbral: detenido, aunque el JSON siga diciendo 'operando'", () => {
    // es el caso del proceso muerto: el archivo se congela con estado=operando
    expect(saludMotor(conEdad(MS_FRESCO * 2 + 1000), AHORA)).toBe("detenido");
  });

  test("el estado 'error' manda sobre la frescura", () => {
    expect(saludMotor(conEdad(0, { estado: "error" }), AHORA)).toBe("error");
  });

  test("un motor lento con su propio umbral no se marca atrasado", () => {
    const UNA_HORA = 3600_000;
    const e = conEdad(30 * 60_000); // media hora: atrasadísimo para 5m
    expect(saludMotor(e, AHORA)).toBe("detenido");
    expect(saludMotor(e, AHORA, UNA_HORA)).toBe("operando");
  });
});

describe("posicionParaGrafico", () => {
  test("estando FLAT no hay nada que dibujar", () => {
    expect(posicionParaGrafico(adaptar(estadoCrudoV1({ posicion: "FLAT" })))).toBeNull();
    expect(posicionParaGrafico(null)).toBeNull();
  });

  test("traslada los hechos de la posición sin recalcular nada", () => {
    const e = adaptar(estadoCrudoV1());
    const p = posicionParaGrafico(e)!;
    expect(p.lado).toBe("short");
    expect(p.precioEntrada).toBe(e.precioEntrada);
    expect(p.stopLoss).toBe(e.stopLoss);
    expect(p.takeProfit).toBe(e.takeProfit);
    expect(p.nocional).toBe(e.nocional);
    expect(p.etiqueta).toBe(e.modeloEtiqueta);
    expect(p.esDemo).toBe(false);
  });

  test("un motor en vivo deja que el gráfico use su propio último precio", () => {
    expect(posicionParaGrafico(adaptar(estadoCrudoV1()))!.precioReferencia).toBeNull();
  });

  test("un motor en replay impone su precio de referencia", () => {
    const e = adaptar(estadoCrudoV1({ enVivo: false, precio: 30300 }));
    expect(posicionParaGrafico(e)!.precioReferencia).toBe(30300);
  });
});

describe("coherencia entre paneles", () => {
  test("la barra y el gráfico salen del MISMO estado, así que no pueden discrepar", () => {
    const e = adaptar(estadoCrudoV1());
    const barra = vistaOperacion(e, 64000, Date.now());
    const grafico = posicionParaGrafico(e)!;
    expect(grafico.precioEntrada).toBe(barra.precioEntrada);
    expect(grafico.stopLoss).toBe(barra.stopLoss);
    expect(grafico.takeProfit).toBe(barra.takeProfit);
    expect(grafico.nocional).toBe(barra.nocional);
    expect(grafico.lado as string).toBe(barra.lado.toLowerCase());
  });

  test("el PnL realizado usa el saldo del motor (incluye comisiones y funding)", () => {
    const e = adaptar(estadoCrudoV1({ saldo: 498.37, capitalInicial: 500 }));
    expect(vistaOperacion(e, 64000, Date.now()).pnlRealizadoUsd).toBeCloseTo(-1.63, 6);
  });
});
