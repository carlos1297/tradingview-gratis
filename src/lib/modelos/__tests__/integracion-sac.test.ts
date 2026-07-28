import { describe, expect, test } from "bun:test";
import { adaptarContratoEstandar } from "../adaptadores";
import { posicionParaGrafico, saludMotor, vistaOperacion } from "../derivar";
import { fuentePorId } from "../registro";
import { buildOperaciones } from "@/lib/trades";
import crudo from "./fixtures/estado_sac_v1.json";

/**
 * Integración con el motor SAC real.
 *
 * El fixture NO está escrito a mano: es una captura literal de lo que publicó
 * `modelo_SAC/operar_vivo.py` corriendo contra Binance. Sirve de contrato
 * ejecutable entre los dos proyectos, que viven en repos separados y no
 * comparten build: si el motor deja de publicar un campo, o el visor cambia
 * cómo lo lee, esto se pone rojo antes de que alguien lo note mirando el panel.
 *
 * Para actualizarlo tras un cambio deliberado del motor:
 *   cp public/estado_vivo.json src/lib/modelos/__tests__/fixtures/estado_sac_v1.json
 */

const AHORA = 1785273673095 + 30_000; // 30 s después de la captura

describe("el visor entiende lo que publica el motor SAC", () => {
  const fuente = fuentePorId("sac")!;
  const estado = adaptarContratoEstandar(crudo, fuente)!;

  test("la fuente SAC está registrada como transporte de archivo", () => {
    expect(fuente.transporte).toBe("archivo");
    expect(fuente.url).toBe("/estado_vivo.json");
  });

  test("el estado se adapta sin perder identidad ni versión", () => {
    expect(estado).not.toBeNull();
    expect(estado.contrato).toBe(1);
    expect(estado.modeloId).toBe("sac");
    expect(estado.modeloEtiqueta).toBe("SAC");
    expect(estado.simbolo).toBe("BTCUSDT");
    expect(estado.dineroReal).toBe(false);
  });

  test("recién publicado, el semáforo lo da por vivo", () => {
    expect(saludMotor(estado, AHORA, fuente.msFresco)).toBe("operando");
  });

  test("publica TODOS los hechos que el panel necesita — ninguno queda en '—'", () => {
    // cada uno alimenta una celda de la barra: si el motor deja de mandarlo,
    // la celda se vacía en silencio y nadie se entera
    const obligatorios = {
      precio: estado.precio,
      precioEntrada: estado.precioEntrada,
      aperturaMs: estado.aperturaMs,
      nocional: estado.nocional,
      apalancamiento: estado.apalancamiento,
      stopLoss: estado.stopLoss,
      takeProfit: estado.takeProfit,
      precioLiquidacion: estado.precioLiquidacion,
      accion: estado.accion,
      saldo: estado.saldo,
      equity: estado.equity,
      capitalInicial: estado.capitalInicial,
      comisiones: estado.comisiones,
      funding: estado.funding,
      checkpoint: estado.checkpoint,
    };
    for (const [campo, valor] of Object.entries(obligatorios)) {
      expect(`${campo}=${valor}`).not.toBe(`${campo}=null`);
    }
    expect(estado.enVivo).toBe(true); // reloj de pared, no replay
    expect(estado.zonaMuerta).toBeGreaterThan(0);
  });

  test("las lecturas derivadas salen todas con valor", () => {
    const v = vistaOperacion(estado, 63950, AHORA);
    expect(v.hayPosicion).toBe(true);
    expect(v.lado).toBe("SHORT");
    expect(v.pnlNoRealizadoUsd).not.toBeNull();
    expect(v.pnlNoRealizadoPct).not.toBeNull();
    expect(v.riesgoRecompensa).not.toBeNull();
    expect(v.distanciaStopPct).not.toBeNull();
    expect(v.distanciaTakePct).not.toBeNull();
    expect(v.distanciaLiquidacionPct).not.toBeNull();
    expect(v.duracionMs).not.toBeNull();
    expect(v.confianza).toBeGreaterThan(0);
  });

  test("el riesgo/recompensa refleja el 1:2 de la configuración del motor", () => {
    // stopLossPct 1.5% y takeProfitPct 3.0% en rl_trading/configuracion.py
    const v = vistaOperacion(estado, estado.precioEntrada, AHORA);
    expect(v.riesgoRecompensa).toBeCloseTo(2, 1);
  });

  test("la liquidación queda del lado correcto de la entrada (SHORT: arriba)", () => {
    expect(estado.precioLiquidacion!).toBeGreaterThan(estado.precioEntrada!);
    expect(estado.stopLoss!).toBeGreaterThan(estado.precioEntrada!);
    expect(estado.takeProfit!).toBeLessThan(estado.precioEntrada!);
    // y el stop se toca ANTES que la liquidación: es la invariante que valida
    // Configuracion.validar() del lado del motor
    expect(estado.stopLoss!).toBeLessThan(estado.precioLiquidacion!);
  });

  test("el gráfico dibuja exactamente lo mismo que muestra la barra", () => {
    const v = vistaOperacion(estado, 63950, AHORA);
    const g = posicionParaGrafico(estado)!;
    expect(g.lado).toBe("short");
    expect(g.precioEntrada).toBe(v.precioEntrada);
    expect(g.stopLoss).toBe(v.stopLoss);
    expect(g.takeProfit).toBe(v.takeProfit);
    expect(g.nocional).toBe(v.nocional);
    expect(g.precioReferencia).toBeNull(); // en vivo: manda el feed del gráfico
  });

  test("las señales alimentan el Probador sin contar la operación abierta", () => {
    expect(estado.senales.length).toBeGreaterThan(0);
    const cerradas = buildOperaciones(estado.senales);
    // el fixture tiene una apertura sin cierre: es la operación viva
    expect(cerradas.length).toBe(estado.senales.length - 1);
  });
});

describe("avisos de ciclo de vida del motor", () => {
  const fuente = fuentePorId("sac")!;

  test("un error conserva el contexto en vez de vaciar el panel", () => {
    // así lo publica escribirAviso(): el último estado bueno + estado/mensaje
    const conError = { ...crudo, estado: "error", mensaje: "timeout de Binance" };
    const estado = adaptarContratoEstandar(conError, fuente)!;
    expect(saludMotor(estado, AHORA, fuente.msFresco)).toBe("error");
    expect(estado.mensaje).toBe("timeout de Binance");
    // …y la posición sigue dibujándose: hay riesgo vivo que mirar
    expect(posicionParaGrafico(estado)).not.toBeNull();
    expect(estado.senales.length).toBeGreaterThan(0);
  });

  test("un aviso de arranque sin estado previo no inventa una posición", () => {
    const arrancando = {
      contrato: 1, modeloId: "sac", modelo: "SAC", estado: "arrancando",
      mensaje: "cargando modelo y datos", dineroReal: false, actualizadoMs: AHORA,
    };
    const estado = adaptarContratoEstandar(arrancando, fuente)!;
    expect(saludMotor(estado, AHORA, fuente.msFresco)).toBe("arrancando");
    expect(estado.posicion).toBe("FLAT");
    expect(posicionParaGrafico(estado)).toBeNull();
    expect(estado.senales).toEqual([]);
  });
});
