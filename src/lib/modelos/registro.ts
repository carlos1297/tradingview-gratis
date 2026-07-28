import { adaptarContratoEstandar, adaptarFeedWebSocket } from "./adaptadores";
import { esTransporte, type Transporte } from "./transportes";
import type { Adaptador, FuenteModelo } from "./tipos";

/**
 * registro.ts — Catálogo de modelos de IA que la interfaz puede monitorear.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  PARA AGREGAR UN MODELO NUEVO hay DOS caminos, y ninguno toca componentes:
 *
 *  A) SIN CÓDIGO — si el motor publica el contrato v1 (ver tipos.ts), basta
 *     con declararlo en la variable de entorno `NEXT_PUBLIC_MODELOS_EXTRA`
 *     (JSON, ver `modelosDeEntorno` más abajo). Es el camino recomendado:
 *     ni recompilar la app ni tocar el repo del visor.
 *
 *  B) EN CÓDIGO — si querés que el modelo venga de fábrica, o si publica un
 *     formato propio y necesita un adaptador a medida, agregá una entrada a
 *     `MODELOS_INTEGRADOS`. El adaptador es la ÚNICA pieza que conoce ese
 *     formato.
 *
 *  En los dos casos: no hay que tocar la barra, el gráfico, el store ni el
 *  Probador de estrategias. Todos consumen el contrato canónico y se
 *  reconfiguran solos.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Una fuente sin `url` (variable de entorno ausente) o cuyo archivo no existe
 * se ignora en silencio: registrar un modelo antes de tenerlo entrenado no
 * rompe nada — simplemente no aparece en el selector.
 */

/** Adaptador por defecto de cada transporte, para las fuentes declaradas por entorno. */
const ADAPTADOR_POR_TRANSPORTE: Record<Transporte, Adaptador> = {
  archivo: adaptarContratoEstandar,
  websocket: adaptarFeedWebSocket,
};

/** Color de acento cuando la fuente no declara uno. */
const COLOR_POR_DEFECTO = "#26a69a";

/** Modelos que vienen de fábrica con el visor. */
const MODELOS_INTEGRADOS: FuenteModelo[] = [
  {
    id: "sac",
    etiqueta: "SAC",
    descripcion: "Soft Actor-Critic · críticos cuantílicos TQC + encoder Conv1D/GRU",
    color: "#2962ff",
    transporte: "archivo",
    url: "/estado_vivo.json",
    adaptar: adaptarContratoEstandar,
    // decide por cierre de vela 5m: los defaults le sirven tal cual
  },
  {
    id: "ppo",
    etiqueta: "PPO",
    descripcion: "Proximal Policy Optimization · servicio en vivo por WebSocket",
    color: "#ab47bc",
    transporte: "websocket",
    // opt-in: sin la variable de entorno, la fuente queda desactivada
    url: process.env.NEXT_PUBLIC_FEED_VIVO_URL,
    adaptar: adaptarFeedWebSocket,
  },
];

/**
 * Modelos declarados por entorno, en `NEXT_PUBLIC_MODELOS_EXTRA`.
 *
 * Formato: un array JSON. Solo `id` y `url` son obligatorios.
 *
 * ```jsonc
 * // .env.local  (todo en UNA línea)
 * NEXT_PUBLIC_MODELOS_EXTRA=[
 *   {"id":"dqn","etiqueta":"DQN","url":"/estado_vivo_dqn.json"},
 *   {"id":"a2c","etiqueta":"A2C","transporte":"websocket",
 *    "url":"ws://127.0.0.1:8010/ws","color":"#ffa726","msFresco":60000}
 * ]
 * ```
 *
 * Un JSON mal formado o una entrada inválida se descartan con un aviso en
 * consola: una variable de entorno con un typo no puede dejar el visor en
 * blanco. Los ids repetidos tampoco: gana el que ya estaba registrado, para
 * que nadie pueda pisar el SAC integrado desde el entorno.
 */
export function modelosDeEntorno(
  crudo: string | undefined = process.env.NEXT_PUBLIC_MODELOS_EXTRA,
  yaRegistrados: ReadonlySet<string> = new Set(MODELOS_INTEGRADOS.map((m) => m.id)),
): FuenteModelo[] {
  if (!crudo || crudo.trim() === "") return [];

  let lista: unknown;
  try {
    lista = JSON.parse(crudo);
  } catch (e) {
    console.warn(
      `[modelos] NEXT_PUBLIC_MODELOS_EXTRA no es JSON válido, se ignora: ${(e as Error).message}`,
    );
    return [];
  }
  if (!Array.isArray(lista)) {
    console.warn("[modelos] NEXT_PUBLIC_MODELOS_EXTRA debe ser un array JSON, se ignora");
    return [];
  }

  const vistos = new Set(yaRegistrados);
  const fuentes: FuenteModelo[] = [];

  for (const item of lista) {
    if (!item || typeof item !== "object") continue;
    const d = item as Record<string, unknown>;

    const id = typeof d.id === "string" ? d.id.trim() : "";
    const url = typeof d.url === "string" ? d.url.trim() : "";
    if (!id || !url) {
      console.warn("[modelos] entrada sin `id` o sin `url` en NEXT_PUBLIC_MODELOS_EXTRA");
      continue;
    }
    if (vistos.has(id)) {
      console.warn(`[modelos] id duplicado "${id}" en NEXT_PUBLIC_MODELOS_EXTRA, se ignora`);
      continue;
    }

    const transporte: Transporte = esTransporte(d.transporte) ? d.transporte : "archivo";
    const etiqueta = typeof d.etiqueta === "string" && d.etiqueta ? d.etiqueta : id.toUpperCase();

    vistos.add(id);
    fuentes.push({
      id,
      etiqueta,
      descripcion:
        typeof d.descripcion === "string" && d.descripcion
          ? d.descripcion
          : `${etiqueta} · declarado en NEXT_PUBLIC_MODELOS_EXTRA`,
      color: typeof d.color === "string" && d.color ? d.color : COLOR_POR_DEFECTO,
      transporte,
      url,
      adaptar: ADAPTADOR_POR_TRANSPORTE[transporte],
      ...(typeof d.msSondeo === "number" && d.msSondeo > 0 ? { msSondeo: d.msSondeo } : {}),
      ...(typeof d.msFresco === "number" && d.msFresco > 0 ? { msFresco: d.msFresco } : {}),
    });
  }

  return fuentes;
}

/**
 * Catálogo final. Constante de módulo: se evalúa una vez por carga de página,
 * así la cantidad de suscripciones es estable durante toda la sesión.
 */
export const REGISTRO_MODELOS: FuenteModelo[] = [
  ...MODELOS_INTEGRADOS,
  ...modelosDeEntorno(),
];

export function fuentePorId(id: string): FuenteModelo | undefined {
  return REGISTRO_MODELOS.find((f) => f.id === id);
}
