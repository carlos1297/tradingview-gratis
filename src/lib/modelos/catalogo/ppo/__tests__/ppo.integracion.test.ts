import { describe, expect, test } from "bun:test";
import {
  adaptarFeedWebSocket,
  posicionParaGrafico,
  saludMotor,
  vistaOperacion,
  type EstadoModeloIA,
} from "@/lib/modelos/nucleo";
import { fuentePorId } from "../../../registro";
import crudo from "./fixtures/estado_ppo_v1_ws.json";

/**
 * Integración con el motor PPO real (transporte WebSocket).
 *
 * Hermano de integracion-sac.test.ts, con la otra mitad del contrato: SAC
 * publica un archivo completo por vela, PPO empuja un tick por WebSocket con
 * los eventos incrementales. Entre los dos cubren los dos transportes.
 *
 * El fixture NO está escrito a mano: es un tick literal de
 * `RL_PPO/modelo_PPO/motor_paper.py`, capturado de una corrida real. Sirve de
 * contrato ejecutable entre dos repos que no comparten build: si el motor deja
 * de publicar un campo, esto se pone rojo antes de que se note en el panel.
 *
 * Para regenerarlo tras un cambio deliberado del motor, en RL_PPO:
 *   pytest tests/test_contrato_visor.py -q     # valida contra el schema
 *   (y volver a capturar un tick con posición abierta)
 */

const fuente = { ...fuentePorId("ppo")!, url: "ws://127.0.0.1:8000/ws" };

describe("el visor entiende lo que publica el motor PPO", () => {
  const estado = adaptarFeedWebSocket(crudo, fuente, null) as EstadoModeloIA;

  test("la fuente PPO está registrada como transporte WebSocket", () => {
    expect(fuentePorId("ppo")!.transporte).toBe("websocket");
  });

  test("el tick se adapta sin perder identidad ni versión", () => {
    expect(estado).not.toBeNull();
    expect(estado.contrato).toBe(1);
    expect(estado.modeloId).toBe("ppo");
    expect(estado.modeloEtiqueta).toBe("PPO");
    expect(estado.simbolo).toBe("BTCUSDT");
    expect(estado.dineroReal).toBe(false);
    expect(estado.estado).toBe("operando");
  });

  test("publica el lado con el VOCABULARIO del contrato, no el entero del simulador", () => {
    // Es lo que permite consumirlo con el adaptador genérico: mientras el
    // motor mandaba -1/0/1, el visor necesitaba una traducción a medida.
    expect(crudo.posicion).toBe("LONG");
    expect(estado.posicion).toBe("LONG");
  });

  test("se declara en REPLAY, para que el panel no mida contra el BTC de hoy", () => {
    expect(estado.enVivo).toBe(false);
  });

  test("publica TODOS los hechos que el panel necesita — ninguno queda en '—'", () => {
    for (const campo of [
      "precioEntrada", "nocional", "apalancamiento", "stopLoss", "takeProfit",
      "precioLiquidacion", "saldo", "capitalInicial", "equity", "accion",
    ] as const) {
      expect(`${campo}=${estado[campo]}`).not.toBe(`${campo}=null`);
    }
  });

  test("la acción cruda respeta el rango del contrato", () => {
    expect(estado.accion).not.toBeNull();
    expect(Math.abs(estado.accion!)).toBeLessThanOrEqual(1);
    expect(estado.zonaMuerta).toBeGreaterThan(0);
  });

  test("el gráfico puede dibujar la operación con lo que llega", () => {
    const pos = posicionParaGrafico(estado);
    expect(pos).not.toBeNull();
    expect(pos!.lado).toBe("long");
    expect(pos!.precioEntrada).toBe(estado.precioEntrada);
    // replay ⇒ el PnL de la caja se mide contra el precio del MOTOR
    expect(pos!.precioReferencia).toBe(estado.precio);
    expect(pos!.aperturaMs).not.toBeNull();
    expect(Number.isFinite(pos!.aperturaMs!)).toBe(true);
  });

  test("las señales llegan fechadas en milisegundos: los marcadores no caen en 1970", () => {
    expect(estado.senales.length).toBeGreaterThan(0);
    for (const s of estado.senales) {
      expect(Number.isFinite(s.tiempoMs)).toBe(true);
      expect(s.tiempoMs).toBeGreaterThan(1_000_000_000_000);
    }
  });

  test("recién recibido, el semáforo lo da por vivo aunque el replay sea histórico", () => {
    // actualizadoMs es la hora de RECEPCIÓN, no el reloj del replay: si se
    // usara el del mensaje, el panel diría DETENIDO para siempre.
    expect(saludMotor(estado, Date.now(), fuente.msFresco)).toBe("operando");
  });

  test("el panel deriva la operación completa sin pedirle nada más al motor", () => {
    const v = vistaOperacion(estado, null, Date.now());
    expect(v.pnlNoRealizadoUsd).not.toBeNull();
    expect(v.pnlNoRealizadoPct).not.toBeNull();
    expect(v.riesgoRecompensa).not.toBeNull();
    expect(v.distanciaLiquidacionPct).not.toBeNull();
    expect(v.duracionMs).not.toBeNull();
    expect(["COMPRAR", "VENDER", "MANTENER", "CERRAR"]).toContain(v.senal);
  });

  test("los eventos incrementales se ACUMULAN sobre el estado previo", () => {
    const previo = adaptarFeedWebSocket(crudo, fuente, null) as EstadoModeloIA;
    const siguiente = adaptarFeedWebSocket(crudo, fuente, previo) as EstadoModeloIA;
    expect(siguiente.senales.length).toBe(previo.senales.length * 2);
  });

  test("un tick sin eventos nuevos no duplica ni pierde el historial", () => {
    const previo = adaptarFeedWebSocket(crudo, fuente, null) as EstadoModeloIA;
    const sinEventos = adaptarFeedWebSocket(
      { ...crudo, eventos: [] },
      fuente,
      previo,
    ) as EstadoModeloIA;
    expect(sinEventos.senales).toEqual(previo.senales);
  });
});
