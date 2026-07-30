import { beforeEach, describe, expect, test } from "bun:test";
import type { IChartApi, ISeriesApi, SeriesType, Time } from "lightweight-charts";
import {
  difundirCrosshair,
  esReflejo,
  graficosRegistrados,
  limpiarCrosshair,
  registrarGrafico,
} from "../sincronizacion";

/**
 * El riesgo de esta pieza no es dibujar mal: es el BUCLE. `setCrosshairPosition`
 * sobre un gráfico dispara su propio `subscribeCrosshairMove`, que sin guardia
 * volvería a difundir y dos ventanas se rebotarían el evento indefinidamente.
 *
 * Estos tests usan gráficos simulados que anotan lo que se les pidió, y uno que
 * REACCIONA como el real para provocar el bucle a propósito.
 */

interface Llamada {
  precio: number;
  tiempo: Time;
}

function graficoFalso() {
  const puestos: Llamada[] = [];
  let limpiados = 0;
  const chart = {
    setCrosshairPosition: (precio: number, tiempo: Time) => {
      puestos.push({ precio, tiempo });
    },
    clearCrosshairPosition: () => {
      limpiados++;
    },
  } as unknown as IChartApi;
  const serie = {} as ISeriesApi<SeriesType, Time>;
  return { chart, serie, puestos, verLimpiados: () => limpiados };
}

const T = 1_700_000_000 as unknown as Time;

/** El registro es de módulo: hay que vaciarlo entre tests. */
const bajas: Array<() => void> = [];
function alta(id: string) {
  const g = graficoFalso();
  bajas.push(registrarGrafico(id, { chart: g.chart, serie: g.serie }));
  return g;
}

beforeEach(() => {
  while (bajas.length) bajas.pop()!();
});

describe("registro de gráficos", () => {
  test("alta y baja", () => {
    expect(graficosRegistrados()).toBe(0);
    const baja = registrarGrafico("a", graficoFalso());
    expect(graficosRegistrados()).toBe(1);
    baja();
    expect(graficosRegistrados()).toBe(0);
  });

  test("el mismo id no duplica: una ventana re-montada reemplaza su entrada", () => {
    bajas.push(registrarGrafico("a", graficoFalso()));
    bajas.push(registrarGrafico("a", graficoFalso()));
    expect(graficosRegistrados()).toBe(1);
  });
});

describe("difusión", () => {
  test("llega a las OTRAS ventanas, nunca a la de origen", () => {
    const a = alta("a");
    const b = alta("b");
    const c = alta("c");

    difundirCrosshair("a", T, 64_000);

    expect(a.puestos).toHaveLength(0); // el origen no se refleja a sí mismo
    expect(b.puestos).toEqual([{ precio: 64_000, tiempo: T }]);
    expect(c.puestos).toEqual([{ precio: 64_000, tiempo: T }]);
  });

  test("con una sola ventana no hace nada", () => {
    const a = alta("a");
    difundirCrosshair("a", T, 100);
    expect(a.puestos).toHaveLength(0);
  });

  test("limpiar apaga el crosshair de las demás", () => {
    const a = alta("a");
    const b = alta("b");
    limpiarCrosshair("a");
    expect(a.verLimpiados()).toBe(0);
    expect(b.verLimpiados()).toBe(1);
  });

  test("una ventana desmontada ya no recibe", () => {
    alta("a");
    const b = alta("b");
    bajas.pop()!(); // baja de "b"
    difundirCrosshair("a", T, 100);
    expect(b.puestos).toHaveLength(0);
  });
});

describe("el bucle de realimentación", () => {
  test("un gráfico que re-emite al recibir NO cuelga la aplicación", () => {
    // Esto es el bug que el guardia previene: B, al recibir el crosshair,
    // re-difunde (como haría su `subscribeCrosshairMove` real). Sin
    // `difundiendo`, A y B se rebotarían el evento hasta agotar la pila.
    const a = alta("a");

    let reemisiones = 0;
    const bChart = {
      setCrosshairPosition: () => {
        reemisiones++;
        // el handler real consulta `esReflejo()` antes de re-emitir
        if (!esReflejo()) difundirCrosshair("b", T, 1);
      },
      clearCrosshairPosition: () => {},
    } as unknown as IChartApi;
    bajas.push(
      registrarGrafico("b", { chart: bChart, serie: {} as ISeriesApi<SeriesType, Time> }),
    );

    difundirCrosshair("a", T, 64_000);

    expect(reemisiones).toBe(1); // una sola vuelta
    expect(a.puestos).toHaveLength(0); // nada volvió al origen
  });

  test("esReflejo es true SOLO durante la difusión", () => {
    expect(esReflejo()).toBe(false);
    const visto: boolean[] = [];
    const chart = {
      setCrosshairPosition: () => {
        visto.push(esReflejo());
      },
      clearCrosshairPosition: () => {},
    } as unknown as IChartApi;
    bajas.push(
      registrarGrafico("x", { chart, serie: {} as ISeriesApi<SeriesType, Time> }),
    );

    difundirCrosshair("origen", T, 1);
    expect(visto).toEqual([true]); // el receptor sabe que es un reflejo
    expect(esReflejo()).toBe(false); // y la bandera se libera al terminar
  });

  test("un gráfico que lanza al recibir no corta la difusión a los demás", () => {
    // "Object is disposed": una ventana en pleno desmontaje.
    const roto = {
      setCrosshairPosition: () => {
        throw new Error("Object is disposed");
      },
      clearCrosshairPosition: () => {
        throw new Error("Object is disposed");
      },
    } as unknown as IChartApi;
    bajas.push(
      registrarGrafico("roto", { chart: roto, serie: {} as ISeriesApi<SeriesType, Time> }),
    );
    const sano = alta("sano");

    expect(() => difundirCrosshair("origen", T, 64_000)).not.toThrow();
    expect(sano.puestos).toHaveLength(1);

    expect(() => limpiarCrosshair("origen")).not.toThrow();
    expect(sano.verLimpiados()).toBe(1);
  });

  test("la bandera se libera aunque un receptor lance", () => {
    const roto = {
      setCrosshairPosition: () => {
        throw new Error("boom");
      },
      clearCrosshairPosition: () => {},
    } as unknown as IChartApi;
    bajas.push(
      registrarGrafico("roto", { chart: roto, serie: {} as ISeriesApi<SeriesType, Time> }),
    );
    difundirCrosshair("origen", T, 1);
    // Si el `finally` no estuviera, la sincronización quedaría muerta para
    // siempre: `difundiendo` se quedaría en true y todo se ignoraría.
    expect(esReflejo()).toBe(false);
  });
});
