import { adaptarContratoEstandar } from "../adaptadores";
import type { FuenteModelo } from "../tipos";

/** Fuente de prueba: no se conecta a nada, solo aporta los defaults del registro. */
export const FUENTE: FuenteModelo = {
  id: "test",
  etiqueta: "TEST",
  descripcion: "fuente de pruebas",
  color: "#000000",
  transporte: "archivo",
  url: "/estado_test.json",
  adaptar: adaptarContratoEstandar,
};

/**
 * Estado v1 COMPLETO, calcado del que publica modelo_SAC/operar_vivo.py.
 * Los tests parten de acá y sobrescriben solo lo que están probando.
 */
export function estadoCrudoV1(extra: Record<string, unknown> = {}) {
  return {
    contrato: 1,
    modeloId: "sac",
    modelo: "SAC",
    estado: "operando",
    simbolo: "BTCUSDT",
    posicion: "SHORT",
    precio: 64015.9,
    equity: 498.09,
    saldo: 498.37,
    capitalInicial: 500,
    accion: -0.2016,
    operaciones: 1,
    ultimaVelaMs: 1785258000000,
    precioEntrada: 63828.33,
    aperturaMs: 1785253800000,
    nocional: 93.81,
    stopLoss: 64785.76,
    takeProfit: 61913.48,
    apalancamiento: 10,
    zonaMuerta: 0.1,
    comisiones: 0.12,
    funding: -0.0001,
    checkpoint: "mejor",
    dineroReal: false,
    actualizadoMs: 1785258008703,
    senales: [
      { tiempoMs: 1785247200000, evento: "abrir_short", precio: 63066.28 },
      {
        tiempoMs: 1785253500000,
        evento: "cerrar_short",
        precio: 64025.08,
        motivo: "stop_loss",
        pnlUsd: -1.5948,
      },
      { tiempoMs: 1785253500000, evento: "abrir_short", precio: 63828.33 },
    ],
    ...extra,
  };
}

/** Adapta con la fuente de prueba y falla el test si devuelve null. */
export function adaptar(crudo: unknown) {
  const e = adaptarContratoEstandar(crudo, FUENTE);
  if (!e) throw new Error("el adaptador devolvió null");
  return e;
}
