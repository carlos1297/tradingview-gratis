import { adaptarContratoEstandar, adaptarFeedWebSocket } from "./adaptadores";
import type { FuenteModelo } from "./tipos";

/**
 * registro.ts — Catálogo de modelos de IA que la interfaz puede monitorear.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  PARA AGREGAR UN MODELO NUEVO (PPO, DQN, un ensemble…):
 *
 *  1. Que su motor publique el estado con el contrato v1 (ver tipos.ts), sea
 *     como archivo JSON en public/ o por WebSocket.
 *  2. Agregá UNA entrada acá abajo, reutilizando el adaptador que le
 *     corresponda. Si publica un formato propio, escribí un adaptador nuevo
 *     en adaptadores.ts — es la única pieza que conoce ese formato.
 *
 *  Eso es todo. No hay que tocar la barra, el gráfico, el store ni el
 *  Probador de estrategias: todos consumen el contrato canónico y se
 *  reconfiguran solos.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Una fuente sin `url` (variable de entorno ausente) o cuyo archivo no existe
 * se ignora en silencio: registrar un modelo antes de tenerlo entrenado no
 * rompe nada — simplemente no aparece en el selector.
 */
export const REGISTRO_MODELOS: FuenteModelo[] = [
  {
    id: "sac",
    etiqueta: "SAC",
    descripcion: "Soft Actor-Critic · críticos cuantílicos TQC + encoder Conv1D/GRU",
    color: "#2962ff",
    transporte: "archivo",
    url: "/estado_vivo.json",
    adaptar: adaptarContratoEstandar,
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

  // ── Plantilla para el próximo modelo ────────────────────────────────────
  // {
  //   id: "dqn",
  //   etiqueta: "DQN",
  //   descripcion: "Deep Q-Network · acciones discretas",
  //   color: "#26a69a",
  //   transporte: "archivo",
  //   url: "/estado_vivo_dqn.json",
  //   adaptar: adaptarContratoEstandar,
  // },
];

export function fuentePorId(id: string): FuenteModelo | undefined {
  return REGISTRO_MODELOS.find((f) => f.id === id);
}
