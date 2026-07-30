import type { IChartApi, ISeriesApi, SeriesType, Time } from "lightweight-charts";

/**
 * sincronizacion.ts — El crosshair de una ventana se refleja en las demás.
 *
 * Es lo que más hace sentir «TradingView» a un layout multi-gráfico: al pasar el
 * cursor por la ventana de 1m, la de 1h marca la MISMA hora, y comparar la
 * misma vela en dos temporalidades deja de ser a ojo.
 *
 * Registro a nivel de MÓDULO, sin React y sin store, por dos razones:
 *
 *   · La difusión ocurre en cada movimiento del cursor. Meterla en estado
 *     re-renderizaría cada ventana decenas de veces por segundo, y el gráfico es
 *     el componente más caro de la aplicación (ver la skill
 *     `rendimiento-tiempo-real`).
 *   · Las ventanas no se conocen entre sí, y no tienen por qué: cada una se da
 *     de alta y de baja al montarse, y la difusión recorre lo que haya.
 */

interface GraficoRegistrado {
  chart: IChartApi;
  serie: ISeriesApi<SeriesType, Time>;
}

const graficos = new Map<string, GraficoRegistrado>();

/**
 * Cortacircuitos del bucle de realimentación.
 *
 * `setCrosshairPosition` sobre el gráfico B dispara el `subscribeCrosshairMove`
 * de B, que sin este guardia volvería a difundir y los dos gráficos se
 * rebotarían el evento indefinidamente. Mientras está en `true`, los handlers
 * receptores saben que lo que ven es un reflejo y no re-emiten.
 */
let difundiendo = false;

/** ¿El movimiento de crosshair que estoy viendo es un reflejo de otra ventana? */
export function esReflejo(): boolean {
  return difundiendo;
}

/**
 * Da de alta un gráfico. Devuelve la función de baja, para usarla tal cual como
 * cleanup del efecto que crea el chart.
 */
export function registrarGrafico(id: string, g: GraficoRegistrado): () => void {
  graficos.set(id, g);
  return () => {
    graficos.delete(id);
  };
}

/**
 * Refleja la posición del crosshair en todas las ventanas MENOS la de origen.
 *
 * Se sincroniza por TIMESTAMP, no por índice lógico: el índice 300 es un momento
 * distinto en 1m que en 1h, así que sincronizar por índice cruzaría los tiempos.
 */
export function difundirCrosshair(idOrigen: string, tiempo: Time, precio: number) {
  if (difundiendo) return;
  difundiendo = true;
  try {
    for (const [id, g] of graficos) {
      if (id === idOrigen) continue;
      try {
        g.chart.setCrosshairPosition(precio, tiempo, g.serie);
      } catch {
        // El gráfico se está desmontando ("Object is disposed"). Que una ventana
        // en pleno cierre no corte la difusión a las demás.
      }
    }
  } finally {
    difundiendo = false;
  }
}

/** Apaga el crosshair reflejado en las demás ventanas (el cursor salió). */
export function limpiarCrosshair(idOrigen: string) {
  if (difundiendo) return;
  difundiendo = true;
  try {
    for (const [id, g] of graficos) {
      if (id === idOrigen) continue;
      try {
        g.chart.clearCrosshairPosition();
      } catch {
        // ídem: desmontaje en curso
      }
    }
  } finally {
    difundiendo = false;
  }
}

/** Cuántas ventanas hay registradas. Solo para tests y diagnóstico. */
export function graficosRegistrados(): number {
  return graficos.size;
}
