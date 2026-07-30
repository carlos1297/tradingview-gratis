import { adaptarFeedWebSocket, type FuenteModelo } from "@/lib/modelos/nucleo";

/**
 * ppo.fuente.ts — Alta del modelo PPO en el visor.
 *
 * A diferencia de SAC, PPO no escribe un archivo: expone un servicio que empuja
 * su estado por WebSocket (`modelo_PPO/main.py` del repo RL_PPO). El protocolo
 * —mensajes `tipo: "estado"` con eventos incrementales— lo traduce el adaptador
 * de WebSocket del núcleo; acá solo se declara dónde conectarse.
 */

/**
 * Opt-in por entorno: sin `NEXT_PUBLIC_FEED_VIVO_URL` la fuente queda
 * desactivada y PPO no aparece en el selector. Es el comportamiento correcto
 * cuando no hay servicio corriendo — registrar un modelo antes de tenerlo no
 * puede ensuciar la interfaz.
 */
export const URL_FEED_PPO = process.env.NEXT_PUBLIC_FEED_VIVO_URL;

export const FUENTE_PPO: FuenteModelo = {
  id: "ppo",
  etiqueta: "PPO",
  descripcion: "Proximal Policy Optimization · servicio en vivo por WebSocket",
  color: "#ab47bc",
  transporte: "websocket",
  url: URL_FEED_PPO,
  adaptar: adaptarFeedWebSocket,
};
