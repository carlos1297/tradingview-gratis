"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  TickMarkType,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import {
  COLOR_ENTRADA,
  COLOR_GANANCIA,
  COLOR_PERDIDA,
  pintarPosicion,
} from "@/lib/chart/pintarPosicion";
import { fetchKlines } from "@/lib/binance/rest";
import { getBinanceWS } from "@/lib/binance/ws";
import {
  computeLiquidationHeatmap,
  crearImagenHeatmap,
  type LiquidationHeatmap,
} from "@/lib/indicators/liquidations";
import {
  computeVolumeProfile,
  hexToRgba,
  type VolumeProfile,
} from "@/lib/indicators/volumeProfile";
import { AgregadorOrderFlow } from "@/lib/indicators/orderFlow";
import { AgregadorFootprint } from "@/lib/indicators/footprint";
import { buscarIndicador } from "@/lib/indicators/registro";
import {
  posicionParaGrafico,
  type PosicionEnGrafico,
} from "@/lib/modelos/derivar";
import { useChartStore } from "@/lib/store/chart-store";
import { useModeloActivo } from "@/lib/store/modelos-store";
import type { Candle, Timeframe } from "@/lib/binance/types";
import { formatPrice, formatPct, formatVolume } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Chart de velas con lightweight-charts (open source, de TradingView).
 * Cada instancia es una ventana del layout: mismo par, timeframe propio.
 * Capas integradas: velas en vivo, indicadores del registro (superpuestos o
 * en paneles propios), señales del modelo RL (markers) y Liquidation Heatmap.
 */

interface Props {
  symbol: string;
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
  /** Mostrar la barra interna de timeframes (off cuando el marco de ventana ya la aporta) */
  mostrarBarraTF?: boolean;
}

const TIMEFRAMES_UI: Timeframe[] = ["1m", "5m", "15m", "1h", "4h", "1d", "1w"];

const SEGUNDOS_TF: Record<Timeframe, number> = {
  "1m": 60, "3m": 180, "5m": 300, "15m": 900, "30m": 1800,
  "1h": 3600, "2h": 7200, "4h": 14400, "6h": 21600, "8h": 28800,
  "12h": 43200, "1d": 86400, "3d": 259200, "1w": 604800, "1M": 2592000,
};

type SerieChart = ISeriesApi<"Line"> | ISeriesApi<"Histogram">;

type OHLC = { time: number; open: number; high: number; low: number; close: number };

/**
 * Pinta la leyenda OHLC flotante (estilo TradingView) sobre el elemento dado.
 * Función pura a nivel de módulo: no depende del scope del componente, así que
 * es segura frente al reordenamiento de declaraciones del compilador de React.
 */
function pintarLeyenda(el: HTMLDivElement | null, c: OHLC | undefined) {
  if (!el) return;
  if (!c) {
    el.style.display = "none";
    return;
  }
  el.style.display = "flex";
  const col = c.close >= c.open ? "#26a69a" : "#ef5350";
  const pct = c.open ? ((c.close - c.open) / c.open) * 100 : 0;
  const fecha = new Date(c.time * 1000).toLocaleString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const par = (etq: string, val: string) =>
    `<span style="margin-right:8px"><span style="color:#787b86">${etq}</span> <span style="color:${col}">${val}</span></span>`;
  el.innerHTML =
    par("O", formatPrice(c.open)) +
    par("H", formatPrice(c.high)) +
    par("L", formatPrice(c.low)) +
    par("C", formatPrice(c.close)) +
    `<span style="margin-right:8px;color:${col}">${formatPct(pct)}</span>` +
    `<span style="color:#787b86">${fecha}</span>`;
}

/** Datos del readout de Order Flow (vela en curso + CVD acumulado). */
type VistaOF = {
  delta: number;
  cvd: number;
  buy: number;
  sell: number;
  ratioCompra: number;
};

/**
 * Pinta el readout en vivo de Order Flow (delta, CVD, compra/venta, presión).
 * Función pura de módulo (segura ante el reordenamiento del compilador de React,
 * igual que `pintarLeyenda`); actualiza el DOM directo para no re-renderizar
 * en cada trade.
 */
function pintarOrderFlow(el: HTMLDivElement | null, l: VistaOF | null) {
  if (!el) return;
  if (!l) {
    el.style.display = "none";
    return;
  }
  el.style.display = "flex";
  const cDelta = l.delta >= 0 ? "#26a69a" : "#ef5350";
  const cCvd = l.cvd >= 0 ? "#26a69a" : "#ef5350";
  const pct = Math.round(l.ratioCompra * 100);
  const presion =
    l.ratioCompra > 0.55 ? "Compradora" : l.ratioCompra < 0.45 ? "Vendedora" : "Neutral";
  const cPres =
    l.ratioCompra > 0.55 ? "#26a69a" : l.ratioCompra < 0.45 ? "#ef5350" : "#787b86";
  const signo = (n: number) => (n >= 0 ? "+" : "−");
  const par = (etq: string, val: string, col: string) =>
    `<span style="margin-right:10px"><span style="color:#787b86">${etq}</span> <span style="color:${col}">${val}</span></span>`;
  el.innerHTML =
    `<span style="margin-right:10px;font-weight:600;color:#787b86">Order Flow</span>` +
    par("Δ", signo(l.delta) + formatVolume(Math.abs(l.delta)), cDelta) +
    par("CVD", signo(l.cvd) + formatVolume(Math.abs(l.cvd)), cCvd) +
    par("Compra", formatVolume(l.buy), "#26a69a") +
    par("Venta", formatVolume(l.sell), "#ef5350") +
    par("Ratio", `${pct}%`, cPres) +
    `<span style="color:${cPres}">${presion}</span>`;
}


/** Locale del navegador (detecta automáticamente la región del usuario). */
const LOCALE_LOCAL = typeof navigator !== "undefined" ? navigator.language : "es-AR";

/**
 * Formatea la marca del eje de tiempo en la hora LOCAL del usuario (Intl detecta
 * la zona horaria del navegador). lightweight-charts, por defecto, muestra el
 * eje en UTC; esto lo alinea con la hora local sin tocar los datos.
 */
function formatoTickLocal(time: Time, tipo: TickMarkType, locale: string): string {
  const d = new Date(Number(time) * 1000);
  switch (tipo) {
    case TickMarkType.Year:
      return d.toLocaleDateString(locale, { year: "numeric" });
    case TickMarkType.Month:
      return d.toLocaleDateString(locale, { month: "short" });
    case TickMarkType.DayOfMonth:
      return d.toLocaleDateString(locale, { day: "2-digit", month: "short" });
    case TickMarkType.Time:
      return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
    default:
      return d.toLocaleTimeString(locale, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
  }
}

/** Etiqueta de tiempo del crosshair, en hora local. */
function formatoCrosshairLocal(time: Time): string {
  return new Date(Number(time) * 1000).toLocaleString(LOCALE_LOCAL, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Cachés a nivel de módulo (compartidas por todas las ventanas): velas y rango
 * visible por `símbolo|timeframe`. Cuando una ventana se re-monta por un cambio
 * de layout (cerrar/reordenar otra ventana), restaura al instante desde acá —
 * sin refetch, sin parpadeo ni reset de la vista. La ventana montada mantiene
 * su entrada al día (el WS muta el mismo arreglo in situ).
 */
const cacheVelas = new Map<string, Candle[]>();
const cacheRango = new Map<string, { from: number; to: number }>();
/** Tope de entradas de caché (evita crecer sin límite al navegar símbolos). */
const MAX_ENTRADAS_CACHE = 24;

/** Guarda velas en caché con desalojo LRU (mueve la clave al final; poda la más vieja). */
function recordarVelas(clave: string, velas: Candle[]) {
  cacheVelas.delete(clave);
  cacheVelas.set(clave, velas);
  while (cacheVelas.size > MAX_ENTRADAS_CACHE) {
    const viejo = cacheVelas.keys().next().value;
    if (viejo === undefined) break;
    cacheVelas.delete(viejo);
    cacheRango.delete(viejo); // el rango no sobrevive a sus velas
  }
}

export function ChartLigero({
  symbol,
  timeframe,
  onTimeframeChange,
  mostrarBarraTF = true,
}: Props) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const canvasHeatmapRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const serieRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const velasRef = useRef<Candle[]>([]);
  const heatmapRef = useRef<LiquidationHeatmap | null>(null);
  const ultimoDibujoRef = useRef<string | null>(null);
  /** Series creadas por indicador activo (id → series en el chart) */
  const seriesIndicadoresRef = useRef<Map<string, SerieChart[]>>(new Map());
  /** Leyenda OHLC flotante que sigue el cursor */
  const leyendaRef = useRef<HTMLDivElement>(null);
  /** Carga perezosa de historial hacia atrás (scroll infinito) */
  const cargandoHistorialRef = useRef(false);
  const sinMasHistorialRef = useRef(false);
  const claveDatosRef = useRef("");
  /** Clave de caché vigente (símbolo|timeframe[|backtest]) para velas y rango */
  const cacheKeyRef = useRef("");
  const cargarMasHistorialRef = useRef<() => void>(() => {});
  /** El cursor está sobre una vela: no pisar la leyenda con el tick del WS */
  const crosshairActivoRef = useRef(false);
  /** Volume Profile Visible Range */
  const canvasVpvrRef = useRef<HTMLCanvasElement>(null);
  const vpvrRef = useRef<VolumeProfile | null>(null);
  const ultimoVpvrKeyRef = useRef<string | null>(null);
  const dibujoPendienteVpvrRef = useRef(false);
  /** Readout en vivo de Order Flow (DOM directo, sin re-render) */
  const ofReadoutRef = useRef<HTMLDivElement>(null);
  /** Footprint (Bid×Ask por nivel dentro de cada vela) */
  const canvasFootprintRef = useRef<HTMLCanvasElement>(null);
  const agregadorFpRef = useRef<AgregadorFootprint | null>(null);
  const dibujoPendienteFpRef = useRef(false);
  /** Operación abierta dibujada sobre el chart (real del modelo, o demo) */
  const canvasPosRef = useRef<HTMLCanvasElement>(null);
  const entradaDemoRef = useRef<{
    time: number;
    precio: number;
    lado: "long" | "short";
  } | null>(null);
  const dibujoPendientePosRef = useRef(false);
  /** Coalesce del recálculo intra-vela de indicadores (evita O(n) por tick) */
  const actualizarPuntoPendienteRef = useRef(false);

  const heatmapActivo = useChartStore((s) => s.indicators.liqHeatmap);
  const liqConfig = useChartStore((s) => s.liqHeatmapConfig);
  const vpvrActivo = useChartStore((s) => s.indicators.vpvr);
  const vpvrConfig = useChartStore((s) => s.vpvrConfig);
  const orderFlowActivo = useChartStore((s) => s.indicators.orderFlow);
  const footprintActivo = useChartStore((s) => s.indicators.footprint);
  const footprintConfig = useChartStore((s) => s.footprintConfig);
  const footprintEscala = footprintConfig.escala;
  const indicadoresActivos = useChartStore((s) => s.indicadoresActivos);
  const modelSignals = useChartStore((s) => s.modelSignals);
  const showModelSignals = useChartStore((s) => s.showModelSignals);
  const heatmapActivoRef = useRef(heatmapActivo);
  heatmapActivoRef.current = heatmapActivo;
  const liqConfigRef = useRef(liqConfig);
  liqConfigRef.current = liqConfig;
  const vpvrActivoRef = useRef(vpvrActivo);
  vpvrActivoRef.current = vpvrActivo;
  const vpvrConfigRef = useRef(vpvrConfig);
  vpvrConfigRef.current = vpvrConfig;
  const footprintActivoRef = useRef(footprintActivo);
  footprintActivoRef.current = footprintActivo;
  const footprintConfigRef = useRef(footprintConfig);
  footprintConfigRef.current = footprintConfig;
  // Operación abierta sobre el gráfico. Prioridad: la REAL del modelo activo;
  // si no hay ninguna, la de ejemplo del botón "Ver demostración". El canvas
  // no conoce modelos: solo recibe PosicionEnGrafico (lib/modelos/derivar.ts).
  const posicionDemo = useChartStore((s) => s.posicionDemo);
  const estadoModelo = useModeloActivo();
  // Solo si el modelo opera el par que esta ventana muestra: si no, sus precios
  // pertenecen a otro mercado y la operación quedaría dibujada a una altura sin
  // sentido. Mismo criterio que ya aplican los marcadores de señales.
  const posicionReal = useMemo(
    () =>
      estadoModelo && estadoModelo.simbolo.toUpperCase() === symbol.toUpperCase()
        ? posicionParaGrafico(estadoModelo)
        : null,
    [estadoModelo, symbol],
  );
  const posicionEnGrafico: PosicionEnGrafico | null =
    posicionReal ??
    (posicionDemo
      ? {
          lado: posicionDemo.lado,
          precioEntrada: null, // la demo se ancla a una vela del propio gráfico
          aperturaMs: null,
          nocional: null,
          stopLoss: null,
          takeProfit: null,
          precioReferencia: null,
          etiqueta: "DEMO",
          esDemo: true,
        }
      : null);
  const posicionDemoRef = useRef(posicionEnGrafico);
  posicionDemoRef.current = posicionEnGrafico;

  // ── Crear el chart (una vez) ────────────────────────────────────────
  useEffect(() => {
    const contenedor = contenedorRef.current;
    if (!contenedor) return;

    const chart = createChart(contenedor, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#131722" },
        textColor: "#d1d4dc",
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: 11,
        panes: {
          separatorColor: "#2a2e39",
          separatorHoverColor: "rgba(41, 98, 255, 0.2)",
        },
      },
      grid: {
        vertLines: { color: "#1e222d" },
        horzLines: { color: "#1e222d" },
      },
      localization: {
        locale: LOCALE_LOCAL,
        timeFormatter: formatoCrosshairLocal,
      },
      rightPriceScale: { borderColor: "#2a2e39" },
      timeScale: {
        borderColor: "#2a2e39",
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: formatoTickLocal,
      },
      crosshair: {
        // modo Normal (libre): la línea horizontal y su etiqueta de precio
        // siguen al cursor como en TradingView, en vez de pegarse al OHLC de
        // la vela más cercana (Magnet, que aleja la etiqueta del puntero).
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "#787b86",
          style: LineStyle.Dashed,
          labelBackgroundColor: "#2a2e39",
        },
        horzLine: {
          color: "#787b86",
          style: LineStyle.Dashed,
          labelVisible: true,
          labelBackgroundColor: "#2a2e39",
        },
      },
    });
    const serie = chart.addSeries(CandlestickSeries, {
      upColor: "#26a69a",
      downColor: "#ef5350",
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
      borderVisible: false,
    });
    chartRef.current = chart;
    serieRef.current = serie;
    markersRef.current = createSeriesMarkers(serie, []);

    chart.timeScale().subscribeVisibleLogicalRangeChange((rango) => {
      solicitarDibujoHeatmap();
      solicitarDibujoVpvr();
      solicitarDibujoFootprint();
      solicitarDibujoPosicion();
      if (rango) {
        // recordar la vista para restaurarla si la ventana se re-monta
        cacheRango.set(cacheKeyRef.current, { from: rango.from, to: rango.to });
        // cerca del borde izquierdo → traer el lote de historial anterior
        if (rango.from < 15) cargarMasHistorialRef.current();
      }
    });

    // leyenda OHLC: sigue el cursor; sin cursor muestra la última vela
    chart.subscribeCrosshairMove((param) => {
      const serieActual = serieRef.current;
      if (!serieActual) return;
      const data = param.time ? param.seriesData.get(serieActual) : undefined;
      if (data && "close" in data && param.time !== undefined) {
        const d = data as unknown as {
          open: number;
          high: number;
          low: number;
          close: number;
        };
        crosshairActivoRef.current = true;
        pintarLeyenda(leyendaRef.current, {
          time: Number(param.time),
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
        });
      } else {
        crosshairActivoRef.current = false;
        const velas = velasRef.current;
        pintarLeyenda(leyendaRef.current, velas[velas.length - 1]);
      }
    });

    const seriesIndicadores = seriesIndicadoresRef.current;
    return () => {
      seriesIndicadores.clear();
      markersRef.current = null;
      serieRef.current = null;
      chartRef.current = null;
      chart.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Niveles de la operación en la ESCALA DE PRECIOS ─────────────────
  //
  // Entrada / SL / TP se publican como priceLines nativas SOLO para que su
  // precio salga en la escala de la derecha —donde TradingView lo muestra—,
  // con la tipografía, la precisión y la alineación del propio eje, y siguiendo
  // el zoom sin que haya que recalcular nada.
  //
  // `lineVisible: false` es deliberado: la línea la dibuja el canvas. Una
  // priceLine cruza TODO el ancho, también las velas anteriores a la apertura,
  // y una operación que empezó hace diez velas parecería llevar ahí desde
  // siempre. El canvas la traza desde la vela de entrada hacia la derecha, que
  // es lo que la posición realmente abarca.
  const lineasPosRef = useRef<IPriceLine[]>([]);
  const entrada = posicionEnGrafico?.precioEntrada ?? null;
  const stopLoss = posicionEnGrafico?.stopLoss ?? null;
  const takeProfit = posicionEnGrafico?.takeProfit ?? null;
  const ladoPos = posicionEnGrafico?.lado ?? null;

  useEffect(() => {
    const serie = serieRef.current;
    if (!serie) return;
    const niveles: Array<{ precio: number; color: string; titulo: string }> = [];
    if (entrada !== null) {
      niveles.push({ precio: entrada, color: COLOR_ENTRADA, titulo: "Entrada" });
    }
    if (stopLoss !== null) {
      niveles.push({ precio: stopLoss, color: COLOR_PERDIDA, titulo: "SL" });
    }
    if (takeProfit !== null) {
      niveles.push({ precio: takeProfit, color: COLOR_GANANCIA, titulo: "TP" });
    }
    for (const n of niveles) {
      lineasPosRef.current.push(
        serie.createPriceLine({
          price: n.precio,
          color: n.color,
          lineWidth: 1,
          lineStyle: LineStyle.Solid,
          lineVisible: false, // la traza el canvas, acotada a la operación
          axisLabelVisible: true,
          // el nombre ya va en la cápsula sobre el gráfico; repetirlo acá
          // dejaría el texto flotando sobre las velas por duplicado
          title: "",
        }),
      );
    }
    return () => {
      for (const linea of lineasPosRef.current) {
        try {
          serie.removePriceLine(linea);
        } catch {
          /* la serie ya se destruyó con el chart: nada que quitar */
        }
      }
      lineasPosRef.current = [];
    };
  }, [entrada, stopLoss, takeProfit, ladoPos]);


  // ── Datos: histórico + vela en vivo ────────────────────────────────
  useEffect(() => {
    const serie = serieRef.current;
    if (!serie) return;
    let cancelado = false;

    // nueva carga base: reiniciar el estado del scroll infinito de historial
    claveDatosRef.current = `${symbol}|${timeframe}`;
    sinMasHistorialRef.current = false;
    cargandoHistorialRef.current = false;

    // con señales cargadas del par actual se muestra el período del backtest
    const senalesDelPar =
      modelSignals &&
      modelSignals.senales.length > 0 &&
      modelSignals.simbolo?.toUpperCase() === symbol.toUpperCase()
        ? modelSignals.senales
        : null;
    const finMs = senalesDelPar
      ? Math.max(...senalesDelPar.map((s) => s.tiempoMs)) + 3_600_000
      : undefined;

    const cacheKey =
      finMs !== undefined
        ? `${symbol}|${timeframe}|bt${finMs}`
        : `${symbol}|${timeframe}`;
    cacheKeyRef.current = cacheKey;

    // pinta las velas (de la red o del caché). `restaurar` solo en cache-hit:
    // ahí el rango guardado corresponde a estos mismos datos; en un fetch nuevo
    // se usa fitContent (evita aplicar un rango viejo a datos distintos).
    const aplicar = (velas: Candle[], restaurar: boolean) => {
      const s = serieRef.current;
      if (!s) return;
      velasRef.current = velas;
      recordarVelas(cacheKey, velas);
      s.setData(
        velas.map((v) => ({
          time: v.time as UTCTimestamp,
          open: v.open,
          high: v.high,
          low: v.low,
          close: v.close,
        })),
      );
      heatmapRef.current = computeLiquidationHeatmap(velas, liqConfigRef.current);
      ultimoDibujoRef.current = null;
      solicitarDibujoHeatmap();
      actualizarMarkers();
      recalcularIndicadores();
      crosshairActivoRef.current = false;
      pintarLeyenda(leyendaRef.current, velas[velas.length - 1]);
      const ts = chartRef.current?.timeScale();
      const rango = restaurar ? cacheRango.get(cacheKey) : undefined;
      if (ts && rango) {
        ts.setVisibleLogicalRange(rango); // re-monte: misma vista de antes
      } else if (senalesDelPar) {
        const desde = Math.floor(senalesDelPar[0].tiempoMs / 1000) - 3600;
        const hasta =
          Math.floor(senalesDelPar[senalesDelPar.length - 1].tiempoMs / 1000) + 3600;
        ts?.setVisibleRange({ from: desde as UTCTimestamp, to: hasta as UTCTimestamp });
      } else {
        ts?.fitContent();
      }
    };

    const cached = cacheVelas.get(cacheKey);
    if (cached && cached.length > 0) {
      // re-monte por cambio de layout: restaurar al instante, sin refetch.
      // copia propia: dos ventanas del mismo par no comparten el arreglo mutable.
      aplicar(cached.slice(), true);
    } else {
      fetchKlines(symbol, timeframe, 1000, finMs)
        .then((velas) => {
          if (cancelado || !serieRef.current) return;
          aplicar(velas, false);
        })
        .catch(console.error);
    }

    // en modo histórico (backtest) no se actualiza con el WS
    if (finMs !== undefined) return () => { cancelado = true; };

    const ws = getBinanceWS();
    const unsub = ws.subscribeKline({
      symbol,
      interval: timeframe,
      onCandle: (vela) => {
        if (!serieRef.current) return;
        serieRef.current.update({
          time: vela.time as UTCTimestamp,
          open: vela.open,
          high: vela.high,
          low: vela.low,
          close: vela.close,
        });
        const velas = velasRef.current;
        const ultima = velas[velas.length - 1];
        if (ultima && vela.time === ultima.time) velas[velas.length - 1] = vela;
        else if (ultima && vela.time > ultima.time) velas.push(vela);
        if (!crosshairActivoRef.current) pintarLeyenda(leyendaRef.current, vela);
        solicitarDibujoPosicion(); // P/L de la operación demo en vivo
        if (vela.isFinal) {
          // al cierre de vela: recálculo completo (costo acotado, 1000 velas)
          recalcularIndicadores();
          if (heatmapActivoRef.current) {
            heatmapRef.current = computeLiquidationHeatmap(velas, liqConfigRef.current);
            ultimoDibujoRef.current = null;
            solicitarDibujoHeatmap();
          }
          if (vpvrActivoRef.current) {
            ultimoVpvrKeyRef.current = null; // fuerza recálculo del perfil
            solicitarDibujoVpvr();
          }
        } else {
          solicitarActualizarUltimoPunto();
        }
      },
    });

    return () => {
      cancelado = true;
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, timeframe, modelSignals]);

  // ── Indicadores del registro (escalable: ver lib/indicators/registro) ──
  function sincronizarIndicadores() {
    const chart = chartRef.current;
    if (!chart) return;
    const mapa = seriesIndicadoresRef.current;

    // quitar los desactivados (los paneles vacíos se eliminan solos)
    for (const [id, series] of [...mapa]) {
      if (indicadoresActivos.includes(id)) continue;
      for (const s of series) {
        try {
          chart.removeSeries(s);
        } catch {}
      }
      mapa.delete(id);
    }

    // crear los nuevos
    for (const id of indicadoresActivos) {
      if (mapa.has(id)) continue;
      const def = buscarIndicador(id);
      if (!def) continue;
      // todas las series del indicador comparten el mismo panel
      const paneIndex = def.panelPropio ? chart.panes().length : 0;
      const series: SerieChart[] = def.series.map((sd) =>
        sd.tipo === "linea"
          ? chart.addSeries(
              LineSeries,
              {
                color: sd.color,
                lineWidth: 2,
                priceLineVisible: false,
                crosshairMarkerVisible: false,
              },
              paneIndex,
            )
          : chart.addSeries(
              HistogramSeries,
              { color: sd.color, priceLineVisible: false },
              paneIndex,
            ),
      );
      mapa.set(id, series);
    }

    // el panel del precio siempre más alto que los de indicadores
    try {
      chart.panes().forEach((pane, i) => pane.setStretchFactor(i === 0 ? 3 : 1));
    } catch {}

    recalcularIndicadores();
  }

  function recalcularIndicadores() {
    const velas = velasRef.current;
    if (velas.length === 0) return;
    for (const [id, series] of seriesIndicadoresRef.current) {
      const def = buscarIndicador(id);
      if (!def) continue;
      def.series.forEach((sd, i) => {
        series[i]?.setData(
          sd.calcular(velas).map((p) => ({
            time: p.time as UTCTimestamp,
            value: p.value,
            color: p.color,
          })),
        );
      });
    }
  }

  /** Update liviano intra-vela: solo el último punto de cada serie */
  function actualizarUltimoPuntoIndicadores() {
    const velas = velasRef.current;
    if (velas.length === 0) return;
    for (const [id, series] of seriesIndicadoresRef.current) {
      const def = buscarIndicador(id);
      if (!def) continue;
      def.series.forEach((sd, i) => {
        const puntos = sd.calcular(velas);
        const ultimo = puntos[puntos.length - 1];
        if (!ultimo) return;
        series[i]?.update({
          time: ultimo.time as UTCTimestamp,
          value: ultimo.value,
          color: ultimo.color,
        });
      });
    }
  }

  /**
   * Coalesce del recálculo intra-vela: el WS puede emitir cientos de ticks/s,
   * pero recalcular la serie completa de cada indicador (O(n)) tiene sentido a lo
   * sumo una vez por frame. Sin indicadores activos no agenda nada.
   */
  function solicitarActualizarUltimoPunto() {
    if (seriesIndicadoresRef.current.size === 0) return;
    if (actualizarPuntoPendienteRef.current) return;
    actualizarPuntoPendienteRef.current = true;
    requestAnimationFrame(() => {
      actualizarPuntoPendienteRef.current = false;
      actualizarUltimoPuntoIndicadores();
    });
  }

  useEffect(() => {
    sincronizarIndicadores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicadoresActivos]);

  // ── Scroll infinito: cargar el lote anterior de historial ──────────
  async function cargarMasHistorial() {
    const chart = chartRef.current;
    const serie = serieRef.current;
    if (!chart || !serie) return;
    if (cargandoHistorialRef.current || sinMasHistorialRef.current) return;
    if (velasRef.current.length === 0) return;

    cargandoHistorialRef.current = true;
    const clave = claveDatosRef.current;
    try {
      const finMs = velasRef.current[0].time * 1000 - 1;
      const previas = await fetchKlines(symbol, timeframe, 1000, finMs);
      // el par/timeframe cambió mientras se pedía: descartar la respuesta
      if (claveDatosRef.current !== clave || !serieRef.current) return;
      const nuevas = previas.filter((v) => v.time < velasRef.current[0].time);
      if (previas.length < 1000 || nuevas.length === 0)
        sinMasHistorialRef.current = true; // se agotó el historial del par
      if (nuevas.length === 0) return;

      const merged = [...nuevas, ...velasRef.current];
      velasRef.current = merged;
      recordarVelas(cacheKeyRef.current, merged); // mantener el caché al día

      // preservar la posición visible: correr el rango por las velas añadidas
      const ts = chart.timeScale();
      const rango = ts.getVisibleLogicalRange();
      serie.setData(
        merged.map((v) => ({
          time: v.time as UTCTimestamp,
          open: v.open,
          high: v.high,
          low: v.low,
          close: v.close,
        })),
      );
      if (rango) {
        ts.setVisibleLogicalRange({
          from: rango.from + nuevas.length,
          to: rango.to + nuevas.length,
        });
      }

      // recalcular las capas que dependen del arreglo de velas
      if (heatmapActivoRef.current) {
        heatmapRef.current = computeLiquidationHeatmap(merged, liqConfigRef.current);
        ultimoDibujoRef.current = null;
        solicitarDibujoHeatmap();
      }
      recalcularIndicadores();
      actualizarMarkers();
    } catch (e) {
      console.error(e);
    } finally {
      cargandoHistorialRef.current = false;
    }
  }
  cargarMasHistorialRef.current = cargarMasHistorial;

  // ── Señales del modelo como markers ────────────────────────────────
  function actualizarMarkers() {
    if (!markersRef.current) return;
    const sig = useChartStore.getState().modelSignals;
    const mostrar = useChartStore.getState().showModelSignals;
    if (
      !sig ||
      !mostrar ||
      sig.simbolo?.toUpperCase() !== symbol.toUpperCase()
    ) {
      markersRef.current.setMarkers([]);
      return;
    }
    const paso = SEGUNDOS_TF[timeframe];
    const markers: SeriesMarker<Time>[] = sig.senales.slice(-3000).map((s) => {
      const esApertura = s.evento.startsWith("abrir");
      const esLong = s.evento.endsWith("long");
      const alcista = esApertura ? esLong : !esLong; // flecha de compra o venta
      const texto = esApertura
        ? esLong
          ? "L"
          : "S"
        : s.motivo === "take_profit"
          ? "TP"
          : s.motivo === "stop_loss"
            ? "SL"
            : s.motivo === "liquidacion"
              ? "LIQ"
              : "C";
      return {
        // anclar al inicio de la vela que contiene la señal
        time: (Math.floor(s.tiempoMs / 1000 / paso) * paso) as UTCTimestamp,
        position: alcista ? "belowBar" : "aboveBar",
        shape: alcista ? "arrowUp" : "arrowDown",
        color: esApertura ? (esLong ? "#26a69a" : "#ef5350") : "#787b86",
        text: texto,
      };
    });
    markersRef.current.setMarkers(markers);
  }

  useEffect(() => {
    actualizarMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelSignals, showModelSignals, symbol, timeframe]);

  // ── Liquidation Heatmap sobre el chart ─────────────────────────────
  const dibujoPendienteRef = useRef(false);
  function solicitarDibujoHeatmap() {
    if (dibujoPendienteRef.current) return;
    dibujoPendienteRef.current = true;
    requestAnimationFrame(() => {
      dibujoPendienteRef.current = false;
      dibujarHeatmap();
    });
  }

  function dibujarHeatmap() {
    const canvas = canvasHeatmapRef.current;
    const contenedor = contenedorRef.current;
    const chart = chartRef.current;
    const serie = serieRef.current;
    if (!canvas || !contenedor || !chart || !serie) return;
    const dpr = window.devicePixelRatio || 1;
    const ancho = contenedor.clientWidth;
    const alto = contenedor.clientHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const prepararLienzo = () => {
      canvas.width = Math.floor(ancho * dpr);
      canvas.height = Math.floor(alto * dpr);
      canvas.style.width = `${ancho}px`;
      canvas.style.height = `${alto}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, ancho, alto);
    };

    const heatmap = heatmapRef.current;
    const velas = velasRef.current;
    if (!heatmap || velas.length < 2 || !heatmapActivoRef.current) {
      ultimoDibujoRef.current = null;
      prepararLienzo();
      return;
    }

    const rango = chart.timeScale().getVisibleRange();
    if (!rango) return;
    const desde = Number(rango.from);
    const hasta = Number(rango.to);
    const desdeIdx = Math.max(0, velas.findIndex((v) => v.time >= desde));
    let hastaIdx = velas.length - 1;
    while (hastaIdx > 0 && velas[hastaIdx].time > hasta) hastaIdx--;
    if (hastaIdx <= desdeIdx) return;

    // coordenadas en píxeles del área visible (la librería las expone)
    const xIni = chart.timeScale().timeToCoordinate(velas[desdeIdx].time as UTCTimestamp);
    const xFin = chart.timeScale().timeToCoordinate(velas[hastaIdx].time as UTCTimestamp);
    const { minPrice, bins, binSize } = heatmap;
    const yTop = serie.priceToCoordinate(minPrice + bins * binSize);
    const yBottom = serie.priceToCoordinate(minPrice);
    if (xIni === null || xFin === null || yTop === null || yBottom === null) return;

    const claveDibujo = `${ancho}x${alto}|${xIni},${xFin}|${yTop},${yBottom}|${desdeIdx},${hastaIdx}`;
    if (claveDibujo === ultimoDibujoRef.current) return;
    ultimoDibujoRef.current = claveDibujo;
    prepararLienzo();

    const cfg = liqConfigRef.current;
    const imagen = crearImagenHeatmap(heatmap, desdeIdx, hastaIdx, {
      umbral: cfg.umbral,
      opacidad: cfg.opacidad,
    });
    if (!imagen) return;

    // limitar el dibujo al panel del precio (el primero)
    const anchoPlot = chart.timeScale().width();
    const altoPlot = chart.paneSize().height;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, anchoPlot, altoPlot);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(imagen, xIni, yTop, Math.max(1, xFin - xIni), yBottom - yTop);
    ctx.restore();
  }

  useEffect(() => {
    ultimoDibujoRef.current = null;
    solicitarDibujoHeatmap();
    // el pan/zoom dispara el subscribe; este interval cubre el autoscale de
    // precio y los resize (barato: si nada cambió, dibujarHeatmap no repinta)
    const id = heatmapActivo ? window.setInterval(solicitarDibujoHeatmap, 500) : 0;
    return () => {
      if (id) window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heatmapActivo]);

  // recomputar/redibujar el heatmap cuando cambia el filtro de órdenes
  useEffect(() => {
    if (!heatmapActivo) return;
    const velas = velasRef.current;
    if (velas.length >= 2) {
      heatmapRef.current = computeLiquidationHeatmap(velas, liqConfig);
    }
    ultimoDibujoRef.current = null;
    solicitarDibujoHeatmap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liqConfig]);

  // ── Volume Profile Visible Range (VPVR) ────────────────────────────
  function solicitarDibujoVpvr() {
    if (dibujoPendienteVpvrRef.current) return;
    dibujoPendienteVpvrRef.current = true;
    requestAnimationFrame(() => {
      dibujoPendienteVpvrRef.current = false;
      dibujarVpvr();
    });
  }

  function dibujarVpvr() {
    const canvas = canvasVpvrRef.current;
    const contenedor = contenedorRef.current;
    const chart = chartRef.current;
    const serie = serieRef.current;
    if (!canvas || !contenedor || !chart || !serie) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const ancho = contenedor.clientWidth;
    const alto = contenedor.clientHeight;

    const prepararLienzo = () => {
      canvas.width = Math.floor(ancho * dpr);
      canvas.height = Math.floor(alto * dpr);
      canvas.style.width = `${ancho}px`;
      canvas.style.height = `${alto}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, ancho, alto);
    };

    const velas = velasRef.current;
    if (!vpvrActivoRef.current || velas.length < 2) {
      ultimoVpvrKeyRef.current = null;
      prepararLienzo();
      return;
    }

    const rango = chart.timeScale().getVisibleRange();
    if (!rango) return;
    const desde = Number(rango.from);
    const hasta = Number(rango.to);
    let desdeIdx = velas.findIndex((v) => v.time >= desde);
    if (desdeIdx < 0) desdeIdx = 0;
    let hastaIdx = velas.length - 1;
    while (hastaIdx > 0 && velas[hastaIdx].time > hasta) hastaIdx--;
    if (hastaIdx <= desdeIdx) {
      prepararLienzo();
      return;
    }

    const cfg = vpvrConfigRef.current;
    // recomputar el perfil solo si cambió el rango / config / datos
    const clave = `${desdeIdx},${hastaIdx}|${cfg.rows}|${cfg.vaPercent}|${velas.length}`;
    if (clave !== ultimoVpvrKeyRef.current || !vpvrRef.current) {
      vpvrRef.current = computeVolumeProfile(
        velas,
        desdeIdx,
        hastaIdx,
        cfg.rows,
        cfg.vaPercent,
      );
      ultimoVpvrKeyRef.current = clave;
    }
    const perfil = vpvrRef.current;
    prepararLienzo();
    if (!perfil) return;

    const plotW = chart.timeScale().width();
    const plotH = chart.paneSize().height;
    const bandW = Math.max(30, plotW * cfg.anchoPct);
    const izquierda = cfg.lado === "izquierda";
    const op = cfg.opacidad;
    const precioBin = (b: number) => perfil.minPrice + b * perfil.binSize;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, plotW, plotH);
    ctx.clip();

    // banda de fondo del Value Area
    if (cfg.mostrarVA) {
      const yTop = serie.priceToCoordinate(precioBin(perfil.vaHighIndex + 1));
      const yBot = serie.priceToCoordinate(precioBin(perfil.vaLowIndex));
      if (yTop !== null && yBot !== null) {
        ctx.fillStyle = hexToRgba(cfg.colorVA, 0.08 * op);
        const bx = izquierda ? 0 : plotW - bandW;
        ctx.fillRect(bx, Math.min(yTop, yBot), bandW, Math.abs(yBot - yTop));
      }
    }

    // barras del perfil (una por bin de precio)
    for (let b = 0; b < perfil.rows; b++) {
      const tot = perfil.total[b];
      if (tot <= 0) continue;
      const yTop = serie.priceToCoordinate(precioBin(b + 1));
      const yBot = serie.priceToCoordinate(precioBin(b));
      if (yTop === null || yBot === null) continue;
      const y = Math.min(yTop, yBot);
      const hRow = Math.max(1, Math.abs(yBot - yTop) - 1);
      const lenTot = (tot / perfil.maxBin) * bandW;
      const dentroVA = b >= perfil.vaLowIndex && b <= perfil.vaHighIndex;

      if (b === perfil.pocIndex) {
        ctx.fillStyle = hexToRgba(cfg.colorPOC, 0.9 * op);
        ctx.fillRect(izquierda ? 0 : plotW - lenTot, y, lenTot, hRow);
      } else if (dentroVA) {
        const lenBuy = (perfil.buy[b] / perfil.maxBin) * bandW;
        const lenSell = (perfil.sell[b] / perfil.maxBin) * bandW;
        if (izquierda) {
          ctx.fillStyle = hexToRgba(cfg.colorAlcista, 0.85 * op);
          ctx.fillRect(0, y, lenBuy, hRow);
          ctx.fillStyle = hexToRgba(cfg.colorBajista, 0.85 * op);
          ctx.fillRect(lenBuy, y, lenSell, hRow);
        } else {
          ctx.fillStyle = hexToRgba(cfg.colorAlcista, 0.85 * op);
          ctx.fillRect(plotW - lenTot, y, lenBuy, hRow);
          ctx.fillStyle = hexToRgba(cfg.colorBajista, 0.85 * op);
          ctx.fillRect(plotW - lenSell, y, lenSell, hRow);
        }
      } else {
        ctx.fillStyle = hexToRgba(cfg.colorFueraVA, 0.6 * op);
        ctx.fillRect(izquierda ? 0 : plotW - lenTot, y, lenTot, hRow);
      }
    }

    // líneas POC / VAH / VAL a lo largo del plot con etiqueta
    const linea = (precio: number, color: string, etiqueta: string) => {
      const yy = serie.priceToCoordinate(precio);
      if (yy === null) return;
      ctx.strokeStyle = hexToRgba(color, 0.9 * op);
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(0, yy);
      ctx.lineTo(plotW, yy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = "9px Inter, system-ui, sans-serif";
      ctx.fillStyle = hexToRgba(color, op);
      const w = ctx.measureText(etiqueta).width;
      ctx.fillText(etiqueta, izquierda ? bandW + 4 : plotW - bandW - 4 - w, yy - 2);
    };
    linea(precioBin(perfil.pocIndex + 0.5), cfg.colorPOC, "POC");
    if (cfg.mostrarVA) {
      linea(precioBin(perfil.vaHighIndex + 1), cfg.colorVA, "VAH");
      linea(precioBin(perfil.vaLowIndex), cfg.colorVA, "VAL");
    }

    // marcas de High/Low Volume Nodes
    if (cfg.mostrarHvnLvn) {
      const marca = (b: number, color: string) => {
        const yy = serie.priceToCoordinate(precioBin(b + 0.5));
        if (yy === null) return;
        ctx.fillStyle = hexToRgba(color, op);
        ctx.fillRect(izquierda ? bandW + 2 : plotW - bandW - 6, yy - 1, 4, 2);
      };
      perfil.hvn.forEach((b) => marca(b, cfg.colorAlcista));
      perfil.lvn.forEach((b) => marca(b, cfg.colorBajista));
    }

    ctx.restore();
  }

  useEffect(() => {
    ultimoVpvrKeyRef.current = null;
    solicitarDibujoVpvr();
    // interval: cubre autoscale de precio y resize (barato si nada cambió)
    const id = vpvrActivo ? window.setInterval(solicitarDibujoVpvr, 500) : 0;
    return () => {
      if (id) window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vpvrActivo]);

  // redibujar cuando cambia la configuración del VPVR
  useEffect(() => {
    if (!vpvrActivo) return;
    ultimoVpvrKeyRef.current = null;
    solicitarDibujoVpvr();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vpvrConfig]);

  // ── Footprint (Bid×Ask por nivel dentro de cada vela) ──────────────
  function solicitarDibujoFootprint() {
    if (dibujoPendienteFpRef.current) return;
    dibujoPendienteFpRef.current = true;
    requestAnimationFrame(() => {
      dibujoPendienteFpRef.current = false;
      dibujarFootprint();
    });
  }

  function dibujarFootprint() {
    const canvas = canvasFootprintRef.current;
    const contenedor = contenedorRef.current;
    const chart = chartRef.current;
    const serie = serieRef.current;
    if (!canvas || !contenedor || !chart || !serie) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const ancho = contenedor.clientWidth;
    const alto = contenedor.clientHeight;
    canvas.width = Math.floor(ancho * dpr);
    canvas.height = Math.floor(alto * dpr);
    canvas.style.width = `${ancho}px`;
    canvas.style.height = `${alto}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, ancho, alto);

    const agg = agregadorFpRef.current;
    const velas = velasRef.current;
    if (!footprintActivoRef.current || !agg || velas.length < 2) return;
    const tick = agg.tickActual();
    if (tick <= 0) return; // aún sin trades

    const cfg = footprintConfigRef.current;
    const barSpacing = chart.timeScale().options().barSpacing ?? 6;
    if (barSpacing < cfg.minAncho) return; // demasiado zoom out para los números

    const rango = chart.timeScale().getVisibleRange();
    if (!rango) return;
    const desde = Number(rango.from);
    const hasta = Number(rango.to);
    let desdeIdx = velas.findIndex((v) => v.time >= desde);
    if (desdeIdx < 0) desdeIdx = 0;
    let hastaIdx = velas.length - 1;
    while (hastaIdx > 0 && velas[hastaIdx].time > hasta) hastaIdx--;

    // altura de fila (constante: el tick es uniforme)
    const y0 = serie.priceToCoordinate(tick);
    const y1 = serie.priceToCoordinate(2 * tick);
    if (y0 === null || y1 === null) return;
    const rowH = Math.abs(y0 - y1);
    if (rowH < 9) return; // filas demasiado juntas para escribir números

    const colW = Math.min(60, barSpacing * 0.46);
    const op = cfg.opacidad;
    const plotW = chart.timeScale().width();
    const plotH = chart.paneSize().height;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, plotW, plotH);
    ctx.clip();
    ctx.font = "9px Inter, system-ui, sans-serif";
    ctx.textBaseline = "middle";

    for (let i = desdeIdx; i <= hastaIdx; i++) {
      const c = velas[i];
      const fp = agg.velaDe(c.time);
      if (!fp) continue;
      const cx = chart.timeScale().timeToCoordinate(c.time as UTCTimestamp);
      if (cx === null) continue;

      for (const [nivel, celda] of fp.niveles) {
        const yTop = serie.priceToCoordinate((nivel + 1) * tick);
        if (yTop === null) continue;
        const y = yTop;
        const yMid = y + rowH / 2;
        if (y + rowH < 0 || y > plotH) continue; // fuera de vista

        const askDom = celda.ask > 0 && celda.ask >= cfg.imbalance * celda.bid;
        const bidDom = celda.bid > 0 && celda.bid >= cfg.imbalance * celda.ask;
        const esPoc = nivel === fp.pocNivel;

        // fondos de desequilibrio
        if (bidDom) {
          ctx.fillStyle = hexToRgba(cfg.colorBid, 0.22 * op);
          ctx.fillRect(cx - colW, y, colW, rowH - 1);
        }
        if (askDom) {
          ctx.fillStyle = hexToRgba(cfg.colorAsk, 0.22 * op);
          ctx.fillRect(cx, y, colW, rowH - 1);
        }
        // POC de la vela: recuadro
        if (esPoc) {
          ctx.strokeStyle = hexToRgba(cfg.colorPOC, 0.9 * op);
          ctx.lineWidth = 1;
          ctx.strokeRect(cx - colW, y + 0.5, colW * 2, rowH - 1);
        }
        // números bid (izq) / ask (der)
        ctx.textAlign = "right";
        ctx.fillStyle = hexToRgba(
          bidDom ? cfg.colorBid : "#9aa0aa",
          (bidDom ? 1 : 0.75) * op,
        );
        ctx.fillText(formatVolume(celda.bid), cx - 3, yMid);
        ctx.textAlign = "left";
        ctx.fillStyle = hexToRgba(
          askDom ? cfg.colorAsk : "#9aa0aa",
          (askDom ? 1 : 0.75) * op,
        );
        ctx.fillText(formatVolume(celda.ask), cx + 3, yMid);
      }
      // divisor central de la vela
      ctx.strokeStyle = hexToRgba("#2a2e39", 0.8 * op);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, plotH);
      ctx.stroke();
    }
    ctx.restore();
  }

  // crear/destruir el agregador de Footprint y su suscripción a @aggTrade
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !footprintActivo) {
      agregadorFpRef.current = null;
      solicitarDibujoFootprint();
      return;
    }
    const paso = SEGUNDOS_TF[timeframe];
    const agg = new AgregadorFootprint(paso, footprintEscala);
    agregadorFpRef.current = agg;

    const ws = getBinanceWS();
    const unsub = ws.subscribeAggTrade(symbol, (t) => {
      agg.agregar(t);
      solicitarDibujoFootprint();
    });
    return () => {
      unsub();
      agregadorFpRef.current = null;
      solicitarDibujoFootprint();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [footprintActivo, symbol, timeframe, footprintEscala]);

  // interval de refresco (cubre autoscale de precio y resize, barato si nada cambió)
  useEffect(() => {
    solicitarDibujoFootprint();
    const id = footprintActivo ? window.setInterval(solicitarDibujoFootprint, 500) : 0;
    return () => {
      if (id) window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [footprintActivo]);

  // redibujar cuando cambian los ajustes de dibujo del Footprint
  useEffect(() => {
    if (footprintActivo) solicitarDibujoFootprint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [footprintConfig]);

  // ── Operación abierta de ejemplo (demo) sobre el chart ─────────────
  function solicitarDibujoPosicion() {
    if (dibujoPendientePosRef.current) return;
    dibujoPendientePosRef.current = true;
    requestAnimationFrame(() => {
      dibujoPendientePosRef.current = false;
      dibujarPosicion();
    });
  }

  function dibujarPosicion() {
    const canvas = canvasPosRef.current;
    const contenedor = contenedorRef.current;
    const chart = chartRef.current;
    const serie = serieRef.current;
    if (!canvas || !contenedor || !chart || !serie) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const ancho = contenedor.clientWidth;
    const alto = contenedor.clientHeight;
    canvas.width = Math.floor(ancho * dpr);
    canvas.height = Math.floor(alto * dpr);
    canvas.style.width = `${ancho}px`;
    canvas.style.height = `${alto}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, ancho, alto);

    const pos = posicionDemoRef.current;
    const velas = velasRef.current;
    if (!pos || velas.length < 2) return;

    let entrada: { time: number; precio: number; lado: "long" | "short" };
    if (pos.esDemo || pos.precioEntrada === null) {
      // demo: anclar a una vela real ~25 velas atrás (una sola vez)
      if (!entradaDemoRef.current || entradaDemoRef.current.lado !== pos.lado) {
        const idx = Math.max(0, velas.length - 1 - 25);
        entradaDemoRef.current = {
          time: velas[idx].time,
          precio: velas[idx].close,
          lado: pos.lado,
        };
      }
      entrada = entradaDemoRef.current;
    } else {
      // operación REAL: precio de entrada del motor y, si publica la hora de
      // apertura, la vela que la contiene. Sin hora, se ancla al borde
      // izquierdo visible (la línea de entrada igual queda al precio correcto).
      const tSeg = pos.aperturaMs !== null ? Math.floor(pos.aperturaMs / 1000) : null;
      entrada = {
        time: tSeg ?? velas[Math.max(0, velas.length - 1 - 25)].time,
        precio: pos.precioEntrada,
        lado: pos.lado,
      };
    }
    const ultima = velas[velas.length - 1];
    // Un motor en replay publica su propio precio (histórico): medir el PnL
    // contra el cierre en vivo del gráfico daría una caja que contradice al
    // panel. Con motor en vivo, precioReferencia es null y manda el gráfico.
    const precioActual = pos.precioReferencia ?? ultima.close;

    const ts = chart.timeScale();
    const plotW = ts.width();
    const plotH = chart.paneSize().height;
    const xEraw = ts.timeToCoordinate(entrada.time as UTCTimestamp);
    const xAraw = ts.timeToCoordinate(ultima.time as UTCTimestamp);
    const yEc = serie.priceToCoordinate(entrada.precio);
    if (yEc === null) return;
    const xE: number = xEraw ?? 0; // entrada fuera de vista por la izquierda → borde
    const xA: number = xAraw ?? plotW;
    const yE: number = yEc;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, plotW, plotH);
    ctx.clip();

    // Resolver precios a píxeles es lo único que puede hacer este componente
    // (es quien tiene el chart); el dibujo en sí vive en lib/chart y no sabe
    // nada de gráficos, así que se puede renderizar y revisar por separado.
    const yDe = (precio: number | null) =>
      precio === null ? null : serie.priceToCoordinate(precio);
    pintarPosicion(
      ctx,
      {
        lado: pos.lado,
        etiqueta: pos.etiqueta,
        precioEntrada: entrada.precio,
        precioActual,
        stopLoss: pos.stopLoss,
        takeProfit: pos.takeProfit,
        nocional: pos.nocional,
      },
      {
        xEntrada: Math.min(xE, xA),
        xFin: plotW,
        yEntrada: yE,
        ySl: yDe(pos.stopLoss),
        yTp: yDe(pos.takeProfit),
      },
    );

    ctx.restore();
  }

  useEffect(() => {
    // el ancla de la demo se descarta al salir de ella: si vuelve, se
    // re-ancla a una vela reciente en vez de reusar una fuera de pantalla
    if (!posicionEnGrafico?.esDemo) entradaDemoRef.current = null;
    solicitarDibujoPosicion();
    // refresco periódico: cubre autoscale de precio, resize y el avance del
    // precio actual mientras la operación sigue abierta
    const id = posicionEnGrafico
      ? window.setInterval(solicitarDibujoPosicion, 500)
      : 0;
    return () => {
      if (id) window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posicionEnGrafico]);

  // ── Order Flow / CVD (pane propio, en vivo desde @aggTrade) ────────
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (!orderFlowActivo) {
      pintarOrderFlow(ofReadoutRef.current, null);
      return;
    }

    const readout = ofReadoutRef.current;
    const paso = SEGUNDOS_TF[timeframe];
    const agg = new AgregadorOrderFlow(paso);

    // pane propio: histograma de delta por vela + línea de CVD acumulado
    const paneIndex = chart.panes().length;
    const serieDelta = chart.addSeries(
      HistogramSeries,
      {
        priceScaleId: "of-delta",
        priceFormat: { type: "volume" },
        priceLineVisible: false,
        lastValueVisible: false,
        base: 0,
      },
      paneIndex,
    );
    serieDelta.priceScale().applyOptions({ scaleMargins: { top: 0.25, bottom: 0 } });
    const serieCvd = chart.addSeries(
      LineSeries,
      {
        color: "#2962ff",
        lineWidth: 2,
        priceScaleId: "right",
        priceFormat: { type: "volume" },
        priceLineVisible: false,
        crosshairMarkerVisible: false,
      },
      paneIndex,
    );
    serieCvd.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });
    // el panel del precio siempre más alto que el de order flow
    try {
      chart.panes().forEach((p, i) => p.setStretchFactor(i === 0 ? 3 : 1));
    } catch {}

    let vivo = true;
    let rafId = 0;
    const flush = () => {
      rafId = 0;
      if (!vivo) return;
      const l = agg.lectura();
      if (!l) return;
      serieCvd.update({ time: l.time as UTCTimestamp, value: l.cvd });
      serieDelta.update({
        time: l.time as UTCTimestamp,
        value: l.delta,
        color: l.delta >= 0 ? "rgba(38,166,154,0.6)" : "rgba(239,83,80,0.6)",
      });
      pintarOrderFlow(readout, {
        delta: l.delta,
        cvd: l.cvd,
        buy: l.buy,
        sell: l.sell,
        ratioCompra: l.ratioCompra,
      });
    };
    // coalescer los updates a ~1 por frame (BTC puede dar cientos de trades/s)
    const programarFlush = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(flush);
    };

    const ws = getBinanceWS();
    const unsub = ws.subscribeAggTrade(symbol, (t) => {
      agg.agregar(t);
      programarFlush();
    });

    return () => {
      vivo = false;
      if (rafId) cancelAnimationFrame(rafId);
      unsub();
      try {
        chart.removeSeries(serieDelta);
      } catch {}
      try {
        chart.removeSeries(serieCvd);
      } catch {}
      pintarOrderFlow(readout, null);
      try {
        chart.panes().forEach((p, i) => p.setStretchFactor(i === 0 ? 3 : 1));
      } catch {}
    };
  }, [orderFlowActivo, symbol, timeframe]);

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div data-label="grafico" data-timeframe={timeframe} className="flex h-full w-full flex-col">
      {mostrarBarraTF && (
        <nav
          data-label="grafico-selector-tf"
          aria-label="Temporalidad del gráfico"
          className="flex h-8 shrink-0 items-center gap-0.5 border-b border-tv-border bg-tv-panel px-2"
        >
          {TIMEFRAMES_UI.map((tf) => (
            <button
              key={tf}
              onClick={() => onTimeframeChange(tf)}
              className={cn(
                "rounded px-2 py-0.5 text-xs",
                tf === timeframe
                  ? "bg-tv-blue/15 text-tv-blue"
                  : "text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
              )}
            >
              {tf}
            </button>
          ))}
          <span className="ml-auto text-[10px] tabular-nums text-tv-text-dim">
            {symbol} · {timeframe}
          </span>
        </nav>
      )}
      {/* Lienzo: el div de lightweight-charts abajo y las capas propias en
          canvas superpuestos. min-h-0 permite que encoja; sin él, el gráfico
          mantendría su alto natural y desbordaría el marco hacia abajo. */}
      <div data-label="grafico-lienzo" className="relative min-h-0 flex-1">
        <div
          ref={contenedorRef}
          data-label="grafico-canvas-velas"
          className="h-full w-full"
        />
        <canvas
          ref={canvasFootprintRef}
          data-label="grafico-capa-footprint"
          className="pointer-events-none absolute left-0 top-0 z-[3]"
        />
        <canvas
          ref={canvasVpvrRef}
          data-label="grafico-capa-vpvr"
          className="pointer-events-none absolute left-0 top-0 z-[4]"
        />
        <canvas
          ref={canvasHeatmapRef}
          data-label="grafico-capa-heatmap"
          className="pointer-events-none absolute left-0 top-0 z-[5]"
        />
        <canvas
          ref={canvasPosRef}
          data-label="grafico-capa-posicion"
          className="pointer-events-none absolute left-0 top-0 z-[6]"
        />
        <div
          ref={leyendaRef}
          data-label="grafico-leyenda-ohlc"
          className="pointer-events-none absolute left-2 top-2 z-[6] hidden items-center whitespace-nowrap rounded bg-tv-bg/70 px-2 py-1 text-[11px] tabular-nums backdrop-blur-sm"
        />
        <div
          ref={ofReadoutRef}
          data-label="grafico-lectura-orderflow"
          className="pointer-events-none absolute bottom-2 left-2 z-[6] hidden items-center whitespace-nowrap rounded bg-tv-bg/80 px-2 py-1 text-[11px] tabular-nums backdrop-blur-sm"
        />
      </div>
    </div>
  );
}
