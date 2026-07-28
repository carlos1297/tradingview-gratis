import { esApertura, sanearSenales, type ModelSignal } from "./senales";
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
 *
 * Los dos transportes comparten el mismo mapeo (`mapearCanonico`); lo único
 * propio de cada uno son las cuatro diferencias que documenta `Particular`.
 * Antes eran dos funciones de sesenta líneas casi calcadas, y cada campo nuevo
 * del contrato había que acordarse de agregarlo en las dos — el de un motor
 * quedaba a medias sin que nada avisara.
 */

/**
 * Zona muerta por defecto: |accion| < 0.1 = quedarse plano. Es el valor de
 * ZONA_MUERTA en rl_trading/riesgo.py. Solo se usa si el motor no lo publica
 * (contrato v0); en cuanto lo publica, manda el del motor.
 */
const ZONA_MUERTA_POR_DEFECTO = 0.1;

const ESTADOS: EstadoMotor[] = ["arrancando", "operando", "detenido", "error"];
const LADOS: LadoPosicion[] = ["LONG", "SHORT", "FLAT"];

/**
 * ¿Es un objeto JSON con campos? `typeof x === "object"` NO alcanza: también
 * es cierto para `null` y para los arrays, y un array se colaba entero como
 * "estado" produciendo un EstadoModeloIA vacío pero válido — un modelo
 * fantasma en el selector, con todo en "—" y sin ninguna pista del motivo.
 */
function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * Lado de la posición, tolerante a las dos formas que existen en la práctica:
 *
 *  - **canónica** — la palabra `"LONG" | "SHORT" | "FLAT"` (contrato v1).
 *  - **legada** — el entero firmado `+1 / -1 / 0` con que trabaja internamente
 *    un simulador. Motores viejos lo publicaban tal cual.
 *
 * Cualquier otra cosa se lee como FLAT: ante la duda, no dibujar una posición
 * es más seguro que inventar un lado.
 */
export function ladoPosicion(v: unknown): LadoPosicion {
  if (typeof v === "string") {
    const arriba = v.toUpperCase() as LadoPosicion;
    return LADOS.includes(arriba) ? arriba : "FLAT";
  }
  const n = num(v);
  if (n === null) return "FLAT";
  return n > 0 ? "LONG" : n < 0 ? "SHORT" : "FLAT";
}

/**
 * Frontera de confianza con el motor: `sanearSenales` descarta las entradas
 * inválidas (un `tiempoMs` que no es número, un evento mal escrito, un `null`
 * colado en el array) en vez de dejarlas entrar y que revienten más adelante
 * en el gráfico o en las estadísticas.
 */
const señales = sanearSenales;

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
    if (esApertura(s)) {
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
 * Lo ÚNICO que distingue a un transporte del otro. Todo lo demás del contrato
 * se mapea igual, así que vive una sola vez en `mapearCanonico`.
 */
interface Particular {
  /** Estado del motor ya resuelto (el WS lo deduce de `fin`). */
  estado: EstadoMotor;
  mensaje: string | null;
  /** Lista COMPLETA de señales de la corrida, ya saneada. */
  senales: ModelSignal[];
  /** Cuándo se supo de este estado. */
  actualizadoMs: number;
  /** Valor de respaldo si el motor no publica `accion` (contrato v0). */
  accionRespaldo: number | null;
  /** Respaldo de `precioEntrada` si el motor no lo publica (contrato v0). */
  entradaRespaldo: number | null;
}

/** Mapeo del contrato v1, común a los dos transportes. */
function mapearCanonico(
  j: Record<string, unknown>,
  fuente: FuenteModelo,
  p: Particular,
): EstadoModeloIA {
  const posicion = ladoPosicion(j.posicion);
  const flat = posicion === "FLAT";

  return {
    contrato: num(j.contrato) ?? 0,
    modeloId: texto(j.modeloId) ?? fuente.id,
    // el motor puede identificarse ("SAC"); si no, manda el registro
    modeloEtiqueta: texto(j.modelo) ?? texto(j.modeloEtiqueta) ?? fuente.etiqueta,

    estado: p.estado,
    mensaje: p.mensaje,
    simbolo: (texto(j.simbolo) ?? "BTCUSDT").toUpperCase(),
    dineroReal: j.dineroReal === true,
    checkpoint: texto(j.checkpoint),

    precio: num(j.precio),
    ultimaVelaMs: num(j.ultimaVelaMs) ?? num(j.tiempoMs),
    actualizadoMs: p.actualizadoMs,
    // un motor que no se declara asume reloj de pared: es lo que hacía la
    // interfaz antes de que existiera el campo, así que nada cambia para SAC
    enVivo: j.enVivo !== false,

    capitalInicial: num(j.capitalInicial),
    saldo: num(j.saldo),
    equity: num(j.equity),

    // Estando flat NO se arrastra nada de la posición anterior: si un solo
    // campo sobrevive, el gráfico dibuja una operación que ya se cerró.
    posicion,
    precioEntrada: flat ? null : (num(j.precioEntrada) ?? p.entradaRespaldo),
    aperturaMs: flat ? null : (num(j.aperturaMs) ?? aperturaDesdeSenales(p.senales)),
    nocional: flat ? null : num(j.nocional),
    apalancamiento: num(j.apalancamiento),
    stopLoss: flat ? null : num(j.stopLoss),
    takeProfit: flat ? null : num(j.takeProfit),
    precioLiquidacion: flat ? null : num(j.precioLiquidacion),

    accion: num(j.accion) ?? p.accionRespaldo,
    zonaMuerta: num(j.zonaMuerta) ?? ZONA_MUERTA_POR_DEFECTO,
    regimen: texto(j.regimen),
    motivoRiesgo: texto(j.motivoRiesgo),

    operaciones:
      num(j.operaciones) ?? p.senales.filter((s) => !esApertura(s)).length,
    comisiones: num(j.comisiones),
    funding: num(j.funding),
    senales: p.senales,
  };
}

/**
 * Adaptador del transporte de ARCHIVO: cada lectura trae el estado completo.
 *
 * Sirve para el contrato v1 y para su versión legada v0 (el `estado_vivo.json`
 * que escribía modelo_SAC/operar_vivo.py antes de publicar la posición en
 * detalle: sin `nocional`, `stopLoss`, `takeProfit` ni `aperturaMs`). Lo que
 * falte queda en `null` —la interfaz muestra "—"— salvo `aperturaMs`, que se
 * deduce de las señales.
 */
export function adaptarContratoEstandar(
  crudo: unknown,
  fuente: FuenteModelo,
): EstadoModeloIA | null {
  if (!esObjeto(crudo)) return null;
  const j = crudo;

  return mapearCanonico(j, fuente, {
    estado: ESTADOS.includes(j.estado as EstadoMotor)
      ? (j.estado as EstadoMotor)
      : "error",
    mensaje: texto(j.mensaje),
    senales: señales(j.senales),
    // sin marca de tiempo el semáforo no puede juzgar frescura: se asume ahora
    actualizadoMs: num(j.actualizadoMs) ?? Date.now(),
    accionRespaldo: null,
    entradaRespaldo: null,
  });
}

/**
 * Adaptador del transporte WebSocket (p. ej. RL_PPO/modelo_PPO/main.py).
 *
 * Tres particularidades frente al archivo:
 *
 *  1. Cada mensaje trae SOLO los eventos nuevos del tick, así que las señales
 *     se acumulan sobre `previo`.
 *  2. `actualizadoMs` es la hora de RECEPCIÓN, no la del mensaje: un motor en
 *     replay lleva un reloj histórico y el semáforo de frescura marcaría
 *     "DETENIDO" para siempre. Así lo fija docs/CONTRATO_MODELOS.md §2.3.
 *  3. El fin del episodio llega como `fin: true`, no como `estado`.
 *
 * Los respaldos de `precioEntrada` y `accion` cubren a un motor v0 que todavía
 * no publique esos campos; un motor v1 los trae y mandan los suyos.
 */
export function adaptarFeedWebSocket(
  crudo: unknown,
  fuente: FuenteModelo,
  previo: EstadoModeloIA | null,
): EstadoModeloIA | null {
  if (!esObjeto(crudo)) return null;
  const j = crudo;
  if (j.tipo !== "estado") return null;

  const nuevos = señales(j.eventos);
  const acumuladas =
    nuevos.length > 0 ? [...(previo?.senales ?? []), ...nuevos] : (previo?.senales ?? []);

  // v0 no manda precio de entrada: se reconstruye desde la última apertura.
  const ultimaApertura = [...acumuladas].reverse().find(esApertura);

  // v0 solo manda `confianza` en 0..1 sin signo: se le devuelve el signo de la
  // posición para que la señal derivada sea coherente. v1 manda la acción
  // cruda, que ya trae el signo y es lo que el contrato pide.
  const confianza = num(j.confianza);
  const lado = ladoPosicion(j.posicion);
  const signo = lado === "LONG" ? 1 : lado === "SHORT" ? -1 : 1;

  return mapearCanonico(j, fuente, {
    estado: j.fin === true ? "detenido" : "operando",
    mensaje: j.quiebra === true ? "quiebra: equity bajo el mínimo" : texto(j.mensaje),
    senales: acumuladas,
    actualizadoMs: Date.now(),
    accionRespaldo: confianza !== null ? confianza * signo : null,
    entradaRespaldo: ultimaApertura?.precio ?? null,
  });
}

export { CONTRATO_ACTUAL };
