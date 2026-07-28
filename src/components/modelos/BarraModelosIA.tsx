"use client";

import { useEffect, useState } from "react";
import { getBinanceWS } from "@/lib/binance/ws";
import { formatPrice } from "@/lib/format";
import { saludMotor, vistaOperacion } from "@/lib/modelos/derivar";
import { useModelosIA } from "@/lib/modelos/useModelosIA";
import type { SaludMotor, SenalOperativa } from "@/lib/modelos/tipos";
import { useModelosStore } from "@/lib/store/modelos-store";
import { formatDuracion } from "@/lib/trades";
import { cn } from "@/lib/utils";
import { CeldaMetrica, DivisorCelda, tonoPorSigno } from "./CeldaMetrica";
import { SelectorModelo } from "./SelectorModelo";

/**
 * BarraModelosIA — Barra de monitoreo en vivo, ancho completo, entre la barra
 * superior y el gráfico.
 *
 * Muestra en detalle el modelo ACTIVO: su estado, la operación abierta y el
 * rendimiento de la corrida. Es agnóstica del modelo — todo sale del contrato
 * canónico (lib/modelos/tipos.ts), así que sirve igual para SAC, PPO o el que
 * venga; lo único que cambia es la entrada del registro.
 *
 * Se monta siempre (es quien arranca el sondeo vía useModelosIA) pero no
 * ocupa espacio hasta que algún motor responde: sin modelos corriendo, el
 * visor se ve exactamente como antes.
 */

const SALUD: Record<SaludMotor, { texto: string; color: string; pulsa: boolean }> = {
  operando: { texto: "EN VIVO", color: "#26a69a", pulsa: true },
  arrancando: { texto: "ARRANCANDO", color: "#ffb74d", pulsa: true },
  atrasado: { texto: "ATRASADO", color: "#ffb74d", pulsa: false },
  detenido: { texto: "DETENIDO", color: "#787b86", pulsa: false },
  error: { texto: "ERROR", color: "#ef5350", pulsa: false },
};

const SENAL: Record<SenalOperativa, { texto: string; clase: string }> = {
  COMPRAR: { texto: "COMPRAR", clase: "bg-tv-green/15 text-tv-green" },
  VENDER: { texto: "VENDER", clase: "bg-tv-red/15 text-tv-red" },
  MANTENER: { texto: "MANTENER", clase: "bg-tv-panel-hover text-tv-text-muted" },
  CERRAR: { texto: "CERRAR", clase: "bg-tv-yellow/15 text-tv-yellow" },
};

function usd(v: number | null, decimales = 2): string | null {
  if (v === null || !Number.isFinite(v)) return null;
  const signo = v > 0 ? "+" : "";
  return `${signo}${v.toFixed(decimales)}`;
}

function pct(v: number | null): string | null {
  if (v === null || !Number.isFinite(v)) return null;
  const signo = v > 0 ? "+" : "";
  return `${signo}${v.toFixed(2)}%`;
}

/**
 * Los motores publican estos códigos en snake_case ("alta_volatilidad",
 * "veto_colchon_liquidacion"). Se muestran legibles sin traducirlos a mano:
 * un modelo nuevo puede publicar códigos propios y salen bien igual.
 */
function legible(v: string | null): string | null {
  return v === null ? null : v.replace(/_/g, " ");
}

export function BarraModelosIA() {
  // arranca el sondeo de todas las fuentes registradas
  useModelosIA();

  const modeloActivo = useModelosStore((s) => s.modeloActivo);
  const estado = useModelosStore((s) =>
    s.modeloActivo ? (s.estados[s.modeloActivo] ?? null) : null,
  );
  const [ahora, setAhora] = useState(() => Date.now());
  // El precio se guarda JUNTO a su par: si el modelo cambia de símbolo, el
  // precio viejo deja de coincidir y se descarta solo, sin tener que
  // resetear estado dentro del efecto.
  const [tick, setTick] = useState<{ simbolo: string; precio: number } | null>(null);

  // reloj de 1 s: mantiene vivos el cronómetro de la operación y la frescura
  // del semáforo sin depender de que el motor escriba (decide cada 5 min)
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Precio en vivo del par que opera el modelo: reutiliza la MISMA conexión
  // WebSocket que el resto del visor (singleton) en vez de abrir otra.
  const simbolo = estado?.simbolo;
  useEffect(() => {
    if (!simbolo) return;
    return getBinanceWS().subscribeMiniTickers([simbolo], (t) => {
      if (t.symbol.toUpperCase() === simbolo.toUpperCase()) {
        setTick({ simbolo, precio: t.close });
      }
    });
  }, [simbolo]);
  const precioVivo = tick && tick.simbolo === simbolo ? tick.precio : null;

  // Sin ningún motor corriendo la barra no existe: el visor queda igual que antes.
  if (!estado || !modeloActivo) return null;

  const salud = saludMotor(estado, ahora);
  const cfg = SALUD[salud];
  const vista = vistaOperacion(estado, precioVivo, ahora);
  const senal = SENAL[vista.senal];

  const colorLado =
    vista.lado === "LONG"
      ? "bg-tv-green/15 text-tv-green"
      : vista.lado === "SHORT"
        ? "bg-tv-red/15 text-tv-red"
        : "bg-tv-panel-hover text-tv-text-muted";
  const textoLado =
    vista.lado === "LONG" ? "LONG" : vista.lado === "SHORT" ? "SHORT" : "SIN POSICIÓN";

  return (
    <section
      aria-label="Monitor de modelos de IA en vivo"
      className="flex w-full shrink-0 items-stretch overflow-x-auto border-b border-tv-border bg-tv-panel"
    >
      {/* ── Identidad y estado del motor ──────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-3 px-3 py-2">
        <SelectorModelo />
        <span
          className="flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-semibold tracking-wide"
          style={{ background: `${cfg.color}1f`, color: cfg.color }}
          title={estado.mensaje ?? `Última actualización del motor: ${new Date(estado.actualizadoMs).toLocaleTimeString()}`}
        >
          <span
            className={cn("h-2 w-2 rounded-full", cfg.pulsa && "animate-pulse")}
            style={{ background: cfg.color }}
          />
          {cfg.texto}
        </span>
      </div>

      <DivisorCelda />

      {/* ── Posición y señal ──────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-2 px-3">
        <span
          className={cn(
            "rounded px-2.5 py-1 text-xs font-bold tracking-wide",
            colorLado,
          )}
        >
          {textoLado}
        </span>
        <span
          className={cn("rounded px-2 py-1 text-[11px] font-semibold", senal.clase)}
          title="Lo que pide el modelo en su última decisión (derivado de la acción y la zona muerta)"
        >
          {senal.texto}
        </span>
      </div>

      <DivisorCelda />

      {/* ── Operación en curso ────────────────────────────────────────── */}
      <CeldaMetrica
        etiqueta="Entrada"
        valor={vista.precioEntrada !== null ? formatPrice(vista.precioEntrada) : null}
        titulo="Precio al que el modelo abrió la posición (incluye slippage)"
      />
      <CeldaMetrica
        etiqueta="Precio actual"
        valor={vista.precioActual !== null ? formatPrice(vista.precioActual) : null}
        secundario={
          !estado.enVivo ? "replay" : precioVivo !== null ? "en vivo" : null
        }
        titulo={
          estado.enVivo
            ? "Último precio del feed de Binance; entre decisiones del modelo se refresca solo"
            : "Precio del propio motor: está reproduciendo datos históricos, no el mercado de ahora"
        }
      />
      <CeldaMetrica
        etiqueta="PnL no realizado"
        valor={usd(vista.pnlNoRealizadoUsd)}
        secundario={pct(vista.pnlNoRealizadoPct)}
        tono={tonoPorSigno(vista.pnlNoRealizadoUsd ?? vista.pnlNoRealizadoPct)}
        titulo="Ganancia o pérdida flotante de la posición abierta, a precio de mercado"
      />
      <CeldaMetrica
        etiqueta="Tamaño"
        valor={vista.nocional !== null ? `${vista.nocional.toFixed(0)} USD` : null}
        secundario={estado.apalancamiento ? `${estado.apalancamiento}x` : null}
        titulo="Exposición nocional = margen × apalancamiento"
      />
      <CeldaMetrica
        etiqueta="Tiempo abierta"
        valor={vista.duracionMs !== null ? formatDuracion(vista.duracionMs) : null}
        secundario={
          estado.aperturaMs !== null
            ? new Date(estado.aperturaMs).toLocaleTimeString("es", {
                hour: "2-digit",
                minute: "2-digit",
              })
            : null
        }
        titulo="Tiempo transcurrido desde la apertura, y hora de apertura"
      />

      <DivisorCelda />

      {/* ── Barreras de riesgo ────────────────────────────────────────── */}
      <CeldaMetrica
        etiqueta="Stop loss"
        valor={vista.stopLoss !== null ? formatPrice(vista.stopLoss) : null}
        secundario={vista.distanciaStopPct !== null ? pct(vista.distanciaStopPct) : null}
        tono="negativo"
        titulo="Precio del stop y distancia que falta hasta tocarlo"
      />
      <CeldaMetrica
        etiqueta="Take profit"
        valor={vista.takeProfit !== null ? formatPrice(vista.takeProfit) : null}
        secundario={vista.distanciaTakePct !== null ? pct(vista.distanciaTakePct) : null}
        tono="positivo"
        titulo="Precio del objetivo y distancia que falta hasta tocarlo"
      />
      <CeldaMetrica
        etiqueta="Liquidación"
        valor={
          estado.precioLiquidacion !== null ? formatPrice(estado.precioLiquidacion) : null
        }
        secundario={
          vista.distanciaLiquidacionPct !== null
            ? `${vista.distanciaLiquidacionPct.toFixed(2)}%`
            : null
        }
        tono="aviso"
        titulo="Precio al que la posición se liquidaría y colchón que queda hasta ahí"
      />
      <CeldaMetrica
        etiqueta="Riesgo / Recompensa"
        valor={vista.riesgoRecompensa !== null ? `1 : ${vista.riesgoRecompensa.toFixed(2)}` : null}
        titulo="Distancia al take profit dividida por la distancia al stop loss"
      />
      <CeldaMetrica
        etiqueta="Confianza IA"
        valor={`${(vista.confianza * 100).toFixed(0)}%`}
        secundario={estado.accion !== null ? estado.accion.toFixed(3) : null}
        tono="acento"
        progreso={vista.confianza}
        titulo="Magnitud de la acción del modelo en [-1, 1]: cuánta convicción pone en la decisión"
      />
      <CeldaMetrica
        etiqueta="Régimen"
        valor={legible(estado.regimen)}
        titulo="Régimen de mercado que percibe el modelo en esta barra"
      />
      <CeldaMetrica
        etiqueta="Risk Engine"
        valor={legible(estado.motivoRiesgo) ?? "sin veto"}
        tono={estado.motivoRiesgo !== null ? "aviso" : "neutro"}
        titulo="Por qué el motor de riesgo vetó o recortó la decisión del agente en este tick"
      />

      <DivisorCelda />

      {/* ── Rendimiento de la corrida ─────────────────────────────────── */}
      <CeldaMetrica
        etiqueta="PnL realizado"
        valor={usd(vista.pnlRealizadoUsd)}
        tono={tonoPorSigno(vista.pnlRealizadoUsd)}
        titulo="Resultado ya cerrado de la corrida, neto de comisiones y funding"
      />
      <CeldaMetrica
        etiqueta="Equity"
        valor={estado.equity !== null ? estado.equity.toFixed(2) : null}
        secundario={pct(vista.pnlTotalPct)}
        tono={tonoPorSigno(vista.pnlTotalUsd)}
        titulo="Capital actual (saldo + PnL flotante) y variación total sobre el capital inicial"
      />
      <CeldaMetrica
        etiqueta="Operaciones"
        valor={String(estado.operaciones)}
        secundario={estado.comisiones !== null ? `${estado.comisiones.toFixed(2)} com.` : null}
        titulo="Operaciones cerradas en la corrida y comisiones acumuladas"
      />

      {/* ── Avisos ────────────────────────────────────────────────────── */}
      <div className="ml-auto flex shrink-0 items-center gap-2 px-3">
        {salud === "error" && estado.mensaje && (
          <span className="max-w-[280px] truncate rounded bg-tv-red/15 px-2 py-1 text-[11px] text-tv-red">
            {estado.mensaje}
          </span>
        )}
        {!estado.dineroReal && (
          <span
            className="rounded border border-tv-yellow/50 px-2 py-1 text-[10px] font-bold tracking-wider text-tv-yellow"
            title="Paper trading: el motor no usa claves de API ni envía órdenes al exchange"
          >
            DINERO FALSO
          </span>
        )}
      </div>
    </section>
  );
}
