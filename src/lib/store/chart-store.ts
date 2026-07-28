"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Timeframe } from "@/lib/binance/types";
import { NIVELES_APALANCAMIENTO } from "@/lib/indicators/liquidations";

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

/** One buy/sell event exported by the RL model evaluation (senales.json). */
export interface ModelSignal {
  tiempoMs: number;
  evento: "abrir_long" | "abrir_short" | "cerrar_long" | "cerrar_short";
  precio: number;
  motivo?: string;
  pnlUsd?: number;
}

export interface ModelSignalsFile {
  simbolo: string;
  split: string;
  checkpoint?: string;
  senales: ModelSignal[];
}

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
  /** Strategy Tester bottom panel (registro de operaciones de la IA) */
  tradesPanelOpen: boolean;
  /** Operación abierta de ejemplo dibujada sobre el gráfico (demo, efímera) */
  posicionDemo: { lado: "long" | "short" } | null;

  // Actions
  setSymbol: (s: string) => void;
  agregarVentana: (tf?: Timeframe) => void;
  quitarVentana: (id: string) => void;
  setVentanaTimeframe: (id: string, tf: Timeframe) => void;
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
  setModelSignals: (f: ModelSignalsFile | null) => void;
  toggleShowModelSignals: () => void;
  setTradesPanelOpen: (v: boolean) => void;
  setPosicionDemo: (p: { lado: "long" | "short" } | null) => void;
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
      // cargar señales abre el Probador de estrategias con el registro
      setModelSignals: (modelSignals) =>
        set({
          modelSignals,
          showModelSignals: true,
          tradesPanelOpen: modelSignals !== null,
        }),
      toggleShowModelSignals: () =>
        set((s) => ({ showModelSignals: !s.showModelSignals })),
      setTradesPanelOpen: (tradesPanelOpen) => set({ tradesPanelOpen }),
      setPosicionDemo: (posicionDemo) => set({ posicionDemo }),
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
              est.ventanasTF as Array<{ id?: string; timeframe: Timeframe }>
            ).map((v) => ({ id: v.id ?? crearId(), timeframe: v.timeframe }));
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
      }),
    },
  ),
);
