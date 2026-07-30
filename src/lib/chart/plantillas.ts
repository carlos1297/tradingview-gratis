/**
 * plantillas.ts — Catálogo de disposiciones del mosaico de gráficos.
 *
 * Antes la geometría se DERIVABA de la cantidad de ventanas (`ceil(√n)`
 * columnas equilibradas). Eso tenía dos consecuencias malas:
 *
 *   · Disposiciones irregulares: 8 ventanas salían en columnas de 3+3+2 y 10 en
 *     3+3+2+2. No era una rejilla, era un reparto que sobraba por un lado.
 *   · Una sola disposición por cantidad: dos ventanas SIEMPRE lado a lado, sin
 *     forma de pedirlas apiladas.
 *
 * TradingView ofrece varias disposiciones para la MISMA cantidad, y por eso su
 * selector son íconos que dibujan la geometría en vez de números. Acá la
 * geometría se declara, y el renderer —que ya sabía dibujar columnas de filas—
 * no necesitó cambiar.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  PARA AGREGAR UNA DISPOSICIÓN alcanza con sumar una entrada a `PLANTILLAS`.
 *
 *  No hay que tocar el mosaico (lee `columnas`) ni el selector (se arma solo
 *  recorriendo el catálogo), y el ÍCONO tampoco se dibuja: `VistaPlantilla`
 *  lo deriva del mismo `columnas`.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** Máximo de ventanas que admite el mosaico. */
export const MAX_VENTANAS_PLANTILLA = 10;

export interface PlantillaLayout {
  id: string;
  /** Nombre visible en el selector. */
  nombre: string;
  /**
   * Cuántas FILAS tiene cada columna. La suma es la cantidad de ventanas.
   *
   *   [1]       → una sola
   *   [1, 1]    → dos lado a lado
   *   [2]       → dos apiladas
   *   [1, 2]    → una izquierda + dos derecha
   *   [2, 2]    → 2×2
   *   [1,1,1,1] → cuatro columnas
   */
  columnas: number[];
}

export const PLANTILLAS: PlantillaLayout[] = [
  { id: "1", nombre: "Una", columnas: [1] },

  { id: "2-lado", nombre: "Dos lado a lado", columnas: [1, 1] },
  { id: "2-apiladas", nombre: "Dos apiladas", columnas: [2] },

  { id: "3-columnas", nombre: "Tres columnas", columnas: [1, 1, 1] },
  { id: "3-filas", nombre: "Tres filas", columnas: [3] },
  { id: "3-1i2d", nombre: "Una izquierda, dos derecha", columnas: [1, 2] },

  { id: "4-cuadro", nombre: "Cuatro en cuadro", columnas: [2, 2] },
  { id: "4-columnas", nombre: "Cuatro columnas", columnas: [1, 1, 1, 1] },
  { id: "4-filas", nombre: "Cuatro filas", columnas: [4] },

  { id: "6", nombre: "Seis (3×2)", columnas: [2, 2, 2] },
  { id: "8", nombre: "Ocho (4×2)", columnas: [2, 2, 2, 2] },
  { id: "10", nombre: "Diez (5×2)", columnas: [2, 2, 2, 2, 2] },
];

/** La disposición de arranque. */
export const PLANTILLA_POR_DEFECTO = "1";

/** Cuántas ventanas ocupa una disposición. */
export function ventanasDePlantilla(p: PlantillaLayout): number {
  return p.columnas.reduce((a, b) => a + b, 0);
}

export function buscarPlantilla(id: string): PlantillaLayout | undefined {
  return PLANTILLAS.find((p) => p.id === id);
}

/**
 * La disposición canónica para N ventanas: la PRIMERA del catálogo con esa
 * cantidad.
 *
 * Se usa en dos lugares donde solo se conoce el número:
 *
 *   · la migración del estado persistido, que trae `ventanasTF` de una versión
 *     anterior sin `plantillaId`;
 *   · el re-derivado al agregar o cerrar una ventana con la ✕ — la cantidad
 *     cambia y la disposición tiene que seguirla, o el mosaico quedaría con una
 *     geometría que no coincide con las ventanas que hay.
 *
 * Para una cantidad sin plantilla exacta (5, 7, 9…) devuelve la más cercana por
 * abajo, y nunca `undefined`: el mosaico siempre tiene algo que dibujar.
 */
export function plantillaParaCantidad(n: number): PlantillaLayout {
  const objetivo = Math.max(1, Math.min(MAX_VENTANAS_PLANTILLA, Math.floor(n) || 1));
  const exacta = PLANTILLAS.find((p) => ventanasDePlantilla(p) === objetivo);
  if (exacta) return exacta;
  // Sin coincidencia exacta: la mayor que no se pase.
  const candidatas = PLANTILLAS.filter((p) => ventanasDePlantilla(p) <= objetivo);
  return candidatas.length > 0
    ? candidatas[candidatas.length - 1]
    : PLANTILLAS[0];
}

/**
 * La geometría a dibujar para una plantilla y una cantidad real de ventanas.
 *
 * Guardia de consistencia: si la suma de `columnas` no coincide con las ventanas
 * que hay —estado persistido de una versión anterior, o corrupto— manda la
 * cantidad real. Vale más una disposición distinta de la guardada que un mosaico
 * al que le falten o le sobren celdas.
 */
export function columnasPara(plantillaId: string, cantidadVentanas: number): number[] {
  const p = buscarPlantilla(plantillaId);
  if (p && ventanasDePlantilla(p) === cantidadVentanas) return p.columnas;
  return plantillaParaCantidad(cantidadVentanas).columnas;
}
