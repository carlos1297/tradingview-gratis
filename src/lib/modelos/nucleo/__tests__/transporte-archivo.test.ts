import { afterEach, describe, expect, test } from "bun:test";
import { conectarArchivo } from "../transportes/archivo";

/**
 * Respaldo de orígenes del transporte de archivo.
 *
 * Renombrar el JSON que publica un motor obliga a desplegar dos proyectos que
 * viven en repos distintos (el visor y el motor). Sin respaldo hay una ventana
 * en la que el modelo desaparece de la interfaz: el visor ya pide el nombre
 * nuevo y el motor todavía escribe el viejo. Probando los dos, el orden del
 * despliegue deja de importar.
 */

const ESTADO = { contrato: 1, modeloId: "x", estado: "operando", dineroReal: false };

const fetchOriginal = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = fetchOriginal;
});

/** Sirve solo las URLs de `disponibles`; el resto responde 404. */
function fingirServidor(disponibles: Record<string, unknown>) {
  const pedidas: string[] = [];
  globalThis.fetch = (async (url: string) => {
    pedidas.push(String(url));
    const cuerpo = disponibles[String(url)];
    return cuerpo === undefined
      ? new Response("no existe", { status: 404 })
      : new Response(JSON.stringify(cuerpo), { status: 200 });
  }) as unknown as typeof fetch;
  return pedidas;
}

/** Conecta, espera al primer sondeo y corta. Devuelve lo que se recibió. */
async function unSondeo(opciones: Parameters<typeof conectarArchivo>[0]) {
  const recibidos: unknown[] = [];
  const avisos: string[] = [];
  const cerrar = conectarArchivo({
    ...opciones,
    onDatos: (d) => recibidos.push(d),
    onAviso: (m) => avisos.push(m),
  });
  await new Promise((r) => setTimeout(r, 10));
  cerrar();
  return { recibidos, avisos };
}

const BASE = {
  msSondeo: 100_000, // enorme: en el test solo interesa el sondeo inicial
  onDatos: () => {},
  onAusente: () => {},
};

describe("transporte de archivo · respaldo de orígenes", () => {
  test("usa la URL principal cuando existe, sin tocar el respaldo", async () => {
    const pedidas = fingirServidor({ "/estado_sac.json": ESTADO });
    const { recibidos } = await unSondeo({
      ...BASE,
      url: "/estado_sac.json",
      urlsRespaldo: ["/estado_vivo.json"],
    });
    expect(recibidos).toEqual([ESTADO]);
    expect(pedidas).toEqual(["/estado_sac.json"]);
  });

  test("cae al respaldo si la principal da 404", async () => {
    // el caso real: visor actualizado, motor todavía escribiendo el nombre viejo
    const pedidas = fingirServidor({ "/estado_vivo.json": ESTADO });
    const { recibidos, avisos } = await unSondeo({
      ...BASE,
      url: "/estado_sac.json",
      urlsRespaldo: ["/estado_vivo.json"],
    });
    expect(recibidos).toEqual([ESTADO]);
    expect(pedidas).toEqual(["/estado_sac.json", "/estado_vivo.json"]);
    expect(avisos.join(" ")).toContain("respaldo");
  });

  test("sin ningún origen no publica nada ni lanza", async () => {
    fingirServidor({});
    const { recibidos } = await unSondeo({
      ...BASE,
      url: "/estado_sac.json",
      urlsRespaldo: ["/estado_vivo.json"],
    });
    expect(recibidos).toEqual([]);
  });

  test("una fuente sin respaldo declarado sigue funcionando igual", async () => {
    const pedidas = fingirServidor({ "/estado_sac.json": ESTADO });
    const { recibidos } = await unSondeo({ ...BASE, url: "/estado_sac.json" });
    expect(recibidos).toEqual([ESTADO]);
    expect(pedidas).toEqual(["/estado_sac.json"]);
  });

  test("una vez elegido un origen, no vuelve a probar los demás", async () => {
    // sin esto, cada sondeo pediría el archivo inexistente: 404 en bucle contra
    // el dev server y ruido en la pestaña de red del navegador
    const pedidas = fingirServidor({ "/estado_vivo.json": ESTADO });
    const cerrar = conectarArchivo({
      ...BASE,
      msSondeo: 5,
      url: "/estado_sac.json",
      urlsRespaldo: ["/estado_vivo.json"],
    });
    await new Promise((r) => setTimeout(r, 40));
    cerrar();
    // la primera vuelta prueba las dos; a partir de ahí solo la ganadora
    expect(pedidas.filter((u) => u === "/estado_sac.json")).toHaveLength(1);
    expect(pedidas.filter((u) => u === "/estado_vivo.json").length).toBeGreaterThan(1);
  });

  test("si el origen elegido desaparece, avisa que la fuente se fue", async () => {
    let existe = true;
    const ausencias: number[] = [];
    globalThis.fetch = (async () =>
      existe
        ? new Response(JSON.stringify(ESTADO), { status: 200 })
        : new Response("no existe", { status: 404 })) as unknown as typeof fetch;

    const cerrar = conectarArchivo({
      ...BASE,
      msSondeo: 5,
      url: "/estado_sac.json",
      onDatos: () => {
        existe = false; // el motor se apaga justo después de la primera lectura
      },
      onAusente: () => ausencias.push(1),
    });
    await new Promise((r) => setTimeout(r, 40));
    cerrar();
    expect(ausencias.length).toBeGreaterThan(0);
  });
});
