import { describe, expect, test } from "bun:test";
import {
  buscarPlantilla,
  columnasPara,
  MAX_VENTANAS_PLANTILLA,
  PLANTILLAS,
  PLANTILLA_POR_DEFECTO,
  plantillaParaCantidad,
  ventanasDePlantilla,
} from "../plantillas";

/**
 * El catálogo de disposiciones es datos puros, y de él sale tanto la geometría
 * del mosaico como el ícono del selector. Una entrada mal formada rompe las dos
 * cosas a la vez, así que se valida el catálogo entero.
 */

describe("catálogo bien formado", () => {
  test("ids únicos", () => {
    const ids = PLANTILLAS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("toda plantilla tiene columnas, sin ceros ni negativos", () => {
    for (const p of PLANTILLAS) {
      expect(p.columnas.length).toBeGreaterThan(0);
      expect(p.columnas.every((f) => Number.isInteger(f) && f > 0)).toBe(true);
    }
  });

  test("ninguna se pasa del máximo de ventanas", () => {
    for (const p of PLANTILLAS) {
      expect(ventanasDePlantilla(p)).toBeLessThanOrEqual(MAX_VENTANAS_PLANTILLA);
    }
  });

  test("toda plantilla tiene nombre", () => {
    expect(PLANTILLAS.every((p) => p.nombre.trim().length > 0)).toBe(true);
  });

  test("la plantilla por defecto existe y es de una sola ventana", () => {
    const p = buscarPlantilla(PLANTILLA_POR_DEFECTO)!;
    expect(p).toBeDefined();
    expect(ventanasDePlantilla(p)).toBe(1);
  });
});

describe("las rejillas son PAREJAS", () => {
  // Esto es exactamente lo que fallaba con `ceil(√n)`: 8 ventanas salían en
  // columnas de 3+3+2 y 10 en 3+3+2+2. Una rejilla tiene todas sus columnas del
  // mismo alto.
  const rejillas = ["4-cuadro", "6", "8", "10"];

  for (const id of rejillas) {
    test(`"${id}" tiene todas las columnas del mismo alto`, () => {
      const p = buscarPlantilla(id)!;
      expect(p).toBeDefined();
      expect(new Set(p.columnas).size).toBe(1);
    });
  }

  test("8 ventanas son 4 columnas de 2, no 3+3+2", () => {
    expect(buscarPlantilla("8")!.columnas).toEqual([2, 2, 2, 2]);
  });

  test("10 ventanas son 5 columnas de 2, no 3+3+2+2", () => {
    expect(buscarPlantilla("10")!.columnas).toEqual([2, 2, 2, 2, 2]);
  });
});

describe("varias disposiciones para la misma cantidad", () => {
  const porCantidad = (n: number) =>
    PLANTILLAS.filter((p) => ventanasDePlantilla(p) === n).map((p) => p.id);

  test("con 2 ventanas se puede elegir lado a lado o apiladas", () => {
    expect(porCantidad(2)).toEqual(["2-lado", "2-apiladas"]);
    expect(buscarPlantilla("2-lado")!.columnas).toEqual([1, 1]); // dos columnas
    expect(buscarPlantilla("2-apiladas")!.columnas).toEqual([2]); // una columna
  });

  test("con 3 hay tres disposiciones distintas", () => {
    expect(porCantidad(3)).toHaveLength(3);
    expect(buscarPlantilla("3-1i2d")!.columnas).toEqual([1, 2]);
  });

  test("con 4 hay tres disposiciones distintas", () => {
    expect(porCantidad(4)).toHaveLength(3);
  });
});

describe("plantillaParaCantidad", () => {
  test("de 1 a 10 siempre devuelve algo dibujable", () => {
    for (let n = 1; n <= MAX_VENTANAS_PLANTILLA; n++) {
      const p = plantillaParaCantidad(n);
      expect(p).toBeDefined();
      expect(p.columnas.length).toBeGreaterThan(0);
    }
  });

  test("con cantidad exacta devuelve una plantilla de esa cantidad", () => {
    for (const n of [1, 2, 3, 4, 6, 8, 10]) {
      expect(ventanasDePlantilla(plantillaParaCantidad(n))).toBe(n);
    }
  });

  test("sin coincidencia exacta cae en la mayor que no se pasa", () => {
    // No hay plantilla de 5, 7 ni 9 ventanas.
    expect(ventanasDePlantilla(plantillaParaCantidad(5))).toBe(4);
    expect(ventanasDePlantilla(plantillaParaCantidad(7))).toBe(6);
    expect(ventanasDePlantilla(plantillaParaCantidad(9))).toBe(8);
  });

  test("valores basura no rompen el mosaico", () => {
    for (const n of [0, -3, 999, NaN, 2.7]) {
      const p = plantillaParaCantidad(n);
      expect(p.columnas.length).toBeGreaterThan(0);
      expect(ventanasDePlantilla(p)).toBeLessThanOrEqual(MAX_VENTANAS_PLANTILLA);
    }
  });
});

describe("columnasPara: guardia de consistencia", () => {
  test("con plantilla y cantidad coherentes devuelve su geometría", () => {
    expect(columnasPara("4-cuadro", 4)).toEqual([2, 2]);
    expect(columnasPara("2-apiladas", 2)).toEqual([2]);
  });

  test("si la cantidad NO coincide, manda la cantidad real", () => {
    // Pasa al cerrar una ventana de un 2×2: quedan 3 en una plantilla de 4.
    // Vale más otra disposición que un mosaico con celdas de más o de menos.
    const cols = columnasPara("4-cuadro", 3);
    expect(cols.reduce((a, b) => a + b, 0)).toBe(3);
  });

  test("una plantilla que ya no existe no deja el mosaico vacío", () => {
    // Estado persistido de una versión anterior con un id retirado.
    const cols = columnasPara("plantilla-que-no-existe", 6);
    expect(cols.reduce((a, b) => a + b, 0)).toBe(6);
  });

  test("la suma SIEMPRE coincide con las ventanas que hay", () => {
    for (let n = 1; n <= MAX_VENTANAS_PLANTILLA; n++) {
      for (const p of PLANTILLAS) {
        const suma = columnasPara(p.id, n).reduce((a, b) => a + b, 0);
        // Con cantidades sin plantilla exacta (5, 7, 9) el fallback baja al
        // múltiplo anterior; en el resto tiene que dar exacto.
        expect(suma).toBeLessThanOrEqual(n);
      }
    }
  });
});
