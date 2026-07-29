import { beforeEach, describe, expect, test } from "bun:test";
import { useModelosStore } from "@/lib/store/modelos-store";
import { motorSinVida, pnlFlotante, posicionParaGrafico, vistaOperacion } from "../derivar";
import { MS_FRESCO_POR_DEFECTO } from "../tipos";
import { adaptar, estadoCrudoV1 } from "./ayuda";

/**
 * Dos reglas que la interfaz rompía y que estos tests fijan:
 *
 *  1. El PnL flotante sale de UNA sola fórmula y de UN solo precio de mercado.
 *     Antes cada panel elegía el suyo (el feed en vivo, el precio del motor, el
 *     cierre de la última vela de cada temporalidad), así que el mismo trade
 *     mostraba porcentajes distintos según dónde lo miraras.
 *
 *  2. Un motor que dejó de publicar no tiene operaciones que mostrar. Su JSON
 *     queda en disco diciendo "operando" y el visor lo servía indefinidamente
 *     como si hubiera una IA conectada.
 */

const AHORA = 1785258100000;

describe("un solo precio de mercado para el PnL", () => {
  test("la caja del gráfico y la barra dan exactamente el mismo número", () => {
    const e = adaptar(estadoCrudoV1());
    const PRECIO_MERCADO = 64000;

    const barra = vistaOperacion(e, PRECIO_MERCADO, AHORA);
    const pos = posicionParaGrafico(e)!;
    // Lo que hace ChartLigero al pintar la operación.
    const caja = pnlFlotante("SHORT", pos.precioEntrada, PRECIO_MERCADO, pos.nocional);

    expect(caja.pct).toBe(barra.pnlNoRealizadoPct);
    expect(caja.usd).toBe(barra.pnlNoRealizadoUsd);
  });

  test("el porcentaje depende SOLO del precio de mercado, no de la vela de cada ventana", () => {
    const e = adaptar(estadoCrudoV1());
    const pos = posicionParaGrafico(e)!;
    const PRECIO_MERCADO = 64000;

    // Antes cada ventana medía contra el cierre de su última vela: la de 1m y
    // la de 5m no cierran en el mismo instante (y una restaurada del caché
    // arranca con una vela vieja), así que salían dos porcentajes distintos.
    const cierre1m = 63990.4;
    const cierre5m = 64012.7;
    const viejo = (cierre: number) => -1 * (cierre / pos.precioEntrada! - 1) * 100;
    expect(viejo(cierre1m)).not.toBeCloseTo(viejo(cierre5m), 6);

    // Con el precio compartido las dos ventanas convergen al mismo valor.
    const ventana1m = pnlFlotante("SHORT", pos.precioEntrada, PRECIO_MERCADO, pos.nocional);
    const ventana5m = pnlFlotante("SHORT", pos.precioEntrada, PRECIO_MERCADO, pos.nocional);
    expect(ventana1m.pct).toBe(ventana5m.pct);
  });

  test("el precio del motor y el de mercado no son lo mismo (por eso el Probador ya no usa el primero)", () => {
    // `estado.precio` es lo último que vio el motor: hasta 5 minutos de atraso,
    // o congelado para siempre si el proceso murió.
    const e = adaptar(estadoCrudoV1({ precio: 64015.9 }));
    const conElPrecioDelMotor = vistaOperacion(e, null, AHORA);
    const conElDeMercado = vistaOperacion(e, 63500, AHORA);

    expect(conElPrecioDelMotor.precioActual).toBe(64015.9);
    expect(conElDeMercado.precioActual).toBe(63500);
    expect(conElDeMercado.pnlNoRealizadoPct).not.toBe(conElPrecioDelMotor.pnlNoRealizadoPct);
  });

  test("en replay manda el precio del motor: el feed en vivo se sigue ignorando", () => {
    const e = adaptar(estadoCrudoV1({ enVivo: false, precio: 30000 }));
    expect(vistaOperacion(e, 64000, AHORA).precioActual).toBe(30000);
  });

  test("sin posición o sin entrada no hay PnL que mostrar", () => {
    expect(pnlFlotante("FLAT", 63828.33, 64000, 93.81)).toEqual({ pct: null, usd: null });
    expect(pnlFlotante("LONG", null, 64000, 93.81)).toEqual({ pct: null, usd: null });
    expect(pnlFlotante("LONG", 63828.33, null, 93.81)).toEqual({ pct: null, usd: null });
    // sin nocional publicado queda el porcentaje, no el dinero
    const sinNocional = pnlFlotante("LONG", 100, 110, null);
    expect(sinNocional.pct).toBeCloseTo(10, 6);
    expect(sinNocional.usd).toBeNull();
  });

  test("el signo respeta el lado", () => {
    expect(pnlFlotante("LONG", 100, 110, 1000).pct).toBeCloseTo(10, 6);
    expect(pnlFlotante("SHORT", 100, 110, 1000).pct).toBeCloseTo(-10, 6);
    expect(pnlFlotante("SHORT", 100, 90, 1000).usd).toBeCloseTo(100, 6);
  });
});

describe("un motor sin señales de vida sale de la interfaz", () => {
  const conEdad = (ms: number, extra: Record<string, unknown> = {}) =>
    adaptar(estadoCrudoV1({ actualizadoMs: AHORA - ms, ...extra }));

  test("recién publicado: se queda", () => {
    expect(motorSinVida(conEdad(1000), AHORA)).toBe(false);
  });

  test("atrasado pero por debajo del doble de msFresco: se queda", () => {
    // El umbral elegido es DETENIDO (2×), no ATRASADO: un motor que tarda un
    // tick de más no puede hacer parpadear la operación del gráfico.
    expect(motorSinVida(conEdad(MS_FRESCO_POR_DEFECTO + 1000), AHORA)).toBe(false);
  });

  test("pasado el doble de msFresco: se va", () => {
    expect(motorSinVida(conEdad(MS_FRESCO_POR_DEFECTO * 2 + 1000), AHORA)).toBe(true);
  });

  test("un estado_vivo.json de ayer: se va", () => {
    // El caso real: el archivo queda en public/ después de la corrida y Next lo
    // sirve con 200 para siempre, así que el 404 nunca llega.
    expect(motorSinVida(conEdad(13 * 60 * 60 * 1000), AHORA)).toBe(true);
  });

  test("el motor avisa que se detuvo: se va en el acto", () => {
    expect(motorSinVida(conEdad(1000, { estado: "detenido" }), AHORA)).toBe(true);
  });

  test("un error reciente NO lo saca: el motor sigue publicando y tiene algo que decir", () => {
    expect(motorSinVida(conEdad(1000, { estado: "error", mensaje: "timeout" }), AHORA)).toBe(
      false,
    );
  });

  test("un error viejo sí lo saca: el semáforo no puede taparlo para siempre", () => {
    const viejo = conEdad(13 * 60 * 60 * 1000, { estado: "error", mensaje: "timeout" });
    expect(motorSinVida(viejo, AHORA)).toBe(true);
  });

  test("cada fuente se juzga con su propio msFresco", () => {
    const e = conEdad(20 * 60 * 1000); // 20 minutos
    expect(motorSinVida(e, AHORA, MS_FRESCO_POR_DEFECTO)).toBe(true); // motor de 5m
    expect(motorSinVida(e, AHORA, 65 * 60 * 1000)).toBe(false); // motor de barras horarias
  });
});

/**
 * El parpadeo: el sondeo del archivo (cada 5 s) republicaba un estado que el
 * barrido (cada 1 s) acababa de retirar, así que el modelo aparecía y
 * desaparecía en bucle — y con él se recargaban los gráficos, porque
 * `modelSignals` cambiaba en cada vuelta.
 */
describe("un archivo viejo no puede resucitar al modelo", () => {
  const store = () => useModelosStore.getState();
  const viejo = () =>
    adaptar(estadoCrudoV1({ actualizadoMs: Date.now() - 13 * 60 * 60 * 1000 }));
  const fresco = () => adaptar(estadoCrudoV1({ actualizadoMs: Date.now() }));

  /** Lo que hace `useFuente.onDatos` con cada lectura de la fuente. */
  const recibir = (id: string, estado: ReturnType<typeof viejo>) => {
    if (motorSinVida(estado, Date.now())) {
      store().quitarModelo(id);
      return;
    }
    store().publicarEstado(id, estado);
  };

  beforeEach(() => {
    useModelosStore.setState({ estados: {}, modeloActivo: null, disponibles: [] });
  });

  test("leer el archivo viejo veinte veces no lo publica ni una", () => {
    for (let i = 0; i < 20; i++) recibir("sac", viejo());
    expect(store().disponibles).toEqual([]);
    expect(store().modeloActivo).toBeNull();
    expect(store().estados.sac).toBeUndefined();
  });

  test("quitar un modelo que ya no está no cambia la referencia del store", () => {
    // Si devolviera un objeto nuevo, el barrido de 1 s re-renderizaría a todos
    // los suscriptores para siempre sin cambiar nada.
    store().publicarEstado("sac", fresco());
    store().quitarModelo("sac");
    const despuesDelPrimero = useModelosStore.getState();

    store().quitarModelo("sac");
    store().quitarModelo("sac");
    expect(useModelosStore.getState()).toBe(despuesDelPrimero);
  });

  test("el motor que vuelve a la vida reaparece", () => {
    recibir("sac", viejo());
    expect(store().disponibles).toEqual([]);

    recibir("sac", fresco()); // arrancaron el motor de nuevo
    expect(store().disponibles).toEqual(["sac"]);
    expect(store().modeloActivo).toBe("sac");
  });

  test("un apagado limpio retira el modelo en el acto, sin esperar los 12 minutos", () => {
    recibir("sac", fresco());
    expect(store().disponibles).toEqual(["sac"]);

    // El motor escribe su último estado al terminar: `estado: "detenido"`, con
    // marca de tiempo de recién. Sin el guardia en la publicación, el estado
    // anterior seguía en el store hasta envejecer el doble de msFresco.
    recibir("sac", adaptar(estadoCrudoV1({ estado: "detenido", actualizadoMs: Date.now() })));
    expect(store().disponibles).toEqual([]);
    expect(store().modeloActivo).toBeNull();
  });
});
