import { describe, expect, test } from "bun:test";
import { adaptarContratoEstandar, adaptarFeedWebSocket } from "../adaptadores";
import { adaptar, estadoCrudoV1, FUENTE } from "./ayuda";

/**
 * Los adaptadores son la frontera entre un proceso externo y la interfaz.
 * Todo lo que entra por acá es DESCONOCIDO: puede venir de un motor con un
 * bug, de una versión vieja o de un archivo a medio escribir. Estos tests
 * fijan la promesa del contrato: siempre sale un EstadoModeloIA completo, o
 * null, pero nunca una excepción ni un campo `undefined`.
 */

describe("adaptarContratoEstandar — contrato v1", () => {
  test("traduce el estado real que publica el motor SAC", () => {
    const e = adaptar(estadoCrudoV1());
    expect(e.contrato).toBe(1);
    expect(e.modeloId).toBe("sac");
    expect(e.modeloEtiqueta).toBe("SAC");
    expect(e.estado).toBe("operando");
    expect(e.posicion).toBe("SHORT");
    expect(e.precioEntrada).toBe(63828.33);
    expect(e.stopLoss).toBe(64785.76);
    expect(e.takeProfit).toBe(61913.48);
    expect(e.nocional).toBe(93.81);
    expect(e.zonaMuerta).toBe(0.1);
    expect(e.senales).toHaveLength(3);
  });

  test("los campos opcionales que el motor no publica salen null, nunca undefined", () => {
    const e = adaptar(estadoCrudoV1());
    // el fixture omite estos tres, como haría un motor que no los calcula:
    // el panel muestra "—" en vez de inventar un valor
    expect(e.precioLiquidacion).toBeNull();
    expect(e.regimen).toBeNull();
    expect(e.motivoRiesgo).toBeNull();
    // y ninguna clave del contrato puede quedar undefined
    for (const [clave, valor] of Object.entries(e)) {
      expect(`${clave}=${valor}`).not.toBe(`${clave}=undefined`);
    }
  });

  test("FLAT anula toda la posición aunque el motor mande datos viejos", () => {
    const e = adaptar(estadoCrudoV1({ posicion: "FLAT" }));
    expect(e.precioEntrada).toBeNull();
    expect(e.aperturaMs).toBeNull();
    expect(e.nocional).toBeNull();
    expect(e.stopLoss).toBeNull();
    expect(e.takeProfit).toBeNull();
  });

  test("un `estado` desconocido cae a error en vez de propagarse", () => {
    expect(adaptar(estadoCrudoV1({ estado: "bailando" })).estado).toBe("error");
  });

  test("un `posicion` desconocido cae a FLAT", () => {
    expect(adaptar(estadoCrudoV1({ posicion: "LARGO" })).posicion).toBe("FLAT");
  });

  test("el símbolo se normaliza a mayúsculas", () => {
    expect(adaptar(estadoCrudoV1({ simbolo: "ethusdt" })).simbolo).toBe("ETHUSDT");
  });

  test("sin identidad propia hereda la del registro", () => {
    const e = adaptar(estadoCrudoV1({ modeloId: undefined, modelo: undefined }));
    expect(e.modeloId).toBe(FUENTE.id);
    expect(e.modeloEtiqueta).toBe(FUENTE.etiqueta);
  });

  test("descarta señales corruptas sin tirar el resto", () => {
    const e = adaptar(
      estadoCrudoV1({
        senales: [
          { tiempoMs: 1, evento: "abrir_long", precio: 100 },
          null,
          { tiempoMs: "ayer", evento: "cerrar_long", precio: 110 }, // hora inválida
          { tiempoMs: 3, evento: "teletransportar", precio: 120 }, // evento inválido
          { tiempoMs: 4, evento: "cerrar_long", precio: 130, pnlUsd: 30 },
        ],
      }),
    );
    expect(e.senales).toHaveLength(2);
    expect(e.senales.map((s) => s.evento)).toEqual(["abrir_long", "cerrar_long"]);
  });

  test("entradas no-objeto devuelven null sin lanzar", () => {
    for (const basura of [null, undefined, 42, "texto", [], true]) {
      expect(adaptarContratoEstandar(basura, FUENTE)).toBeNull();
    }
  });
});

describe("adaptarContratoEstandar — legado v0", () => {
  /** v0 = el JSON de antes de publicar la posición detallada. */
  function crudoV0() {
    const { contrato, aperturaMs, nocional, stopLoss, takeProfit, zonaMuerta, ...resto } =
      estadoCrudoV1();
    void contrato;
    void aperturaMs;
    void nocional;
    void stopLoss;
    void takeProfit;
    void zonaMuerta;
    return resto;
  }

  test("un motor sin versionar se lee como contrato 0", () => {
    expect(adaptar(crudoV0()).contrato).toBe(0);
  });

  test("deduce la apertura desde la última señal sin cierre posterior", () => {
    // la última señal del fixture es una apertura: esa es la operación viva
    expect(adaptar(crudoV0()).aperturaMs).toBe(1785253500000);
  });

  test("sin zonaMuerta publicada usa el default del Risk Engine (0.1)", () => {
    expect(adaptar(crudoV0()).zonaMuerta).toBe(0.1);
  });

  test("sin actualizadoMs asume ahora, para que el semáforo no lo dé por muerto", () => {
    const antes = Date.now();
    const e = adaptar({ ...crudoV0(), actualizadoMs: undefined });
    expect(e.actualizadoMs).toBeGreaterThanOrEqual(antes);
  });

  test("sin enVivo se asume reloj de pared (compatibilidad)", () => {
    expect(adaptar(crudoV0()).enVivo).toBe(true);
  });
});

describe("adaptarFeedWebSocket — transporte incremental", () => {
  const mensaje = (extra: Record<string, unknown> = {}) => ({
    tipo: "estado",
    contrato: 1,
    precio: 64000,
    equity: 1010,
    posicion: -1,
    eventos: [],
    ...extra,
  });

  test("ignora mensajes que no son de estado", () => {
    expect(adaptarFeedWebSocket({ tipo: "fin" }, FUENTE, null)).toBeNull();
    expect(adaptarFeedWebSocket({ tipo: "error", mensaje: "x" }, FUENTE, null)).toBeNull();
  });

  test("acumula los eventos nuevos sobre el estado previo", () => {
    const t1 = adaptarFeedWebSocket(
      mensaje({ eventos: [{ tiempoMs: 1, evento: "abrir_long", precio: 100 }] }),
      FUENTE,
      null,
    )!;
    expect(t1.senales).toHaveLength(1);

    const t2 = adaptarFeedWebSocket(
      mensaje({
        eventos: [{ tiempoMs: 2, evento: "cerrar_long", precio: 110, pnlUsd: 10 }],
      }),
      FUENTE,
      t1,
    )!;
    expect(t2.senales).toHaveLength(2);

    // un tick sin eventos no duplica ni pierde nada
    const t3 = adaptarFeedWebSocket(mensaje(), FUENTE, t2)!;
    expect(t3.senales).toHaveLength(2);
  });

  test("la posición numérica se traduce al lado del contrato", () => {
    expect(adaptarFeedWebSocket(mensaje({ posicion: 1 }), FUENTE, null)!.posicion).toBe("LONG");
    expect(adaptarFeedWebSocket(mensaje({ posicion: -1 }), FUENTE, null)!.posicion).toBe("SHORT");
    expect(adaptarFeedWebSocket(mensaje({ posicion: 0 }), FUENTE, null)!.posicion).toBe("FLAT");
  });

  test("actualizadoMs es SIEMPRE el reloj local, no el del mensaje", () => {
    // en replay el tiempoMs es histórico: usarlo dejaría el semáforo en DETENIDO
    const antes = Date.now();
    const e = adaptarFeedWebSocket(mensaje({ tiempoMs: 1600000000000 }), FUENTE, null)!;
    expect(e.actualizadoMs).toBeGreaterThanOrEqual(antes);
  });

  test("v0: reconstruye la entrada y le devuelve el signo a la confianza", () => {
    const previo = adaptarFeedWebSocket(
      { tipo: "estado", posicion: 0, eventos: [] },
      FUENTE,
      null,
    )!;
    const e = adaptarFeedWebSocket(
      {
        tipo: "estado",
        posicion: -1,
        confianza: 0.8, // v0 manda magnitud sin signo
        eventos: [{ tiempoMs: 5, evento: "abrir_short", precio: 63000 }],
      },
      FUENTE,
      previo,
    )!;
    expect(e.precioEntrada).toBe(63000);
    expect(e.accion).toBe(-0.8);
  });

  test("v0: cuenta las operaciones cerradas si el motor no las publica", () => {
    const e = adaptarFeedWebSocket(
      {
        tipo: "estado",
        posicion: 0,
        eventos: [
          { tiempoMs: 1, evento: "abrir_long", precio: 100 },
          { tiempoMs: 2, evento: "cerrar_long", precio: 110, pnlUsd: 10 },
        ],
      },
      FUENTE,
      null,
    )!;
    expect(e.operaciones).toBe(1);
  });
});

/**
 * El vocabulario del lado es el punto donde los dos transportes solían
 * discrepar: el de archivo esperaba la palabra del contrato y el de WebSocket
 * el entero firmado del simulador. Un motor que cumplía el contrato al pie de
 * la letra y hablaba por WebSocket aparecía SIEMPRE plano, sin ningún error a
 * la vista. Ahora los dos aceptan las dos formas.
 */
describe("lado de la posición — vocabulario canónico y legado", () => {
  const porWs = (posicion: unknown) =>
    adaptarFeedWebSocket({ tipo: "estado", posicion }, FUENTE, null)!.posicion;
  const porArchivo = (posicion: unknown) => adaptar(estadoCrudoV1({ posicion })).posicion;

  test("WebSocket acepta la palabra del contrato", () => {
    expect(porWs("LONG")).toBe("LONG");
    expect(porWs("SHORT")).toBe("SHORT");
    expect(porWs("FLAT")).toBe("FLAT");
  });

  test("WebSocket sigue aceptando el entero firmado de un motor v0", () => {
    expect(porWs(1)).toBe("LONG");
    expect(porWs(-1)).toBe("SHORT");
    expect(porWs(0)).toBe("FLAT");
  });

  test("archivo acepta las dos formas por igual", () => {
    expect(porArchivo("LONG")).toBe("LONG");
    expect(porArchivo(-1)).toBe("SHORT");
  });

  test("lo que no se entiende es FLAT: no se inventa un lado", () => {
    for (const basura of ["comprado", "", null, undefined, NaN, {}, []]) {
      expect(porWs(basura)).toBe("FLAT");
    }
  });

  test("con la palabra canónica el signo de la acción v0 sigue siendo correcto", () => {
    const e = adaptarFeedWebSocket(
      { tipo: "estado", posicion: "SHORT", confianza: 0.8 },
      FUENTE,
      null,
    )!;
    expect(e.accion).toBe(-0.8);
  });
});
