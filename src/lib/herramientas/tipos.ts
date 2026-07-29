import type { ComponentType } from "react";
import type { Candle } from "@/lib/binance/types";

/**
 * tipos.ts — CONTRATO de una herramienta de dibujo del gráfico.
 *
 * Mismo criterio que `lib/indicators/registro.ts`: agregar una herramienta
 * nueva (línea de tendencia, Fibonacci, rectángulo, canal, texto…) es sumar
 * una entrada al registro. Ni la barra lateral ni `ChartLigero` cambian:
 *
 *   · la barra se arma sola recorriendo el catálogo;
 *   · el gráfico ya sabe juntar N puntos con clic y resolverlos a píxeles;
 *   · la herramienta solo aporta CUÁNTOS puntos necesita y CÓMO se dibuja.
 *
 * Los puntos se anclan al DOMINIO (tiempo + precio), no a píxeles. Por eso el
 * trazo aguanta pan, zoom y cambios de tamaño sin recalcular nada: el gráfico
 * los vuelve a resolver a coordenadas en cada repintado.
 */

/**
 * Un punto fijado sobre el gráfico.
 *
 * `tiempo` va en SEGUNDOS unix (la unidad de lightweight-charts y de
 * `Candle.time`, no los milisegundos del contrato de los modelos), y viene
 * enganchado a la apertura de una vela real: es lo que permite contar barras
 * entre dos puntos sin estimar nada.
 */
export interface PuntoGrafico {
  tiempo: number;
  precio: number;
}

/** Un trazo, en curso o terminado. */
export interface Dibujo {
  herramientaId: string;
  /**
   * Puntos fijados. Mientras `completo` es `false`, el ÚLTIMO sigue al cursor
   * — así la herramienta se previsualiza sin ninguna rama aparte.
   */
  puntos: PuntoGrafico[];
  completo: boolean;
}

/** Un punto del dominio ya resuelto a píxeles por quien tiene el gráfico. */
export interface PuntoResuelto extends PuntoGrafico {
  x: number;
  y: number;
}

/**
 * Todo lo que una herramienta necesita para pintarse.
 *
 * Nótese lo que NO trae: ni el chart, ni la serie, ni React. Igual que
 * `pintarPosicion`, una herramienta es dibujo puro sobre un contexto 2D con
 * las coordenadas ya resueltas, así que se puede renderizar y revisar fuera
 * del navegador.
 */
export interface LienzoHerramienta {
  puntos: PuntoResuelto[];
  /** `false` = trazo en curso: conviene dibujarlo punteado. */
  completo: boolean;
  /** Velas visibles en el gráfico, para contar barras o sumar volumen. */
  velas: readonly Candle[];
  /** Área de trazado, sin la escala de precios. */
  ancho: number;
  alto: number;
}

/** Una entrada del catálogo de herramientas. */
export interface DefinicionHerramienta {
  id: string;
  nombre: string;
  /** Texto del tooltip: qué hace y cómo se usa. */
  descripcion: string;
  /** Icono de la barra lateral (lucide-react). */
  icono: ComponentType<{ className?: string }>;
  /** Tecla que la activa, en minúscula. Se muestra en el tooltip. */
  atajo: string;
  /**
   * Cuántos puntos hay que fijar con clic para completar el trazo.
   *
   * `0` = la herramienta no dibuja: es el cursor de navegación. Una línea de
   * tendencia, un rectángulo o un Fibonacci usan `2`; un canal, `3`.
   */
  puntos: number;
  /** Cursor CSS mientras está activa. Sin esto, el del gráfico. */
  cursor?: string;
  /**
   * Pinta el trazo. Obligatorio salvo que `puntos` sea 0.
   *
   * El contexto llega recortado al área de trazado y con la densidad de
   * píxeles ya aplicada: dibujar en coordenadas CSS, sin `devicePixelRatio`.
   */
  pintar?: (ctx: CanvasRenderingContext2D, lienzo: LienzoHerramienta) => void;
}
