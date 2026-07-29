/**
 * visibilidad.ts — Qué dibuja CADA modelo sobre el gráfico.
 *
 * Con un solo motor corriendo esto no hacía falta: se dibujaba todo. Con
 * varios a la vez el gráfico se vuelve ilegible —dos juegos de flechas, dos
 * cajas de posición, cuatro barreras— y encima deja de poder responderse la
 * pregunta más útil: *¿qué está haciendo ESTE modelo?*
 *
 * Módulo PURO: define la forma, los valores por defecto y las operaciones
 * sobre el mapa de visibilidad. No conoce React ni el store; lo consumen por
 * igual el panel de administración, el gráfico y el Probador.
 */

/** Qué capas de un modelo se dibujan. */
export interface VisibilidadModelo {
  /**
   * Interruptor maestro. En `false` el modelo no dibuja NADA, sin importar el
   * resto de las banderas — así se apaga un motor de un clic y se vuelve a
   * encender tal como estaba.
   */
  visible: boolean;
  /** Flechas de entrada (L / S) sobre las velas. */
  aperturas: boolean;
  /** Flechas de salida (TP / SL / LIQ / C). */
  cierres: boolean;
  /** Caja de la operación abierta: entrada, zona y PnL flotante. */
  posicion: boolean;
  /** Líneas de stop loss y take profit de la operación abierta. */
  barreras: boolean;
}

/** Un modelo recién aparecido se dibuja entero: es lo que se espera al arrancarlo. */
export const VISIBILIDAD_POR_DEFECTO: VisibilidadModelo = {
  visible: true,
  aperturas: true,
  cierres: true,
  posicion: true,
  barreras: true,
};

/** Las capas, en el orden en que se listan en el panel. */
export const CAPAS: Array<{
  clave: keyof Omit<VisibilidadModelo, "visible">;
  etiqueta: string;
  descripcion: string;
}> = [
  { clave: "aperturas", etiqueta: "Entradas", descripcion: "Flechas de apertura (L / S)" },
  { clave: "cierres", etiqueta: "Salidas", descripcion: "Flechas de cierre (TP / SL / LIQ)" },
  { clave: "posicion", etiqueta: "Posición", descripcion: "Caja de la operación abierta" },
  { clave: "barreras", etiqueta: "SL / TP", descripcion: "Stop loss y take profit" },
];

/**
 * Visibilidad de un modelo, con los defaults aplicados.
 *
 * Un modelo que nunca se tocó no tiene entrada en el mapa: en vez de obligar a
 * cada consumidor a acordarse del `?? POR_DEFECTO`, se resuelve acá.
 */
export function visibilidadDe(
  mapa: Readonly<Record<string, VisibilidadModelo>>,
  id: string,
): VisibilidadModelo {
  return mapa[id] ?? VISIBILIDAD_POR_DEFECTO;
}

/** ¿Este modelo dibuja esta capa? Combina el maestro con la bandera concreta. */
export function dibuja(
  mapa: Readonly<Record<string, VisibilidadModelo>>,
  id: string,
  capa: keyof Omit<VisibilidadModelo, "visible">,
): boolean {
  const v = visibilidadDe(mapa, id);
  return v.visible && v[capa];
}

/**
 * Deja visible SOLO este modelo y apaga los demás («solo», como el aislar de
 * una capa). Es la forma rápida de pasar de comparar a inspeccionar uno.
 *
 * Volver a pedir «solo» sobre el que ya está aislado devuelve a todos visibles:
 * el botón es de ida y vuelta, sin necesitar un «mostrar todos» aparte.
 */
export function aislar(
  mapa: Readonly<Record<string, VisibilidadModelo>>,
  ids: readonly string[],
  id: string,
): Record<string, VisibilidadModelo> {
  const yaAislado =
    visibilidadDe(mapa, id).visible &&
    ids.every((otro) => otro === id || !visibilidadDe(mapa, otro).visible);

  const salida: Record<string, VisibilidadModelo> = { ...mapa };
  for (const otro of ids) {
    salida[otro] = {
      ...visibilidadDe(mapa, otro),
      visible: yaAislado ? true : otro === id,
    };
  }
  return salida;
}

/** Enciende o apaga el maestro de un modelo, conservando sus capas. */
export function alternarVisible(
  mapa: Readonly<Record<string, VisibilidadModelo>>,
  id: string,
): Record<string, VisibilidadModelo> {
  const v = visibilidadDe(mapa, id);
  return { ...mapa, [id]: { ...v, visible: !v.visible } };
}

/** Enciende o apaga UNA capa de un modelo. */
export function alternarCapa(
  mapa: Readonly<Record<string, VisibilidadModelo>>,
  id: string,
  capa: keyof Omit<VisibilidadModelo, "visible">,
): Record<string, VisibilidadModelo> {
  const v = visibilidadDe(mapa, id);
  return { ...mapa, [id]: { ...v, [capa]: !v[capa] } };
}
