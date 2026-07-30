import { describe, expect, test } from "bun:test";
import type { Candle } from "@/lib/binance/types";
import { macd } from "@/lib/indicators";
import {
  buscarIndicador,
  INDICADORES,
  paramsPorDefecto,
} from "../registro";

/**
 * El registro es la única fuente de tres cosas a la vez: qué se calcula, qué
 * series se dibujan y qué campos muestra el panel de ajustes. Una entrada mal
 * formada las rompe las tres, así que se valida el catálogo entero.
 */

const velas: Candle[] = Array.from({ length: 400 }, (_, i) => {
  const c = 60_000 + Math.sin(i / 9) * 800 + i;
  return { time: i * 900, open: c - 5, high: c + 20, low: c - 20, close: c, volume: 10 + (i % 7) };
});

describe("catálogo bien formado", () => {
  test("ids únicos", () => {
    const ids = INDICADORES.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("todos tienen nombre y descripción", () => {
    for (const d of INDICADORES) {
      expect(d.nombre.trim().length).toBeGreaterThan(0);
      expect(d.descripcion.trim().length).toBeGreaterThan(0);
    }
  });

  test("cada parámetro tiene un default del tipo que declara", () => {
    for (const d of INDICADORES) {
      for (const p of d.parametros) {
        if (p.tipo === "numero") expect(typeof p.porDefecto).toBe("number");
        else expect(typeof p.porDefecto).toBe("string");
      }
    }
  });

  test("los numéricos tienen su default dentro del rango", () => {
    for (const d of INDICADORES) {
      for (const p of d.parametros) {
        if (p.tipo !== "numero") continue;
        const v = p.porDefecto as number;
        if (p.min !== undefined) expect(v).toBeGreaterThanOrEqual(p.min);
        if (p.max !== undefined) expect(v).toBeLessThanOrEqual(p.max);
        if (p.min !== undefined && p.max !== undefined) expect(p.min).toBeLessThan(p.max);
      }
    }
  });

  test("los colores por defecto son hex válidos", () => {
    for (const d of INDICADORES) {
      for (const p of d.parametros) {
        if (p.tipo === "color") expect(p.porDefecto).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    }
  });

  test("claves de parámetro únicas dentro de cada indicador", () => {
    for (const d of INDICADORES) {
      const claves = d.parametros.map((p) => p.clave);
      expect(new Set(claves).size).toBe(claves.length);
    }
  });
});

describe("el invariante que sostiene el reparto en el chart", () => {
  // El chart hace `calcular(...)[i]` para la serie `i`. Si los largos no
  // coinciden, una serie queda sin datos o se pierde un cálculo — en silencio.
  for (const d of INDICADORES) {
    test(`"${d.id}": calcular devuelve una entrada por serie`, () => {
      const p = paramsPorDefecto(d);
      expect(d.calcular(velas, p)).toHaveLength(d.series(p).length);
    });
  }

  test("ninguna serie trae valores no finitos", () => {
    for (const d of INDICADORES) {
      for (const serie of d.calcular(velas, paramsPorDefecto(d))) {
        expect(serie.every((x) => Number.isFinite(x.value))).toBe(true);
      }
    }
  });

  test("con pocas velas no se rompe: series vacías, no basura", () => {
    const pocas = velas.slice(0, 3);
    for (const d of INDICADORES) {
      const p = paramsPorDefecto(d);
      const series = d.calcular(pocas, p);
      expect(series).toHaveLength(d.series(p).length);
      for (const s of series) expect(s.every((x) => Number.isFinite(x.value))).toBe(true);
    }
  });
});

describe("los parámetros llegan de verdad al cálculo", () => {
  const emaDef = buscarIndicador("ema")!;

  test("cambiar el período cambia la serie", () => {
    const corta = emaDef.calcular(velas, { periodo: 20, color: "#fff" })[0];
    const larga = emaDef.calcular(velas, { periodo: 50, color: "#fff" })[0];
    expect(corta).toHaveLength(velas.length - 20 + 1);
    expect(larga).toHaveLength(velas.length - 50 + 1);
    expect(corta.at(-1)!.value).not.toBeCloseTo(larga.at(-1)!.value, 6);
  });

  test("el color viaja a los metadatos de la serie", () => {
    expect(emaDef.series({ color: "#123456" })[0].color).toBe("#123456");
  });

  test("un parámetro ausente o corrupto cae al default en vez de dar NaN", () => {
    // Los valores vienen de localStorage: pueden faltar o venir con otro tipo.
    for (const params of [{}, { periodo: "veinte" }, { periodo: -5 }, { periodo: 0 }]) {
      const serie = emaDef.calcular(velas, params as never)[0];
      expect(serie.length).toBeGreaterThan(0);
      expect(serie.every((x) => Number.isFinite(x.value))).toBe(true);
    }
    expect(emaDef.series({} as never)[0].color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});

describe("etiqueta derivada de los parámetros", () => {
  test("la EMA se rotula con su período, no con el nombre de su ranura", () => {
    const d = buscarIndicador("ema")!;
    expect(d.etiqueta({ periodo: 34 })).toBe("EMA 34");
    expect(d.etiqueta({ periodo: 200 })).toBe("EMA 200");
  });

  test("el MACD se rotula con sus tres períodos", () => {
    expect(buscarIndicador("macd")!.etiqueta({ rapida: 5, lenta: 35, senal: 5 })).toBe(
      "MACD 5 35 5",
    );
  });

  test("sin parámetros cae a los defaults, nunca a undefined", () => {
    for (const d of INDICADORES) {
      expect(d.etiqueta({})).not.toContain("undefined");
      expect(d.etiqueta({}).trim().length).toBeGreaterThan(0);
    }
  });
});

describe("paramsPorDefecto", () => {
  test("cubre todas las claves de cada indicador", () => {
    for (const d of INDICADORES) {
      const p = paramsPorDefecto(d);
      for (const par of d.parametros) expect(p[par.clave]).toBe(par.porDefecto);
      expect(Object.keys(p)).toHaveLength(d.parametros.length);
    }
  });
});

describe("solo la EMA y el RSI se agregan varias veces", () => {
  test("el MACD y el Volumen son únicos", () => {
    expect(buscarIndicador("macd")!.multiple).toBe(false);
    expect(buscarIndicador("volumen")!.multiple).toBe(false);
  });

  test("la EMA se puede repetir: es el punto del modelo de instancias", () => {
    expect(buscarIndicador("ema")!.multiple).toBe(true);
  });
});

describe("las EMAs no llevan etiqueta en el eje; los de panel propio sí", () => {
  // La regla que aplica ChartLigero: `lastValueVisible = def.panelPropio`.
  test("la EMA va superpuesta al precio", () => {
    expect(buscarIndicador("ema")!.panelPropio).toBe(false);
  });

  test("RSI, MACD y Volumen tienen panel propio", () => {
    for (const id of ["rsi", "macd", "volumen"]) {
      expect(buscarIndicador(id)!.panelPropio).toBe(true);
    }
  });
});

/**
 * Las zonas son líneas horizontales que el chart publica como priceLines y que
 * además estiran la escala del panel. Un valor corrupto acá no rompe el
 * cálculo del indicador, pero deja la escala del panel absurda —un RSI
 * comprimido contra el borde— sin ningún error visible.
 */
describe("zonas (líneas de referencia)", () => {
  const rsiDef = buscarIndicador("rsi")!;

  test("el RSI trae sus dos zonas en 70 y 30", () => {
    const zonas = rsiDef.referencias!(paramsPorDefecto(rsiDef));
    expect(zonas.map((z) => z.valor)).toEqual([70, 30]);
    expect(zonas.every((z) => z.etiqueta === String(z.valor))).toBe(true);
  });

  test("los niveles y el color salen de los parámetros", () => {
    const zonas = rsiDef.referencias!({ sobrecompra: 80, sobreventa: 20, colorZonas: "#123456" });
    expect(zonas.map((z) => z.valor)).toEqual([80, 20]);
    expect(zonas.every((z) => z.color === "#123456")).toBe(true);
  });

  test("las dos zonas NO pueden cruzarse por mucho que se editen", () => {
    // Lo garantizan los rangos declarados —sobrecompra en [51,100], sobreventa
    // en [0,49]—, no una validación aparte que alguien pueda olvidar.
    const arriba = rsiDef.parametros.find((p) => p.clave === "sobrecompra")!;
    const abajo = rsiDef.parametros.find((p) => p.clave === "sobreventa")!;
    expect(abajo.max!).toBeLessThan(arriba.min!);

    const [a, b] = rsiDef.referencias!({ sobrecompra: 0, sobreventa: 100 });
    expect(a.valor).toBeGreaterThan(b.valor);
  });

  test("un valor fuera de rango se recorta; uno corrupto cae al default", () => {
    // Recortar y no descartar: quien guardó 999 quería el máximo.
    expect(rsiDef.referencias!({ sobrecompra: 999 })[0].valor).toBe(100);
    expect(rsiDef.referencias!({ sobreventa: -40 })[1].valor).toBe(0);
    for (const basura of [{ sobrecompra: "ochenta" }, { sobrecompra: null }, {}]) {
      expect(rsiDef.referencias!(basura as never)[0].valor).toBe(70);
    }
  });

  test("un cero sigue siendo un nivel válido, no un valor «vacío»", () => {
    // `num()` descarta todo lo que no sea > 0, que es correcto para un período
    // pero convertiría una sobreventa en 0 en el default de 30.
    expect(rsiDef.referencias!({ sobreventa: 0 })[1].valor).toBe(0);
  });

  test("toda zona declarada es dibujable: valor finito y color hex", () => {
    for (const d of INDICADORES) {
      for (const z of d.referencias?.(paramsPorDefecto(d)) ?? []) {
        expect(Number.isFinite(z.valor)).toBe(true);
        expect(z.color).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    }
  });

  test("un indicador sin zonas no declara `referencias`", () => {
    // El chart usa `def.referencias?.(…) ?? []`: la ausencia es el caso normal.
    for (const id of ["ema", "macd", "volumen"]) {
      expect(buscarIndicador(id)!.referencias).toBeUndefined();
    }
  });

  test("los parámetros nuevos no rompen un RSI ya guardado en localStorage", () => {
    // Un estado v5 anterior a las zonas guardó solo `periodo` y `color`, y
    // `migrate` no vuelve a correr sobre él: la tolerancia del registro es lo
    // único que lo sostiene.
    const viejo = { periodo: 14, color: "#ab47bc" };
    expect(rsiDef.referencias!(viejo).map((z) => z.valor)).toEqual([70, 30]);
    expect(rsiDef.calcular(velas, viejo)[0].length).toBeGreaterThan(0);
    expect(rsiDef.etiqueta(viejo)).toBe("RSI 14");
  });
});

describe("el MACD se calcula UNA sola vez", () => {
  /** Cuenta los recorridos sobre el array de velas que hace `fn`. */
  function recorridos(fn: (v: Candle[]) => unknown): number {
    let n = 0;
    const espia = new Proxy(velas, {
      get(obj, prop) {
        if (prop === "length") n++;
        return Reflect.get(obj, prop);
      },
    }) as Candle[];
    fn(espia);
    return n;
  }

  test("calcular cuesta lo mismo que UNA llamada a macd(), no tres", () => {
    // Era el defecto medido: `calcular` estaba por SERIE, y las tres series del
    // MACD llamaban a macd() cada una — 0.74 de los 0.87 ms de todos los
    // indicadores juntos. Se compara contra una llamada directa: con el bug,
    // `calcular` triplicaba el trabajo.
    const d = buscarIndicador("macd")!;
    const unaVez = recorridos((v) => macd(v, 12, 26, 9));
    const viaCalcular = recorridos((v) => d.calcular(v, paramsPorDefecto(d)));

    expect(unaVez).toBeGreaterThan(0); // el instrumento mide algo
    // Holgura para el `.map()` de las tres series, muy por debajo del 3× del bug.
    expect(viaCalcular).toBeLessThan(unaVez * 2);
  });
});
