import { buildOperaciones } from "@/lib/trades";
import { MS_FRESCO_POR_DEFECTO } from "./tipos";
import type {
  EstadoModeloIA,
  LadoPosicion,
  SaludMotor,
  SenalOperativa,
  VistaOperacion,
} from "./tipos";

/**
 * derivar.ts — Todo lo que el panel muestra pero nadie almacena.
 *
 * Regla: el motor publica HECHOS (precio de entrada, nocional, stop…), la
 * interfaz calcula LECTURAS (PnL, R/R, señal, duración). Así no hay dos
 * fuentes que puedan discrepar, y un modelo nuevo solo tiene que publicar los
 * hechos para que todo el panel funcione.
 *
 * Las operaciones CERRADAS no se recalculan acá: se reutiliza
 * buildOperaciones() de lib/trades.ts, el mismo código que alimenta el
 * Probador de estrategias, para que el PnL realizado del panel y el de la
 * lista de operaciones no puedan diferir nunca.
 */

/**
 * Umbral de frescura por defecto (una vela 5m + margen). Cada fuente puede
 * declarar el suyo con `msFresco` — un motor horario o uno de 1 segundo no se
 * juzgan con la misma vara.
 */
export const MS_FRESCO = MS_FRESCO_POR_DEFECTO;

/**
 * Lo que el GRÁFICO necesita para dibujar la operación abierta.
 *
 * Es el contrato entre modelos-store y ChartLigero: el canvas no conoce
 * modelos ni contratos, solo recibe esta forma. `esDemo` distingue la
 * operación de ejemplo (botón "Ver demostración") de una real — la demo no
 * tiene precio de entrada y se ancla a una vela del propio gráfico.
 */
export interface PosicionEnGrafico {
  lado: "long" | "short";
  /** null solo en la demo: el gráfico la ancla a una vela reciente. */
  precioEntrada: number | null;
  aperturaMs: number | null;
  /** Exposición en USD, para rotular el PnL flotante en dinero. */
  nocional: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  /**
   * Precio contra el que medir el PnL, cuando NO es el de la última vela del
   * gráfico. Lo llena un motor en replay: sus precios son históricos y medir
   * contra el BTC de hoy daría una caja de PnL que contradice al panel.
   * `null` = motor en vivo, el gráfico usa su propio último precio.
   */
  precioReferencia: number | null;
  /** Texto del marcador de entrada: "SAC", "PPO", "DEMO"… */
  etiqueta: string;
  /**
   * Color de identidad del modelo (el de su entrada en el registro).
   *
   * Con varios motores dibujando a la vez, la etiqueta sola no alcanza para
   * saber de quién es cada caja de un vistazo. `undefined` = usar el color por
   * lado (verde/rojo), que es lo correcto para la demo y para un modelo sin
   * color declarado.
   */
  color?: string;
  esDemo: boolean;
}

/**
 * Traduce el estado de un modelo a la posición dibujable, o null si está
 * plano. Así el gráfico muestra la operación REAL —con su entrada, sus
 * barreras y su tamaño— en vez de la de ejemplo.
 */
export function posicionParaGrafico(
  estado: EstadoModeloIA | null,
): PosicionEnGrafico | null {
  if (!estado || estado.posicion === "FLAT" || estado.precioEntrada === null) {
    return null;
  }
  return {
    lado: estado.posicion === "LONG" ? "long" : "short",
    precioEntrada: estado.precioEntrada,
    aperturaMs: estado.aperturaMs,
    nocional: estado.nocional,
    stopLoss: estado.stopLoss,
    takeProfit: estado.takeProfit,
    precioReferencia: estado.enVivo ? null : estado.precio,
    etiqueta: estado.modeloEtiqueta,
    esDemo: false,
  };
}

const DIRECCION: Record<LadoPosicion, number> = { LONG: 1, SHORT: -1, FLAT: 0 };

/**
 * PnL flotante de una posición, en porcentaje y en dinero.
 *
 * Es la ÚNICA fórmula del proyecto: la usan `vistaOperacion` (barra de modelos
 * y Probador) y el dibujo de la operación sobre el gráfico. Tenerla repetida
 * era lo que permitía que los tres mostraran porcentajes distintos del mismo
 * trade — sobre todo el gráfico, que además medía contra el cierre de la
 * última vela de SU temporalidad.
 *
 * Sin `nocional` el importe queda en `null`: sin exposición publicada no hay
 * forma de convertir el porcentaje a dinero.
 */
export function pnlFlotante(
  lado: LadoPosicion,
  precioEntrada: number | null,
  precioActual: number | null,
  nocional: number | null,
): { pct: number | null; usd: number | null } {
  const dir = DIRECCION[lado];
  if (dir === 0 || precioEntrada === null || precioEntrada <= 0 || precioActual === null) {
    return { pct: null, usd: null };
  }
  const pct = dir * (precioActual / precioEntrada - 1) * 100;
  return { pct, usd: nocional !== null ? (pct / 100) * nocional : null };
}

/**
 * Salud del motor. Se juzga por la antigüedad del archivo, no por el campo
 * `estado`: si el proceso muere, el JSON se congela con "operando" y solo el
 * desfase lo delata.
 */
export function saludMotor(
  estado: EstadoModeloIA,
  ahoraMs: number,
  msFresco: number = MS_FRESCO_POR_DEFECTO,
): SaludMotor {
  if (estado.estado === "error") return "error";
  const desfase = ahoraMs - estado.actualizadoMs;
  if (estado.estado === "detenido" || desfase > msFresco * 2) return "detenido";
  if (estado.estado === "arrancando") return "arrancando";
  if (desfase > msFresco) return "atrasado";
  return "operando";
}

/**
 * ¿El motor dejó de dar señales de vida?
 *
 * Es el criterio con el que la interfaz decide dejar de mostrar sus
 * operaciones: un motor apagado no tiene una posición abierta, tiene una
 * posición *de la última vez que corrió*. Seguir dibujándola —con su PnL, su
 * stop y su take profit— es afirmar algo que ya no es cierto.
 *
 * Se mira la ANTIGÜEDAD, no el campo `estado`: si el proceso muere, su JSON
 * queda congelado diciendo "operando" y solo el reloj lo delata. Y se mira
 * aparte del semáforo porque `saludMotor` devuelve "error" antes de consultar
 * el reloj: un motor que murió dejando `estado: "error"` nunca llegaría a
 * "detenido" y se quedaría en pantalla para siempre.
 */
export function motorSinVida(
  estado: EstadoModeloIA,
  ahoraMs: number,
  msFresco: number = MS_FRESCO_POR_DEFECTO,
): boolean {
  return (
    saludMotor(estado, ahoraMs, msFresco) === "detenido" ||
    ahoraMs - estado.actualizadoMs > msFresco * 2
  );
}

/**
 * Qué está pidiendo el modelo ahora mismo.
 *
 * Se deriva de la acción continua contra la zona muerta y la posición
 * vigente, replicando la lógica de MotorRiesgo.filtrarAccion (riesgo.py):
 * |a| < zonaMuerta ⇒ plano. Un modelo con acciones discretas encaja
 * publicando accion ∈ {-1, 0, 1}.
 */
export function senalOperativa(estado: EstadoModeloIA): SenalOperativa {
  const a = estado.accion;
  if (a === null) return "MANTENER";
  const quiereFlat = Math.abs(a) < estado.zonaMuerta;
  const hayPosicion = estado.posicion !== "FLAT";

  if (quiereFlat) return hayPosicion ? "CERRAR" : "MANTENER";
  const deseada: LadoPosicion = a > 0 ? "LONG" : "SHORT";
  if (hayPosicion && deseada === estado.posicion) return "MANTENER";
  return deseada === "LONG" ? "COMPRAR" : "VENDER";
}

/** PnL ya realizado: suma de las operaciones cerradas de la corrida. */
export function pnlRealizado(estado: EstadoModeloIA): number | null {
  // Preferir el saldo del motor: incluye comisiones y funding, no solo el
  // PnL de los cierres.
  if (estado.saldo !== null && estado.capitalInicial !== null) {
    return estado.saldo - estado.capitalInicial;
  }
  if (estado.senales.length === 0) return null;
  const ops = buildOperaciones(estado.senales);
  return ops.length > 0 ? ops[ops.length - 1].acumuladoUsd : 0;
}

/**
 * Vista completa de la operación en curso. `precioMercado` permite refrescar
 * el PnL flotante con el precio del feed en vivo entre decisiones del modelo
 * (que solo decide una vez cada 5 minutos).
 *
 * El feed en vivo se ignora si el motor NO corre en tiempo real: un motor en
 * replay opera sobre precios históricos, y restarle el BTC de hoy a una
 * entrada de hace dos años daría un PnL de cientos de por ciento que no
 * existe. Se decide acá, y no en el panel, para que todos los consumidores
 * (barra, gráfico) muestren el mismo número por construcción.
 */
export function vistaOperacion(
  estado: EstadoModeloIA,
  precioMercado: number | null,
  ahoraMs: number,
): VistaOperacion {
  const lado = estado.posicion;
  const hayPosicion = lado !== "FLAT";
  const dir = DIRECCION[lado];
  const precioActual = (estado.enVivo ? precioMercado : null) ?? estado.precio;
  const entrada = estado.precioEntrada;

  const flotante = pnlFlotante(lado, entrada, precioActual, estado.nocional);
  const pnlNoRealizadoPct = flotante.pct;
  let pnlNoRealizadoUsd = flotante.usd;
  if (pnlNoRealizadoPct !== null && pnlNoRealizadoUsd === null) {
    // sin nocional publicado: equity − saldo ES el flotante por definición
    if (estado.equity !== null && estado.saldo !== null) {
      pnlNoRealizadoUsd = estado.equity - estado.saldo;
    }
  }

  const realizado = pnlRealizado(estado);
  const totalUsd =
    estado.equity !== null && estado.capitalInicial !== null
      ? estado.equity - estado.capitalInicial
      : null;
  const totalPct =
    totalUsd !== null && estado.capitalInicial
      ? (totalUsd / estado.capitalInicial) * 100
      : null;

  // Riesgo/recompensa con las distancias REALES a cada barrera: si el precio
  // ya se movió, el ratio vigente no es el nominal del diseño.
  let riesgoRecompensa: number | null = null;
  let distanciaStopPct: number | null = null;
  let distanciaTakePct: number | null = null;
  if (hayPosicion && entrada !== null && entrada > 0) {
    if (estado.stopLoss !== null) {
      const riesgo = Math.abs(entrada - estado.stopLoss);
      if (estado.takeProfit !== null && riesgo > 0) {
        riesgoRecompensa = Math.abs(estado.takeProfit - entrada) / riesgo;
      }
      if (precioActual !== null && precioActual > 0) {
        distanciaStopPct = (dir * (precioActual - estado.stopLoss) * 100) / precioActual;
      }
    }
    if (estado.takeProfit !== null && precioActual !== null && precioActual > 0) {
      distanciaTakePct = (dir * (estado.takeProfit - precioActual) * 100) / precioActual;
    }
  }

  // Distancia a liquidación: siempre positiva (es "cuánto colchón queda"),
  // igual que SimuladorEjecucion.distanciaLiquidacionPct en el motor.
  const distanciaLiquidacionPct =
    hayPosicion && estado.precioLiquidacion !== null && precioActual !== null && precioActual > 0
      ? (Math.abs(precioActual - estado.precioLiquidacion) * 100) / precioActual
      : null;

  return {
    lado,
    hayPosicion,
    senal: senalOperativa(estado),
    confianza: estado.accion === null ? 0 : Math.min(1, Math.abs(estado.accion)),
    precioEntrada: entrada,
    precioActual,
    pnlNoRealizadoUsd,
    pnlNoRealizadoPct,
    pnlRealizadoUsd: realizado,
    pnlTotalUsd: totalUsd,
    pnlTotalPct: totalPct,
    // Cronometrar contra el reloj del MOTOR, no el de pared, cuando corre en
    // replay: su apertura es una fecha histórica y restarle "ahora" daría años
    // de operación abierta. En vivo los dos relojes coinciden y manda `ahoraMs`
    // (se refresca cada segundo aunque el motor decida cada 5 minutos).
    duracionMs:
      hayPosicion && estado.aperturaMs !== null
        ? Math.max(
            0,
            (estado.enVivo ? ahoraMs : (estado.ultimaVelaMs ?? ahoraMs)) - estado.aperturaMs,
          )
        : null,
    nocional: estado.nocional,
    stopLoss: estado.stopLoss,
    takeProfit: estado.takeProfit,
    riesgoRecompensa,
    distanciaStopPct,
    distanciaTakePct,
    distanciaLiquidacionPct,
  };
}
