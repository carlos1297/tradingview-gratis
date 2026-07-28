"use client";

import { create } from "zustand";
import type { EstadoModeloIA } from "@/lib/modelos/tipos";

/**
 * modelos-store.ts — Estado en vivo de TODOS los modelos de IA registrados.
 *
 * Deliberadamente separado de chart-store: aquel guarda la configuración del
 * gráfico (persistida en localStorage), este es puro estado efímero de
 * runtime. Mezclarlos haría que se persistan posiciones viejas y el visor
 * arrancara mostrando una operación que ya no existe.
 *
 * Los componentes se suscriben por modelo, así un tick de PPO no re-renderiza
 * el panel de SAC.
 */
interface ModelosState {
  /** Último estado conocido de cada modelo, por id. */
  estados: Record<string, EstadoModeloIA>;
  /** Id del modelo que la interfaz muestra en detalle. null = auto. */
  modeloActivo: string | null;
  /** Ids con fuente viva (respondió al menos una vez), en orden de registro. */
  disponibles: string[];

  publicarEstado: (id: string, estado: EstadoModeloIA) => void;
  quitarModelo: (id: string) => void;
  setModeloActivo: (id: string | null) => void;
}

export const useModelosStore = create<ModelosState>()((set) => ({
  estados: {},
  modeloActivo: null,
  disponibles: [],

  publicarEstado: (id, estado) =>
    set((s) => ({
      estados: { ...s.estados, [id]: estado },
      disponibles: s.disponibles.includes(id) ? s.disponibles : [...s.disponibles, id],
      // el primero en responder queda activo; después manda el usuario
      modeloActivo: s.modeloActivo ?? id,
    })),

  quitarModelo: (id) =>
    set((s) => {
      const estados = { ...s.estados };
      delete estados[id];
      const disponibles = s.disponibles.filter((x) => x !== id);
      return {
        estados,
        disponibles,
        modeloActivo: s.modeloActivo === id ? (disponibles[0] ?? null) : s.modeloActivo,
      };
    }),

  setModeloActivo: (modeloActivo) => set({ modeloActivo }),
}));

/** Estado del modelo activo, o null si todavía no respondió ninguno. */
export function useModeloActivo(): EstadoModeloIA | null {
  return useModelosStore((s) => (s.modeloActivo ? (s.estados[s.modeloActivo] ?? null) : null));
}
