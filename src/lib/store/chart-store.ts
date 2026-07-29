"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Timeframe } from "@/lib/binance/types";
import {
  MINUTOS_POR_TEMPORALIDAD,
  ms_queAbarca,
  temporalidadParaPeriodo,
} from "@/lib/binance/temporalidades";
import { HERRAMIENTA_POR_DEFECTO } from "@/lib/herramientas/registro";
import { NIVELES_APALANCAMIENTO } from "@/lib/indicators/liquidations";
import type { ModelSignalsFile } from "@/lib/modelos/nucleo/senales";
import {
  aislar,
  alternarCapa,
  alternarVisible,
  VISIBILIDAD_POR_DEFECTO,
  type VisibilidadModelo,
} from "@/lib/modelos/nucleo/visibilidad";

/**
 * Overlays propios superpuestos al chart (los indicadores clásicos viven en
 * el registro de lib/indicators/registro.ts y se activan por id en
 * `indicadoresActivos`).
 */
export type IndicatorKey = "liqHeatmap" | "vpvr" | "orderFlow" | "footprint";

/**
 * Filtro de órdenes profesional del Liquidation Heatmap. `apalancamientos` y
 * `lado` afectan el cálculo; `umbral` y `opacidad` solo el dibujo.
 */
export interface LiqHeatmapConfig {
  /** Apalancamientos incluidos (subconjunto de NIVELES_APALANCAMIENTO). */
  apalancamientos: number[];
  /** Liquidaciones mostradas: ambas, solo long o solo short. */
  lado: "ambos" | "long" | "short";
  /** Intensidad normalizada mínima (0..1) para pintar: filtra órdenes débiles. */
  umbral: number;
  /** Opacidad global (0..1). */
  opacidad: number;
}

const LIQ_HEATMAP_CONFIG_DEFAULT: LiqHeatmapConfig = {
  apalancamientos: [...NIVELES_APALANCAMIENTO],
  lado: "ambos",
  umbral: 0.05,
  opacidad: 1,
};

/**
 * Configuración del Volume Profile Visible Range (VPVR). `rows` y `vaPercent`
 * afectan el cálculo del perfil; el resto es puramente visual (dibujo).
 */
export interface VpvrConfig {
  /** Cantidad de filas (bins de precio) del perfil */
  rows: number;
  /** Porcentaje de volumen que define el Value Area (0.5..0.9) */
  vaPercent: number;
  /** Lado del chart donde se dibuja el perfil */
  lado: "izquierda" | "derecha";
  /** Ancho del perfil como fracción del área de precio (0.1..0.6) */
  anchoPct: number;
  /** Opacidad global (0..1) */
  opacidad: number;
  /** Resaltar el Value Area (banda + líneas VAH/VAL) */
  mostrarVA: boolean;
  /** Marcar High/Low Volume Nodes */
  mostrarHvnLvn: boolean;
  colorAlcista: string;
  colorBajista: string;
  colorPOC: string;
  colorVA: string;
  colorFueraVA: string;
}

const VPVR_CONFIG_DEFAULT: VpvrConfig = {
  rows: 24,
  vaPercent: 0.7,
  lado: "derecha",
  anchoPct: 0.3,
  opacidad: 0.85,
  mostrarVA: true,
  mostrarHvnLvn: false,
  colorAlcista: "#26a69a",
  colorBajista: "#ef5350",
  colorPOC: "#2962ff",
  colorVA: "#b2b5be",
  colorFueraVA: "#5d6069",
};

/**
 * Configuración del Footprint (Bid×Ask por nivel de precio). `escala` afecta el
 * cálculo (tamaño del nivel de precio); el resto es dibujo.
 */
export interface FootprintConfig {
  /** Multiplicador del tick automático (~1% del precio): más chico = más filas */
  escala: number;
  /** Ratio (≥1) para resaltar desequilibrio bid/ask de una celda */
  imbalance: number;
  /** Ancho mínimo de vela (px) para dibujar los números (evita el amontonamiento) */
  minAncho: number;
  /** Opacidad global (0..1) */
  opacidad: number;
  colorAsk: string; // compra agresora
  colorBid: string; // venta agresora
  colorPOC: string;
}

const FOOTPRINT_CONFIG_DEFAULT: FootprintConfig = {
  escala: 0.5,
  imbalance: 3,
  minAncho: 56,
  opacidad: 0.9,
  colorAsk: "#26a69a",
  colorBid: "#ef5350",
  colorPOC: "#2962ff",
};

/**
 * Las señales de trading son del DOMINIO, no de la interfaz: viven en
 * `lib/modelos/nucleo/senales.ts` y las usan por igual el contrato de los modelos,
 * el cálculo de operaciones y este store. Se re-exportan acá para que los
 * imports existentes (`from "@/lib/store/chart-store"`) sigan funcionando.
 */
export type { ModelSignal, ModelSignalsFile } from "@/lib/modelos/nucleo/senales";

export const DEFAULT_WATCHLIST = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "DOGEUSDT",
  "ADAUSDT",
  "AVAXUSDT",
  "LINKUSDT",
  "MATICUSDT",
];

/** Timeframes que se sugieren al abrir ventanas nuevas del layout */
const PRESET_VENTANAS: Timeframe[] = ["1m", "5m", "15m", "1h", "4h", "1d", "1w"];

/** Máximo de ventanas de timeframe abiertas simultáneamente */
export const MAX_VENTANAS = 10;

/**
 * Una ventana del layout: mismo par (global) con su propio timeframe. La
 * posición/tamaño ya no se guardan: el layout es por plantilla (columnas
 * equilibradas) con divisores redimensionables, estilo TradingView.
 */
export interface VentanaTF {
  id: string;
  timeframe: Timeframe;
}

function crearId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `v${Date.now()}${Math.random().toString(16).slice(2, 8)}`;
}

/** Timeframe sugerido para una ventana nueva, evitando repetir los ya usados. */
function tfSugerido(usados: Timeframe[]): Timeframe {
  return PRESET_VENTANAS.find((t) => !usados.includes(t)) ?? "1h";
}

/**
 * ¿Es una temporalidad que el visor sabe manejar?
 *
 * El estado persistido viene de `localStorage`, o sea de una versión ANTERIOR
 * del producto. Si mañana se renombra o se retira una temporalidad, todos los
 * usuarios existentes seguirían arrastrando la vieja: `MINUTOS_POR_TEMPORALIDAD`
 * devuelve `undefined`, el paso de vela sale `NaN` y a partir de ahí los
 * marcadores no se dibujan, el Order Flow no agrupa y Binance rechaza el
 * `interval`. Todo en silencio, sin un error visible.
 */
function esTemporalidadValida(v: unknown): v is Timeframe {
  return typeof v === "string" && v in MINUTOS_POR_TEMPORALIDAD;
}

interface ChartState {
  symbol: string;
  /** Ventanas de timeframe del mosaico (drag & drop, redimensionables) */
  ventanasTF: VentanaTF[];
  /** Id de la ventana maximizada a pantalla completa (efímero, no persiste) */
  ventanaMaximizada: string | null;
  /** Overlays propios activos sobre el chart */
  indicators: Record<IndicatorKey, boolean>;
  /** Filtro de órdenes del Liquidation Heatmap */
  liqHeatmapConfig: LiqHeatmapConfig;
  /** Configuración del Volume Profile Visible Range */
  vpvrConfig: VpvrConfig;
  /** Configuración del Footprint (Bid×Ask por nivel) */
  footprintConfig: FootprintConfig;
  /** Ids de indicadores del registro activos (aplican a todas las ventanas) */
  indicadoresActivos: string[];
  watchlist: string[];
  /** Watchlist (barra lateral derecha) visible */
  watchlistVisible: boolean;

  // Ephemeral UI state (not persisted)
  symbolDialogOpen: boolean;
  /** Modo inmersivo: solo los gráficos a pantalla completa (efímero) */
  soloGraficos: boolean;
  /** Buy/sell signals of the RL model loaded from senales.json (null = none) */
  modelSignals: ModelSignalsFile | null;
  /** Show/hide the loaded signals without discarding them */
  showModelSignals: boolean;
  /**
   * Herramienta de dibujo activa (id del registro de `lib/herramientas`).
   *
   * Es GLOBAL, como `indicadoresActivos`: la barra lateral es una sola y
   * gobierna todas las ventanas del mosaico. El trazo en curso, en cambio, es
   * de cada ventana y vive en un ref dentro de `ChartLigero` — no en el store,
   * porque cambia con cada movimiento del cursor y re-renderizaría el gráfico
   * entero decenas de veces por segundo.
   *
   * Efímera a propósito: no se persiste. Arrancar una sesión con la regla
   * activada sin haberla pedido se siente como un gráfico que no responde.
   */
  herramientaActiva: string;
  /**
   * Qué dibuja cada modelo sobre el gráfico, por id.
   *
   * Persiste: es una preferencia de visualización, y volver a abrir el visor
   * con las capas que dejaste puestas es lo esperable. Los modelos que nunca
   * se tocaron no tienen entrada — `visibilidadDe()` aplica los defaults.
   */
  visibilidadModelos: Record<string, VisibilidadModelo>;
  /** Strategy Tester bottom panel (registro de operaciones de la IA) */
  tradesPanelOpen: boolean;
  /** Operación abierta de ejemplo dibujada sobre el gráfico (demo, efímera) */
  posicionDemo: { lado: "long" | "short" } | null;

  // Actions
  setSymbol: (s: string) => void;
  agregarVentana: (tf?: Timeframe) => void;
  quitarVentana: (id: string) => void;
  setVentanaTimeframe: (id: string, tf: Timeframe) => void;
  /**
   * Sube la temporalidad de las ventanas que NO alcanzan a mostrar un período
   * de `duracionMs`. Lo llama la carga de señales de un backtest.
   */
  ajustarTemporalidadesAlPeriodo: (duracionMs: number) => void;
  setNumeroVentanas: (n: number) => void;
  intercambiarVentanas: (idA: string, idB: string) => void;
  toggleMaximizarVentana: (id: string) => void;
  toggleIndicator: (key: IndicatorKey) => void;
  setLiqHeatmapConfig: (patch: Partial<LiqHeatmapConfig>) => void;
  setVpvrConfig: (patch: Partial<VpvrConfig>) => void;
  setFootprintConfig: (patch: Partial<FootprintConfig>) => void;
  toggleIndicadorActivo: (id: string) => void;
  addToWatchlist: (s: string) => void;
  removeFromWatchlist: (s: string) => void;
  toggleWatchlist: () => void;
  setSoloGraficos: (v: boolean) => void;
  setSymbolDialogOpen: (v: boolean) => void;
  /**
   * `abrirPanel: false` actualiza las señales sin forzar la apertura del
   * Probador — lo usan las fuentes en vivo, que refrescan solas.
   */
  setModelSignals: (
    f: ModelSignalsFile | null,
    opciones?: { abrirPanel?: boolean },
  ) => void;
  toggleShowModelSignals: () => void;
  setTradesPanelOpen: (v: boolean) => void;
  setPosicionDemo: (p: { lado: "long" | "short" } | null) => void;
  setHerramientaActiva: (id: string) => void;
  /** Enciende/apaga TODO lo de un modelo, conservando sus capas. */
  alternarModeloVisible: (id: string) => void;
  /** Enciende/apaga UNA capa (entradas, salidas, posición, SL/TP). */
  alternarCapaModelo: (
    id: string,
    capa: keyof Omit<VisibilidadModelo, "visible">,
  ) => void;
  /** Deja visible solo este modelo; repetirlo vuelve a mostrarlos todos. */
  aislarModelo: (id: string, ids: readonly string[]) => void;
  /** Vuelve todos los modelos a la visibilidad de fábrica. */
  mostrarTodosLosModelos: (ids: readonly string[]) => void;
}

export const useChartStore = create<ChartState>()(
  persist(
    (set) => ({
      symbol: "BTCUSDT",
      ventanasTF: [{ id: crearId(), timeframe: "15m" }],
      ventanaMaximizada: null,
      indicators: {
        liqHeatmap: false,
        vpvr: false,
        orderFlow: false,
        footprint: false,
      },
      liqHeatmapConfig: LIQ_HEATMAP_CONFIG_DEFAULT,
      vpvrConfig: VPVR_CONFIG_DEFAULT,
      footprintConfig: FOOTPRINT_CONFIG_DEFAULT,
      indicadoresActivos: [],
      watchlist: DEFAULT_WATCHLIST,
      watchlistVisible: true,
      symbolDialogOpen: false,
      soloGraficos: false,
      modelSignals: null,
      showModelSignals: true,
      tradesPanelOpen: false,
      posicionDemo: null,
      herramientaActiva: HERRAMIENTA_POR_DEFECTO,
      visibilidadModelos: {},

      setSymbol: (symbol) => set({ symbol }),
      agregarVentana: (tf) =>
        set((s) => {
          if (s.ventanasTF.length >= MAX_VENTANAS) return s;
          const nueva: VentanaTF = {
            id: crearId(),
            timeframe: tf ?? tfSugerido(s.ventanasTF.map((v) => v.timeframe)),
          };
          return {
            ventanasTF: [...s.ventanasTF, nueva],
            ventanaMaximizada: null,
          };
        }),
      quitarVentana: (id) =>
        set((s) => {
          if (s.ventanasTF.length <= 1) return s;
          return {
            ventanasTF: s.ventanasTF.filter((v) => v.id !== id),
            ventanaMaximizada:
              s.ventanaMaximizada === id ? null : s.ventanaMaximizada,
          };
        }),
      setVentanaTimeframe: (id, tf) =>
        set((s) => ({
          ventanasTF: s.ventanasTF.map((v) =>
            v.id === id ? { ...v, timeframe: tf } : v,
          ),
        })),
      // Solo toca las ventanas que se quedan cortas: una ventana ya puesta en
      // 1d muestra el backtest entero y no hay razón para moverla. Así cargar
      // señales no arrasa con un mosaico que el usuario armó a mano.
      ajustarTemporalidadesAlPeriodo: (duracionMs) =>
        set((s) => {
          const suficiente = temporalidadParaPeriodo(duracionMs);
          const ventanasTF = s.ventanasTF.map((v) =>
            ms_queAbarca(v.timeframe) >= duracionMs
              ? v
              : { ...v, timeframe: suficiente },
          );
          // misma referencia si nada cambió: no dispara re-render ni refetch
          return ventanasTF.some((v, i) => v !== s.ventanasTF[i])
            ? { ventanasTF }
            : s;
        }),
      setNumeroVentanas: (n) =>
        set((s) => {
          const objetivo = Math.max(1, Math.min(MAX_VENTANAS, n));
          let ventanas = s.ventanasTF;
          if (objetivo < ventanas.length) {
            ventanas = ventanas.slice(0, objetivo);
          } else if (objetivo > ventanas.length) {
            ventanas = [...ventanas];
            while (ventanas.length < objetivo) {
              ventanas.push({
                id: crearId(),
                timeframe: tfSugerido(ventanas.map((v) => v.timeframe)),
              });
            }
          }
          return { ventanasTF: ventanas, ventanaMaximizada: null };
        }),
      intercambiarVentanas: (idA, idB) =>
        set((s) => {
          if (idA === idB) return s;
          const arr = [...s.ventanasTF];
          const ia = arr.findIndex((v) => v.id === idA);
          const ib = arr.findIndex((v) => v.id === idB);
          if (ia < 0 || ib < 0) return s;
          [arr[ia], arr[ib]] = [arr[ib], arr[ia]];
          return { ventanasTF: arr, ventanaMaximizada: null };
        }),
      toggleMaximizarVentana: (id) =>
        set((s) => ({
          ventanaMaximizada: s.ventanaMaximizada === id ? null : id,
        })),
      toggleIndicator: (key) =>
        set((s) => ({
          indicators: { ...s.indicators, [key]: !s.indicators[key] },
        })),
      setLiqHeatmapConfig: (patch) =>
        set((s) => ({
          liqHeatmapConfig: { ...s.liqHeatmapConfig, ...patch },
        })),
      setVpvrConfig: (patch) =>
        set((s) => ({
          vpvrConfig: { ...s.vpvrConfig, ...patch },
        })),
      setFootprintConfig: (patch) =>
        set((s) => ({
          footprintConfig: { ...s.footprintConfig, ...patch },
        })),
      toggleIndicadorActivo: (id) =>
        set((s) => ({
          indicadoresActivos: s.indicadoresActivos.includes(id)
            ? s.indicadoresActivos.filter((x) => x !== id)
            : [...s.indicadoresActivos, id],
        })),
      addToWatchlist: (s) =>
        set((state) => ({
          watchlist: state.watchlist.includes(s)
            ? state.watchlist
            : [...state.watchlist, s],
        })),
      removeFromWatchlist: (s) =>
        set((state) => ({
          watchlist: state.watchlist.filter((x) => x !== s),
        })),
      toggleWatchlist: () =>
        set((s) => ({ watchlistVisible: !s.watchlistVisible })),
      setSoloGraficos: (soloGraficos) => set({ soloGraficos }),
      setSymbolDialogOpen: (symbolDialogOpen) => set({ symbolDialogOpen }),
      // Cargar señales A MANO abre el Probador con el registro (es lo que el
      // usuario acaba de pedir). Las actualizaciones EN VIVO pasan
      // `abrirPanel: false`: un motor que publica cada pocos minutos volvería
      // a abrir el panel que el usuario cerró, una y otra vez.
      setModelSignals: (modelSignals, opciones) =>
        set((s) => ({
          modelSignals,
          showModelSignals: true,
          tradesPanelOpen:
            opciones?.abrirPanel === false
              ? s.tradesPanelOpen // respetar lo que eligió el usuario
              : modelSignals !== null,
        })),
      toggleShowModelSignals: () =>
        set((s) => ({ showModelSignals: !s.showModelSignals })),
      setTradesPanelOpen: (tradesPanelOpen) => set({ tradesPanelOpen }),
      setPosicionDemo: (posicionDemo) => set({ posicionDemo }),
      setHerramientaActiva: (herramientaActiva) => set({ herramientaActiva }),
      alternarModeloVisible: (id) =>
        set((s) => ({ visibilidadModelos: alternarVisible(s.visibilidadModelos, id) })),
      alternarCapaModelo: (id, capa) =>
        set((s) => ({ visibilidadModelos: alternarCapa(s.visibilidadModelos, id, capa) })),
      aislarModelo: (id, ids) =>
        set((s) => ({ visibilidadModelos: aislar(s.visibilidadModelos, ids, id) })),
      mostrarTodosLosModelos: (ids) =>
        set((s) => {
          const mapa = { ...s.visibilidadModelos };
          for (const id of ids) mapa[id] = { ...VISIBILIDAD_POR_DEFECTO };
          return { visibilidadModelos: mapa };
        }),
    }),
    {
      name: "tv-gratis-chart-state",
      version: 3,
      // v1: `ventanas: Timeframe[]`; v2: `ventanasTF` con x/y/w/h. Ambas se
      // normalizan al modelo actual { id, timeframe } (layout por plantilla).
      migrate: (persisted) => {
        const est = persisted as Record<string, unknown> | null;
        if (est) {
          if (Array.isArray(est.ventanas)) {
            est.ventanasTF = (est.ventanas as Timeframe[]).map((tf) => ({
              id: crearId(),
              timeframe: tf,
            }));
            delete est.ventanas;
          }
          if (Array.isArray(est.ventanasTF)) {
            est.ventanasTF = (
              est.ventanasTF as Array<{ id?: unknown; timeframe?: unknown }>
            )
              // Descartar lo que el visor de HOY no sabe dibujar. Vale más
              // perder una ventana que arrastrar un `NaN` por todo el gráfico.
              .filter((v) => v && esTemporalidadValida(v.timeframe))
              .map((v) => ({
                id: typeof v.id === "string" && v.id ? v.id : crearId(),
                timeframe: v.timeframe as Timeframe,
              }));
          }
          // Un mosaico vacío deja la pantalla en negro sin explicación. Si la
          // validación se llevó todo (o el estado venía corrupto), se vuelve al
          // arranque de fábrica: una sola ventana.
          if (!Array.isArray(est.ventanasTF) || est.ventanasTF.length === 0) {
            est.ventanasTF = [{ id: crearId(), timeframe: "15m" }];
          }
          if (typeof est.symbol !== "string" || !est.symbol.trim()) {
            est.symbol = "BTCUSDT";
          }
          if (Array.isArray(est.watchlist)) {
            est.watchlist = (est.watchlist as unknown[]).filter(
              (s): s is string => typeof s === "string" && s.trim().length > 0,
            );
          }
        }
        return est as unknown as ChartState;
      },
      partialize: (s) => ({
        symbol: s.symbol,
        ventanasTF: s.ventanasTF,
        indicators: s.indicators,
        liqHeatmapConfig: s.liqHeatmapConfig,
        vpvrConfig: s.vpvrConfig,
        footprintConfig: s.footprintConfig,
        indicadoresActivos: s.indicadoresActivos,
        watchlist: s.watchlist,
        watchlistVisible: s.watchlistVisible,
        visibilidadModelos: s.visibilidadModelos,
      }),
    },
  ),
);
