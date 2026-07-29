import { adaptarContratoEstandar } from "../../nucleo/adaptadores";
import type { FuenteModelo } from "../../nucleo/tipos";

/**
 * sac.fuente.ts — Alta del modelo SAC en el visor.
 *
 * Es TODO lo que el visor sabe de SAC. El motor vive en otro repo
 * (`modelo_SAC/operar_vivo.py` de RL_SAC) y publica el contrato v1 estándar,
 * así que acá no hay ni una línea de lógica: solo identidad, dónde leer y con
 * qué cadencia. Ver `sac.README.md` para el detalle del motor.
 */

/** Archivo que escribe el motor dentro de `public/` del visor. */
export const ARCHIVO_ESTADO_SAC = "/estado_sac.json";

/**
 * Nombre anterior del mismo archivo. Se conserva como respaldo porque un motor
 * ya corriendo —o una copia vieja en `public/`— sigue usándolo: el visor prueba
 * el nombre nuevo y cae a este si no está, de modo que actualizar el visor y
 * actualizar el motor no tienen que pasar al mismo tiempo.
 */
export const ARCHIVO_ESTADO_SAC_LEGADO = "/estado_vivo.json";

export const FUENTE_SAC: FuenteModelo = {
  id: "sac",
  etiqueta: "SAC",
  descripcion: "Soft Actor-Critic · críticos cuantílicos TQC + encoder Conv1D/GRU",
  color: "#2962ff",
  transporte: "archivo",
  url: ARCHIVO_ESTADO_SAC,
  urlsRespaldo: [ARCHIVO_ESTADO_SAC_LEGADO],
  adaptar: adaptarContratoEstandar,
  // Decide por cierre de vela de 5 m: los defaults de cadencia
  // (msSondeo 5 s, msFresco 6 min) le sirven tal cual.
};
