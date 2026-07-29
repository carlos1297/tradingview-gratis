import { conectarArchivo } from "./archivo";
import { conectarWebSocket } from "./websocket";
import type { Conector } from "./tipos";

/**
 * transportes/index.ts — Registro de transportes disponibles.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  PARA AGREGAR UN TRANSPORTE NUEVO (SSE, HTTP long-poll, postMessage…):
 *
 *  1. Escribí un archivo en esta carpeta que exporte un `Conector`.
 *  2. Sumalo al objeto de abajo.
 *
 *  El tipo `Transporte` sale de las claves de este objeto, así que a partir
 *  de ahí el registro de modelos ya lo acepta y TypeScript verifica el resto.
 *  El núcleo (`useModelosIA`) NO tiene ningún `if` por transporte: busca el
 *  conector acá y lo usa.
 * ─────────────────────────────────────────────────────────────────────────
 */
export const TRANSPORTES = {
  archivo: conectarArchivo,
  websocket: conectarWebSocket,
} satisfies Record<string, Conector>;

/** Identificadores válidos de transporte, derivados del registro. */
export type Transporte = keyof typeof TRANSPORTES;

const IDS = Object.keys(TRANSPORTES) as Transporte[];

export function esTransporte(v: unknown): v is Transporte {
  return typeof v === "string" && (IDS as string[]).includes(v);
}

/** Conector de un transporte, o `undefined` si el id no está registrado. */
export function conectorDe(transporte: Transporte): Conector | undefined {
  return TRANSPORTES[transporte];
}

export type { Conector, OpcionesTransporte } from "./tipos";
