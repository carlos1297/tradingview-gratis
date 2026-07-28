import type { ModelSignal } from "@/lib/store/chart-store";
import {
  CONTRATO_ACTUAL,
  type EstadoModeloIA,
  type EstadoMotor,
  type FuenteModelo,
  type LadoPosicion,
} from "./tipos";

/**
 * adaptadores.ts — Traducen el JSON crudo de cada motor al contrato canónico.
 *
 * Toda la tolerancia a formatos viejos vive acá. Los componentes reciben
 * siempre un `EstadoModeloIA` completo, con `null` explícito donde el motor
 * todavía no publica un dato — nunca `undefined` ni campos ausentes.
 */

/**
 * Zona muerta por defecto: |accion| < 0.1 = quedarse plano. Es el valor de
 * ZONA_MUERTA en rl_trading/riesgo.py. Solo se usa si el motor no lo publica
 * (contrato v0); en cuanto lo publica, manda el del motor.
 */
const ZONA_MUERTA_POR_DEFECTO = 0.1;

const ESTADOS: EstadoMotor[] = ["arrancando", "operando", "detenido", "error"];
const LADOS: LadoPosicion[] = ["LONG", "SHORT", "FLAT"];

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function señales(v: unknown): ModelSignal[] {
  return Array.isArray(v) ? (v as ModelSignal[]) : [];
}

/**
 * Momento de apertura de la posición vigente, reconstruido desde las señales.
 *
 * Los motores con contrato v0 no publican `aperturaMs`, pero sí la lista de
 * aperturas/cierres: la última apertura sin cierre posterior ES la operación
 * abierta. Se reutiliza el mismo recorrido que hace buildOperaciones() en
 * lib/trades.ts, en vez de pedirle al motor un dato que ya está implícito.
 */
export function aperturaDesdeSenales(senales: ModelSignal[]): number | null {
  let abierta: number | null = null;
  for (const s of senales) {
    if (s.evento === "abrir_long" || s.evento === "abrir_short") {
      // `num` y no `s.tiempoMs` directo: un motor viejo podía emitir la
      // apertura sin hora, y devolver `undefined` acá se propagaba como NaN
      // al cronómetro de la operación y al ancla del marcador en el gráfico.
      abierta = num(s.tiempoMs);
    } else {
      abierta = null;
    }
  }
  return abierta;
}

/**
 * Adaptador del contrato estándar (v1) y de su versión legada (v0).
 *
 * v0 es el `estado_vivo.json` que escribe modelo_SAC/operar_vivo.py antes de
 * publicar posición detallada: no trae `nocional`, `stopLoss`, `takeProfit`
 * ni `aperturaMs`. Se completan con `null` (la interfaz muestra "—") salvo
 * `aperturaMs`, que se deduce de las señales. Un motor nuevo debería publicar
 * v1 directo y reutilizar este mismo adaptador.
 */
export function adaptarContratoEstandar(
  crudo: unknown,
  fuente: FuenteModelo,
): EstadoModeloIA | null {
  if (!crudo || typeof crudo !== "object") return null;
  const j = crudo as Record<string, unknown>;

  const estado = ESTADOS.includes(j.estado as EstadoMotor)
    ? (j.estado as EstadoMotor)
    : "error";
  const posicion = LADOS.includes(j.posicion as LadoPosicion)
    ? (j.posicion as LadoPosicion)
    : "FLAT";
  const lista = señales(j.senales);

  return {
    contrato: num(j.contrato) ?? 0,
    modeloId: texto(j.modeloId) ?? fuente.id,
    // el motor puede identificarse ("SAC"); si no, manda el registro
    modeloEtiqueta: texto(j.modelo) ?? texto(j.modeloEtiqueta) ?? fuente.etiqueta,

    estado,
    mensaje: texto(j.mensaje),
    simbolo: (texto(j.simbolo) ?? "BTCUSDT").toUpperCase(),
    dineroReal: j.dineroReal === true,
    checkpoint: texto(j.checkpoint),

    precio: num(j.precio),
    ultimaVelaMs: num(j.ultimaVelaMs),
    // sin marca de tiempo el semáforo no puede juzgar frescura: se asume ahora
    actualizadoMs: num(j.actualizadoMs) ?? Date.now(),
    // un motor que no se declara asume reloj de pared: es lo que hacía la
    // interfaz antes de que existiera el campo, así que nada cambia para SAC
    enVivo: j.enVivo !== false,

    capitalInicial: num(j.capitalInicial),
    saldo: num(j.saldo),
    equity: num(j.equity),

    posicion,
    precioEntrada: posicion === "FLAT" ? null : num(j.precioEntrada),
    aperturaMs:
      posicion === "FLAT" ? null : (num(j.aperturaMs) ?? aperturaDesdeSenales(lista)),
    nocional: posicion === "FLAT" ? null : num(j.nocional),
    apalancamiento: num(j.apalancamiento),
    stopLoss: posicion === "FLAT" ? null : num(j.stopLoss),
    takeProfit: posicion === "FLAT" ? null : num(j.takeProfit),
    precioLiquidacion: posicion === "FLAT" ? null : num(j.precioLiquidacion),

    accion: num(j.accion),
    zonaMuerta: num(j.zonaMuerta) ?? ZONA_MUERTA_POR_DEFECTO,
    regimen: texto(j.regimen),
    motivoRiesgo: texto(j.motivoRiesgo),

    operaciones: num(j.operaciones) ?? 0,
    comisiones: num(j.comisiones),
    funding: num(j.funding),
    senales: lista,
  };
}

/**
 * Adaptador del servicio de paper trading por WebSocket (modelo_PPO/main.py).
 *
 * Dos particularidades frente al transporte de archivo:
 *
 *  1. Cada mensaje trae SOLO los eventos nuevos del tick, así que las señales
 *     se acumulan sobre `previo`.
 *  2. `actualizadoMs` es SIEMPRE la hora local, nunca el `tiempoMs` del
 *     mensaje: en replay ese reloj es histórico y el semáforo de frescura
 *     marcaría "DETENIDO" para siempre.
 *
 * Desde el contrato v1 el servicio publica cuenta, barreras y posición
 * completas. Se leen si están y, si no (servicio viejo, contrato v0), se cae a
 * las derivaciones de antes: así una versión previa del backend sigue
 * funcionando exactamente igual que hasta ahora.
 */
export function adaptarFeedWebSocket(
  crudo: unknown,
  fuente: FuenteModelo,
  previo: EstadoModeloIA | null,
): EstadoModeloIA | null {
  if (!crudo || typeof crudo !== "object") return null;
  const j = crudo as Record<string, unknown>;
  if (j.tipo !== "estado") return null;

  const contrato = num(j.contrato) ?? 0;
  const dir = num(j.posicion) ?? 0;
  const posicion: LadoPosicion = dir > 0 ? "LONG" : dir < 0 ? "SHORT" : "FLAT";
  const nuevos = señales(j.eventos);
  const acumuladas =
    nuevos.length > 0 ? [...(previo?.senales ?? []), ...nuevos] : (previo?.senales ?? []);
  const flat = posicion === "FLAT";

  // v0 no manda precio de entrada: se reconstruye desde la última apertura.
  const ultimaApertura = [...acumuladas]
    .reverse()
    .find((s) => s.evento === "abrir_long" || s.evento === "abrir_short");

  // v0 solo manda `confianza` en 0..1 sin signo: se le devuelve el signo de la
  // posición para que la señal derivada sea coherente. v1 manda la acción
  // cruda, que ya trae el signo y es lo que el contrato pide.
  const confianza = num(j.confianza);
  const accionV0 = confianza !== null ? confianza * (dir || 1) : null;

  return {
    contrato,
    modeloId: texto(j.modeloId) ?? fuente.id,
    modeloEtiqueta: texto(j.modeloEtiqueta) ?? fuente.etiqueta,
    estado: j.fin === true ? "detenido" : "operando",
    mensaje: j.quiebra === true ? "quiebra: equity bajo el mínimo" : null,
    simbolo: (texto(j.simbolo) ?? "BTCUSDT").toUpperCase(),
    dineroReal: j.dineroReal === true,
    checkpoint: texto(j.checkpoint),

    precio: num(j.precio),
    ultimaVelaMs: num(j.ultimaVelaMs) ?? num(j.tiempoMs),
    actualizadoMs: Date.now(),
    enVivo: j.enVivo !== false,

    capitalInicial: num(j.capitalInicial),
    saldo: num(j.saldo),
    equity: num(j.equity),

    posicion,
    precioEntrada: flat ? null : (num(j.precioEntrada) ?? ultimaApertura?.precio ?? null),
    aperturaMs: flat ? null : (num(j.aperturaMs) ?? aperturaDesdeSenales(acumuladas)),
    nocional: flat ? null : num(j.nocional),
    apalancamiento: num(j.apalancamiento),
    stopLoss: flat ? null : num(j.stopLoss),
    takeProfit: flat ? null : num(j.takeProfit),
    precioLiquidacion: flat ? null : num(j.precioLiquidacion),

    accion: num(j.accion) ?? accionV0,
    zonaMuerta: num(j.zonaMuerta) ?? ZONA_MUERTA_POR_DEFECTO,
    regimen: texto(j.regimen),
    motivoRiesgo: texto(j.motivoRiesgo),

    operaciones:
      num(j.operaciones) ?? acumuladas.filter((s) => s.evento.startsWith("cerrar")).length,
    comisiones: num(j.comisiones),
    funding: num(j.funding),
    senales: acumuladas,
  };
}

export { CONTRATO_ACTUAL };
