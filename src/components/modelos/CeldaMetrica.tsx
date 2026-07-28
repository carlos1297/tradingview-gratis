"use client";

import { cn } from "@/lib/utils";

/**
 * CeldaMetrica — Unidad visual de la barra de modelos: micro-etiqueta arriba,
 * valor tabular abajo. Todas las métricas del panel usan esta celda, así la
 * barra queda alineada sola sin importar cuántas métricas publique cada modelo.
 */

export type TonoCelda = "neutro" | "positivo" | "negativo" | "aviso" | "acento";

const TONO: Record<TonoCelda, string> = {
  neutro: "text-tv-text",
  positivo: "text-tv-green",
  negativo: "text-tv-red",
  aviso: "text-tv-yellow",
  acento: "text-tv-blue",
};

export function tonoPorSigno(v: number | null | undefined): TonoCelda {
  if (v === null || v === undefined || v === 0) return "neutro";
  return v > 0 ? "positivo" : "negativo";
}

interface Props {
  etiqueta: string;
  /** Valor principal. `null` se muestra como "—" (dato que el motor no publica). */
  valor: string | null;
  /** Segunda línea opcional: el % junto al USD, la distancia a la barrera… */
  secundario?: string | null;
  tono?: TonoCelda;
  /** Explicación al pasar el mouse: de dónde sale el número. */
  titulo?: string;
  /** Barra 0..1 debajo del valor (se usa para la confianza). */
  progreso?: number;
  className?: string;
}

export function CeldaMetrica({
  etiqueta,
  valor,
  secundario,
  tono = "neutro",
  titulo,
  progreso,
  className,
}: Props) {
  const vacio = valor === null;
  return (
    <div
      title={titulo}
      className={cn(
        "flex min-w-0 shrink-0 flex-col justify-center gap-0.5 px-3",
        className,
      )}
    >
      <span className="whitespace-nowrap text-[10px] font-medium uppercase leading-none tracking-wider text-tv-text-dim">
        {etiqueta}
      </span>
      <span className="flex items-baseline gap-1.5">
        <span
          className={cn(
            "whitespace-nowrap font-mono text-[13px] font-semibold leading-none tabular-nums",
            vacio ? "text-tv-text-dim" : TONO[tono],
          )}
        >
          {valor ?? "—"}
        </span>
        {secundario && (
          <span className="whitespace-nowrap font-mono text-[11px] leading-none tabular-nums text-tv-text-muted">
            {secundario}
          </span>
        )}
      </span>
      {progreso !== undefined && (
        <div
          className="mt-0.5 h-[3px] w-full overflow-hidden rounded-full bg-tv-border"
          role="progressbar"
          aria-valuenow={Math.round(progreso * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-500",
              tono === "positivo"
                ? "bg-tv-green"
                : tono === "negativo"
                  ? "bg-tv-red"
                  : "bg-tv-blue",
            )}
            style={{ width: `${Math.max(0, Math.min(1, progreso)) * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}

/** Separador vertical entre celdas. */
export function DivisorCelda() {
  return <div className="my-2 w-px shrink-0 self-stretch bg-tv-border" />;
}
