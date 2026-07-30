import { FUENTE_SAC } from "./sac/sac.fuente";
import { FUENTE_PPO } from "./ppo/ppo.fuente";
import type { FuenteModelo } from "@/lib/modelos/nucleo";

/**
 * catalogo/index.ts — Los modelos que vienen de fábrica con el visor.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  PARA AGREGAR UN MODELO:
 *
 *  1. Creá `catalogo/<id>/` con `<id>.fuente.ts` exportando un `FuenteModelo`.
 *     Si el motor publica el contrato v1, reutilizá `adaptarContratoEstandar`
 *     (archivo) o `adaptarFeedWebSocket` (WebSocket) del núcleo — no hace falta
 *     escribir un adaptador.
 *  2. Sumá su fuente al array de abajo.
 *
 *  Nada más. El núcleo, los componentes, el store y el Probador no se tocan:
 *  todos consumen el contrato canónico.
 *
 *  Y si no querés tocar código, ni siquiera hace falta esto: declaralo en
 *  `NEXT_PUBLIC_MODELOS_EXTRA` (ver `registro.ts`).
 * ─────────────────────────────────────────────────────────────────────────
 *
 * El orden de este array es el orden de las pestañas del selector.
 */
export const MODELOS_INTEGRADOS: FuenteModelo[] = [FUENTE_SAC, FUENTE_PPO];

export { FUENTE_SAC, FUENTE_PPO };
