"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Timeframe } from "@/lib/binance/types";
import {
  MINUTOS_POR_TEMPORALIDAD,
  ms_queAbarca,
  temporalidadParaPeriodo,
} from "@/lib/binance/temporalidades";
import {
  buscarPlantilla,
  PLANTILLA_POR_DEFECTO,
  plantillaParaCantidad,
  ventanasDePlantilla,
} from "@/lib/chart/plantillas";
import { HERRAMIENTA_POR_DEFECTO } from "@/lib/herramientas/registro";
import { NIVELES_APALANCAMIENTO } from "@/lib/indicators/liquidations";
import {
  buscarIndicador,
  paramsPorDefecto,
  type ValoresParametros,
} from "@/lib/indicators/registro";
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
  /** Bloques de color sobre el gráfico (la vista clásica del heatmap). */
  mostrarBloques: boolean;
  /** Perfil de barras horizontales contra la escala de precios. */
  mostrarPerfil: boolean;
  /** Ancho del perfil como fracción del área de dibujo (0.05..0.35). */
  anchoPerfilPct: number;
}

const LIQ_HEATMAP_CONFIG_DEFAULT: LiqHeatmapConfig = {
  apalancamientos: [...NIVELES_APALANCAMIENTO],
  lado: "ambos",
  umbral: 0.05,
  opacidad: 1,
  mostrarBloques: true,
  mostrarPerfil: true,
  anchoPerfilPct: 0.12,
};

/**
 * Lee un interruptor de una configuración PERSISTIDA tratando la ausencia como
 * «encendido».
 *
 * `persist` mezcla superficialmente: un `liqHeatmapConfig` guardado REEMPLAZA
 * al objeto por defecto entero, así que los campos que se agreguen después
 * llegan como `undefined` a quien ya tenga la aplicación abierta. Sin esto, el
 * día que se agregó `mostrarBloques` los bloques habrían desaparecido de golpe
 * —`undefined` es falsy— sin que nadie tocara nada. `migrate` no cubre el caso:
 * no vuelve a correr si la versión del estado no cambió.
 */
export const encendido = (v: boolean | undefined) => v !== false;

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

/**
 * Id de la ventana de arranque. FIJO, no `crearId()`.
 *
 * El estado inicial se evalúa al cargar el módulo, y un UUID daría distinto en
 * el servidor y en el cliente: ese id llega al DOM (los `Panel` del mosaico lo
 * usan como `id`) y rompía la hidratación. Las ventanas que crea el usuario sí
 * llevan UUID — se generan después de hidratar, así que no participan del HTML
 * del servidor.
 */
const ID_VENTANA_INICIAL = "ventana-1";

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

/**
 * Ajusta la lista de ventanas a `objetivo`, conservando las primeras.
 *
 * Quitar del FINAL y no reordenar es lo que permite que las ventanas que
 * sobreviven mantengan su identidad de React (misma `key`, misma posición en el
 * árbol) y por lo tanto NO se recarguen al cambiar de disposición.
 */
function ajustarCantidad(ventanas: VentanaTF[], objetivo: number): VentanaTF[] {
  const n = Math.max(1, Math.min(MAX_VENTANAS, objetivo));
  if (n === ventanas.length) return ventanas;
  if (n < ventanas.length) return ventanas.slice(0, n);
  const salida = [...ventanas];
  while (salida.length < n) {
    salida.push({
      id: crearId(),
      timeframe: tfSugerido(salida.map((v) => v.timeframe)),
    });
  }
  return salida;
}

/**
 * Una instancia de indicador en el gráfico.
 *
 * Antes `indicadoresActivos` era una lista de ids (`["ema20", "rsi"]`), así que
 * cada indicador existía como mucho una vez y sus parámetros venían cocinados en
 * el registro. Con instancias se puede tener la EMA tres veces con períodos
 * distintos, cada una con su color — el modelo de TradingView.
 */
export interface InstanciaIndicador {
  /** Id único de ESTA instancia: clave del mapa de series del chart. */
  id: string;
  /** Id de la definición en `lib/indicators/registro`. */
  definicionId: string;
  params: ValoresParametros;
}

/**
 * Traduce los ids de la v4 a instancias.
 *
 * Los tres slots fijos de EMA llevaban su período y su color en el propio id, y
 * esa información solo existe acá: sin esta tabla, quien actualice pierde sus
 * indicadores en silencio.
 */
const INDICADORES_LEGADO: Record<string, { definicionId: string; params: ValoresParametros }> = {
  ema20: { definicionId: "ema", params: { periodo: 20, color: "#ffb74d" } },
  ema50: { definicionId: "ema", params: { periodo: 50, color: "#2962ff" } },
  ema200: { definicionId: "ema", params: { periodo: 200, color: "#ab47bc" } },
  rsi: { definicionId: "rsi", params: {} },
  macd: { definicionId: "macd", params: {} },
  volumen: { definicionId: "volumen", params: {} },
};

/** Instancia nueva de una definición, con sus valores por defecto. */
function instanciaDe(definicionId: string, params: ValoresParametros = {}): InstanciaIndicador | null {
  const def = buscarIndicador(definicionId);
  if (!def) return null;
  return {
    id: crearId(),
    definicionId,
    params: { ...paramsPorDefecto(def), ...params },
  };
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
  /**
   * Indicadores en el gráfico, como INSTANCIAS: la misma definición puede
   * aparecer varias veces con parámetros distintos. Aplican a todas las
   * ventanas del mosaico.
   */
  indicadoresActivos: InstanciaIndicador[];
  watchlist: string[];
  /** Watchlist (barra lateral derecha) visible */
  watchlistVisible: boolean;
  /**
   * Disposición del mosaico (id del catálogo de `lib/chart/plantillas`).
   *
   * Antes la geometría se derivaba de `ventanasTF.length`, así que no podían
   * discrepar. Ahora se declara, y con eso vienen dos disposiciones para la
   * misma cantidad (2 lado a lado vs. 2 apiladas) y rejillas parejas en 8 y 10.
   */
  plantillaId: string;
  /**
   * Al pasar el cursor por una ventana, las demás muestran la cruz en el mismo
   * instante. Es lo que permite comparar la misma vela en 1m y en 1h sin
   * hacerlo a ojo. Solo tiene efecto con más de una ventana.
   */
  sincronizarCrosshair: boolean;

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
  /** Aplica una disposición del catálogo, ajustando las ventanas a su cantidad. */
  aplicarPlantilla: (id: string) => void;
  toggleSincronizarCrosshair: () => void;
  intercambiarVentanas: (idA: string, idB: string) => void;
  toggleMaximizarVentana: (id: string) => void;
  toggleIndicator: (key: IndicatorKey) => void;
  setLiqHeatmapConfig: (patch: Partial<LiqHeatmapConfig>) => void;
  setVpvrConfig: (patch: Partial<VpvrConfig>) => void;
  setFootprintConfig: (patch: Partial<FootprintConfig>) => void;
  /** Agrega una instancia con los valores por defecto de su definición. */
  agregarIndicador: (definicionId: string) => void;
  quitarIndicador: (instanciaId: string) => void;
  /** Merge parcial de los parámetros de una instancia. */
  setParamsIndicador: (instanciaId: string, patch: ValoresParametros) => void;
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
      ventanasTF: [{ id: ID_VENTANA_INICIAL, timeframe: "15m" }],
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
      plantillaId: PLANTILLA_POR_DEFECTO,
      sincronizarCrosshair: true,
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
          const ventanasTF = [...s.ventanasTF, nueva];
          return {
            ventanasTF,
            // La disposición sigue a la cantidad: si no, el mosaico quedaría con
            // una geometría a la que le falta una celda.
            plantillaId: plantillaParaCantidad(ventanasTF.length).id,
            ventanaMaximizada: null,
          };
        }),
      quitarVentana: (id) =>
        set((s) => {
          if (s.ventanasTF.length <= 1) return s;
          const ventanasTF = s.ventanasTF.filter((v) => v.id !== id);
          return {
            ventanasTF,
            // Cerrar con la ✕ cambia la cantidad, así que la disposición se
            // re-deriva: un 2×2 al que le cierran una ventana pasa a la
            // disposición de 3, en vez de quedar con una celda vacía.
            plantillaId: plantillaParaCantidad(ventanasTF.length).id,
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
      // Se conserva por compatibilidad (y porque «quiero N ventanas» sigue
      // siendo una intención válida): elige la disposición canónica para esa
      // cantidad. Para pedir una disposición CONCRETA está `aplicarPlantilla`.
      setNumeroVentanas: (n) =>
        set((s) => {
          const plantilla = plantillaParaCantidad(n);
          return {
            ventanasTF: ajustarCantidad(s.ventanasTF, ventanasDePlantilla(plantilla)),
            plantillaId: plantilla.id,
            ventanaMaximizada: null,
          };
        }),
      aplicarPlantilla: (id) =>
        set((s) => {
          const plantilla = buscarPlantilla(id);
          if (!plantilla) return s; // id desconocido: no tocar nada
          return {
            ventanasTF: ajustarCantidad(s.ventanasTF, ventanasDePlantilla(plantilla)),
            plantillaId: plantilla.id,
            ventanaMaximizada: null,
          };
        }),
      toggleSincronizarCrosshair: () =>
        set((s) => ({ sincronizarCrosshair: !s.sincronizarCrosshair })),
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
      agregarIndicador: (definicionId) =>
        set((s) => {
          const def = buscarIndicador(definicionId);
          if (!def) return s; // definición desconocida: no tocar nada
          // `multiple: false` (MACD, Volumen): una sola instancia. Agregar dos
          // MACD con los mismos parámetros solo duplica paneles.
          if (
            !def.multiple &&
            s.indicadoresActivos.some((i) => i.definicionId === definicionId)
          ) {
            return s;
          }
          const nueva = instanciaDe(definicionId);
          if (!nueva) return s;
          return { indicadoresActivos: [...s.indicadoresActivos, nueva] };
        }),
      quitarIndicador: (instanciaId) =>
        set((s) => {
          const indicadoresActivos = s.indicadoresActivos.filter((i) => i.id !== instanciaId);
          // Misma referencia si no había nada que quitar: no re-renderiza.
          return indicadoresActivos.length === s.indicadoresActivos.length
            ? s
            : { indicadoresActivos };
        }),
      setParamsIndicador: (instanciaId, patch) =>
        set((s) => ({
          indicadoresActivos: s.indicadoresActivos.map((i) =>
            i.id === instanciaId ? { ...i, params: { ...i.params, ...patch } } : i,
          ),
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
      version: 5,
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
          // v3 → v4: la geometría se derivaba de la cantidad de ventanas y no
          // se guardaba. Se deduce la disposición canónica para las ventanas
          // que había, así el mosaico arranca como el usuario lo dejó.
          if (
            typeof est.plantillaId !== "string" ||
            !buscarPlantilla(est.plantillaId)
          ) {
            const n = Array.isArray(est.ventanasTF) ? est.ventanasTF.length : 1;
            est.plantillaId = plantillaParaCantidad(n).id;
          }
          if (typeof est.sincronizarCrosshair !== "boolean") {
            est.sincronizarCrosshair = true;
          }
          // v4 → v5: `indicadoresActivos` era una lista de ids con los
          // parámetros cocinados en el nombre ("ema20"). Se traduce a
          // instancias; lo que no esté en la tabla de legado se descarta, igual
          // que el resto del saneamiento.
          if (Array.isArray(est.indicadoresActivos)) {
            est.indicadoresActivos = (est.indicadoresActivos as unknown[])
              .map((entrada) => {
                if (typeof entrada === "string") {
                  const legado = INDICADORES_LEGADO[entrada];
                  return legado
                    ? instanciaDe(legado.definicionId, legado.params)
                    : null;
                }
                // Ya es una instancia (v5): se valida que su definición exista.
                const i = entrada as Partial<InstanciaIndicador>;
                if (typeof i?.definicionId !== "string") return null;
                return instanciaDe(
                  i.definicionId,
                  (i.params ?? {}) as ValoresParametros,
                );
              })
              .filter((i): i is InstanciaIndicador => i !== null);
          } else {
            est.indicadoresActivos = [];
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
        plantillaId: s.plantillaId,
        sincronizarCrosshair: s.sincronizarCrosshair,
      }),
    },
  ),
);
