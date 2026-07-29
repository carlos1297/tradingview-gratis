/**
 * nucleo/index.ts — API PÚBLICA de la biblioteca de modelos de IA.
 *
 * Este es el único punto de importación que un modelo necesita:
 *
 *     import { adaptarContratoEstandar, type FuenteModelo } from "@/lib/modelos/nucleo";
 *
 * Todo lo que hace falta para integrar un motor está acá adentro: el contrato,
 * los adaptadores, los transportes, el saneamiento de señales, los cálculos
 * derivados y las métricas. Un modelo NO tiene que reimplementar ninguna de
 * esas piezas, y tampoco tiene que saber en qué archivo vive cada una.
 *
 * Por qué un punto de entrada y no imports sueltos a cada archivo:
 *
 *   · Un modelo importa de UN lugar; si mañana se reorganizan los archivos del
 *     núcleo, los catálogos de modelos no se enteran.
 *   · Deja explícito qué es API pública y qué es interno. Lo que no está
 *     re-exportado acá se puede cambiar sin romper a nadie.
 *   · Documenta la superficie de un vistazo: leyendo este archivo se sabe todo
 *     lo que la plataforma ofrece.
 *
 * La referencia completa —qué hace cada pieza y cuándo usarla— está en
 * `docs/BIBLIOTECA_MODELOS.md`.
 *
 * ⚠️ Regla de dependencias: este archivo re-exporta SOLO dominio e
 * infraestructura (funciones puras y hooks de datos). Ningún componente de
 * React que dibuje. La presentación vive en `components/modelos/` y consume
 * este contrato, nunca al revés.
 */

// ── 1. Contrato canónico ─────────────────────────────────────────────
// El formato único que entiende toda la interfaz. Un motor publica su JSON y
// un adaptador lo traduce a `EstadoModeloIA`; de ahí en más nada sabe qué
// modelo es. Detalle campo por campo en `docs/CONTRATO_MODELOS.md`.
export {
  CONTRATO_ACTUAL,
  MS_SONDEO_POR_DEFECTO,
  MS_FRESCO_POR_DEFECTO,
  type EstadoMotor,
  type EstadoModeloIA,
  type LadoPosicion,
  type SenalOperativa,
  type SaludMotor,
  type VistaOperacion,
  type Adaptador,
  type FuenteModelo,
} from "./tipos";

// ── 2. Señales de trading ────────────────────────────────────────────
// Vocabulario cerrado de eventos y su saneamiento. `sanearSenales` es la
// FRONTERA DE CONFIANZA: todo lo que venga de un motor pasa por acá, así una
// señal corrupta se descarta sola en vez de propagarse como NaN.
export {
  EVENTOS_SENAL,
  type EventoSenal,
  type ModelSignal,
  type ModelSignalsFile,
  esEventoSenal,
  sanearSenales,
  esApertura,
  esCierre,
} from "./senales";

// ── 3. Adaptadores ───────────────────────────────────────────────────
// La ÚNICA capa que conoce formatos concretos. Si tu motor publica el contrato
// v1, no escribas uno: usá el que corresponda a tu transporte.
export {
  adaptarContratoEstandar, // archivo: cada lectura trae el estado completo
  adaptarFeedWebSocket, //    WebSocket: eventos incrementales, los acumula
  ladoPosicion,
  aperturaDesdeSenales,
} from "./adaptadores";

// ── 4. Transportes ───────────────────────────────────────────────────
// Cómo viajan los bytes. No interpretan nada. Para sumar uno nuevo (SSE,
// long-poll…) alcanza con un archivo en `transportes/` y una línea en su
// índice: ninguna fuente ni componente cambia.
export {
  TRANSPORTES,
  type Transporte,
  esTransporte,
  conectorDe,
} from "./transportes";
export type { OpcionesTransporte, Conector } from "./transportes/tipos";

// ── 5. Lecturas derivadas ────────────────────────────────────────────
// La regla de oro del proyecto: EL MOTOR PUBLICA HECHOS, LA INTERFAZ CALCULA
// LECTURAS. No mandes PnL, win rate ni duración: se derivan acá, con una sola
// fórmula, y por eso la barra, el gráfico y el Probador no pueden
// contradecirse.
export {
  MS_FRESCO,
  type PosicionEnGrafico,
  posicionParaGrafico, // qué dibujar sobre el gráfico
  pnlFlotante, //         PnL en % y en dinero (fórmula única)
  vistaOperacion, //      las 17 métricas de la operación en curso
  senalOperativa, //      COMPRAR / VENDER / MANTENER / CERRAR
  pnlRealizado,
  saludMotor, //          EN VIVO / ATRASADO / DETENIDO / ERROR
  motorSinVida, //        ¿dejó de publicar? → se retira de la interfaz
} from "./derivar";

// ── 6. Métricas de rendimiento ───────────────────────────────────────
// Reconstrucción de operaciones cerradas y estadísticas del Probador. Viven en
// `lib/trades.ts` porque las comparte el `senales.json` de backtest, que no es
// un modelo en vivo; se re-exportan acá para que un modelo tenga todo en un
// solo import.
//
// Regla de negocio: las métricas se calculan SOLO sobre cierres. La operación
// abierta se muestra aparte — su resultado todavía no existe, y contarla
// falsearía el win rate y el factor de beneficio.
export {
  type OperacionIA,
  type MetricasGrupo,
  type EstadisticasIA,
  buildOperaciones, // empareja cada abrir_* con su cerrar_*
  computeResumenTV, // métricas por lado: todas / largas / cortas
  computeMetricasGrupo,
  computeEstadisticas,
  formatDuracion, // "2d 3h" / "5h 12m" / "40m"
  etiquetaMotivo, // "stop_loss" → "Stop Loss"
} from "@/lib/trades";

// ── 7. Cableado en vivo (hooks) ──────────────────────────────────────
// Los monta `components/modelos/ProveedorModelosIA`, UNA vez por página. Un
// modelo normalmente no los llama: le alcanza con estar en el catálogo.
export {
  useFuente, //                   suscribe UNA fuente (transporte + adaptador)
  useDescartarModelosDetenidos, // retira los motores que dejaron de publicar
  useSincronizarSenales, //        lleva las señales del modelo activo al Probador
} from "./useModelosIA";

// ── 8. Precio de mercado ─────────────────────────────────────────────
// Fuente ÚNICA del "precio actual" con el que se mide el PnL flotante, sobre
// el WebSocket singleton de Binance. Elegí según lo que vayas a hacer con él:
// si el número se MUESTRA, la versión de estado; si se DIBUJA, la de ref (no
// re-renderiza).
export { usePrecioMercado, usePrecioMercadoRef } from "./usePrecioMercado";
