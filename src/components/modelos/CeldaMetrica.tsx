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

/**
 * Ancho reservado por defecto. Las celdas de un panel en vivo NO pueden
 * dimensionarse por su contenido: cuando el precio pasa de "63,185" a
 * "63,185.77" la celda se ensancha y empuja a todas las de la derecha — el
 * panel entero tiembla en cada tick. Reservando el ancho, el número cambia
 * dentro de un hueco fijo y nada se mueve.
 */
const ANCHO_POR_DEFECTO = "7rem";

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
  /** Ancho reservado (CSS). Subilo para valores largos, bajalo para contadores. */
  ancho?: string;
  className?: string;
}

export function CeldaMetrica({
  etiqueta,
  valor,
  secundario,
  tono = "neutro",
  titulo,
  progreso,
  ancho = ANCHO_POR_DEFECTO,
  className,
}: Props) {
  const vacio = valor === null;
  return (
    // Una celda es un par etiqueta/valor: en HTML eso es <dl>/<dt>/<dd>, no un
    // div con dos spans. `data-metrica` lleva el nombre al DOM para poder
    // identificar la celda en el inspector sin contar posiciones en la barra.
    <dl
      data-label="celda-metrica"
      data-metrica={etiqueta}
      data-vacio={vacio || undefined}
      title={titulo}
      style={{ minWidth: ancho }}
      className={cn(
        "m-0 flex min-w-0 shrink-0 flex-col justify-center gap-0.5 px-3",
        className,
      )}
    >
      <dt className="whitespace-nowrap text-[10px] font-medium uppercase leading-none tracking-wider text-tv-text-dim">
        {etiqueta}
      </dt>
      <dd className="m-0 flex items-baseline gap-1.5">
        <span
          data-label="celda-valor"
          className={cn(
            "whitespace-nowrap font-mono text-[13px] font-semibold leading-none tabular-nums",
            vacio ? "text-tv-text-dim" : TONO[tono],
          )}
        >
          {valor ?? "—"}
        </span>
        {secundario && (
          <span
            data-label="celda-valor-secundario"
            className="whitespace-nowrap font-mono text-[11px] leading-none tabular-nums text-tv-text-muted"
          >
            {secundario}
          </span>
        )}
      </dd>
      {progreso !== undefined && (
        <div
          data-label="celda-barra-progreso"
          className="mt-0.5 h-[3px] w-full overflow-hidden rounded-full bg-tv-border"
          role="progressbar"
          aria-label={etiqueta}
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
    </dl>
  );
}

/** Separador vertical entre celdas: decoración, invisible para lectores. */
export function DivisorCelda() {
  return (
    <div
      data-label="divisor-celda"
      role="separator"
      aria-orientation="vertical"
      className="my-2 w-px shrink-0 self-stretch bg-tv-border"
    />
  );
}
