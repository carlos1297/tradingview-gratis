import { describe, expect, test } from "bun:test";
import { adaptarContratoEstandar, adaptarFeedWebSocket } from "../adaptadores";
import { modelosDeEntorno, REGISTRO_MODELOS, fuentePorId } from "../registro";
import { conectorDe, esTransporte, TRANSPORTES } from "../transportes";

/**
 * El registro es LA promesa de extensibilidad: agregar un modelo no puede
 * requerir tocar componentes, y una declaración con un typo no puede dejar el
 * visor en blanco.
 */

describe("registro integrado", () => {
  test("SAC viene de fábrica por archivo", () => {
    const sac = fuentePorId("sac")!;
    expect(sac.transporte).toBe("archivo");
    expect(sac.url).toBe("/estado_vivo.json");
  });

  test("todas las fuentes declaran un transporte registrado", () => {
    for (const f of REGISTRO_MODELOS) {
      expect(esTransporte(f.transporte)).toBe(true);
      expect(conectorDe(f.transporte)).toBeDefined();
    }
  });

  test("los ids son únicos: dos fuentes con el mismo id se pisarían en el store", () => {
    const ids = REGISTRO_MODELOS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("un id inexistente no rompe: devuelve undefined", () => {
    expect(fuentePorId("no-existe")).toBeUndefined();
  });
});

describe("modelosDeEntorno — alta de modelos sin tocar código", () => {
  test("sin variable no agrega nada", () => {
    expect(modelosDeEntorno(undefined)).toEqual([]);
    expect(modelosDeEntorno("")).toEqual([]);
    expect(modelosDeEntorno("   ")).toEqual([]);
  });

  test("una entrada mínima queda usable con defaults sensatos", () => {
    const [f] = modelosDeEntorno('[{"id":"dqn","url":"/estado_vivo_dqn.json"}]');
    expect(f.id).toBe("dqn");
    expect(f.etiqueta).toBe("DQN"); // del id, en mayúsculas
    expect(f.transporte).toBe("archivo"); // el default
    expect(f.adaptar).toBeDefined(); // adaptador estándar
    expect(f.color).toBeTruthy();
  });

  test("respeta todo lo que se declara explícitamente", () => {
    const [f] = modelosDeEntorno(
      JSON.stringify([
        {
          id: "a2c",
          etiqueta: "A2C",
          descripcion: "Advantage Actor-Critic",
          color: "#ffa726",
          transporte: "websocket",
          url: "ws://127.0.0.1:8010/ws",
          msSondeo: 1000,
          msFresco: 60000,
        },
      ]),
    );
    expect(f.etiqueta).toBe("A2C");
    expect(f.transporte).toBe("websocket");
    expect(f.msSondeo).toBe(1000);
    expect(f.msFresco).toBe(60000);
    // el transporte elige el adaptador: WS acumula, archivo no
    expect(f.adaptar).toBe(adaptarFeedWebSocket);
  });

  test("el transporte de archivo usa el adaptador del contrato estándar", () => {
    const [f] = modelosDeEntorno('[{"id":"dqn","url":"/dqn.json"}]');
    expect(f.adaptar).toBe(adaptarContratoEstandar);
  });

  test("un JSON roto se ignora sin lanzar: un typo no puede tumbar el visor", () => {
    expect(modelosDeEntorno("{no es json")).toEqual([]);
    expect(modelosDeEntorno('{"id":"x"}')).toEqual([]); // objeto, no array
  });

  test("descarta entradas sin id o sin url, y conserva las buenas", () => {
    const f = modelosDeEntorno(
      JSON.stringify([
        { etiqueta: "sin id", url: "/a.json" },
        { id: "sin-url" },
        null,
        "texto",
        { id: "ok", url: "/ok.json" },
      ]),
    );
    expect(f.map((x) => x.id)).toEqual(["ok"]);
  });

  test("no se puede pisar un modelo integrado desde el entorno", () => {
    const f = modelosDeEntorno('[{"id":"sac","url":"/pirata.json"}]');
    expect(f).toEqual([]);
  });

  test("tampoco se pueden declarar dos veces el mismo id", () => {
    const f = modelosDeEntorno('[{"id":"x","url":"/1.json"},{"id":"x","url":"/2.json"}]');
    expect(f).toHaveLength(1);
    expect(f[0].url).toBe("/1.json");
  });

  test("un transporte desconocido cae al de archivo en vez de romper", () => {
    const [f] = modelosDeEntorno('[{"id":"z","url":"/z.json","transporte":"paloma-mensajera"}]');
    expect(f.transporte).toBe("archivo");
  });

  test("valores de cadencia inválidos se descartan y quedan los defaults", () => {
    const [f] = modelosDeEntorno('[{"id":"z","url":"/z.json","msSondeo":-5,"msFresco":"rapido"}]');
    expect(f.msSondeo).toBeUndefined();
    expect(f.msFresco).toBeUndefined();
  });
});

describe("registro de transportes", () => {
  test("están los dos transportes del proyecto", () => {
    expect(Object.keys(TRANSPORTES).sort()).toEqual(["archivo", "websocket"]);
  });

  test("esTransporte solo acepta los registrados", () => {
    expect(esTransporte("archivo")).toBe(true);
    expect(esTransporte("websocket")).toBe(true);
    expect(esTransporte("sse")).toBe(false);
    expect(esTransporte(42)).toBe(false);
    expect(esTransporte(undefined)).toBe(false);
  });
});
