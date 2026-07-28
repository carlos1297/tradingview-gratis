"use client";

import { Group, Panel, Separator } from "react-resizable-panels";
import { useChartStore, type VentanaTF } from "@/lib/store/chart-store";
import { VentanaFrame } from "@/components/chart/VentanaFrame";

/**
 * Layout de ventanas estilo TradingView: plantilla fija según la cantidad de
 * ventanas (columnas equilibradas, col = ceil(√n)) con divisores
 * redimensionables (react-resizable-panels). Las ventanas NO se mueven; solo se
 * arrastran las líneas divisorias. Al maximizar una, se muestra sola.
 */

const SEP_COL =
  "w-1 shrink-0 cursor-col-resize bg-tv-border transition-colors hover:bg-tv-blue/60 data-[separator]:bg-tv-border";
const SEP_ROW =
  "h-1 shrink-0 cursor-row-resize bg-tv-border transition-colors hover:bg-tv-blue/60";

/** Reparte las ventanas en columnas equilibradas (llena de izquierda a derecha). */
function repartirEnColumnas(ventanas: VentanaTF[]): VentanaTF[][] {
  const n = ventanas.length;
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
  const base = Math.floor(n / cols);
  const extra = n % cols;
  const columnas: VentanaTF[][] = [];
  let idx = 0;
  for (let c = 0; c < cols; c++) {
    const count = base + (c < extra ? 1 : 0);
    if (count <= 0) continue;
    columnas.push(ventanas.slice(idx, idx + count));
    idx += count;
  }
  return columnas;
}

export function VentanasTimeframes() {
  const symbol = useChartStore((s) => s.symbol);
  const ventanas = useChartStore((s) => s.ventanasTF);
  const maximizadaId = useChartStore((s) => s.ventanaMaximizada);
  const maximizada = maximizadaId
    ? ventanas.find((v) => v.id === maximizadaId)
    : null;
  const puedeCerrar = ventanas.length > 1;

  const celda = (v: VentanaTF) => (
    <div className="h-full w-full p-0.5">
      <VentanaFrame
        ventana={v}
        symbol={symbol}
        maximizada={false}
        puedeCerrar={puedeCerrar}
      />
    </div>
  );

  if (maximizada) {
    return (
      <div className="h-full w-full p-1">
        <VentanaFrame
          ventana={maximizada}
          symbol={symbol}
          maximizada
          puedeCerrar={puedeCerrar}
        />
      </div>
    );
  }

  const columnas = repartirEnColumnas(ventanas);
  const hijos: React.ReactNode[] = [];
  columnas.forEach((col, ci) => {
    if (ci > 0) hijos.push(<Separator key={`sep-col-${ci}`} className={SEP_COL} />);
    hijos.push(
      <Panel key={`col-${ci}`} minSize={10} className="min-w-0">
        {/* Siempre un Group vertical, incluso con 1 ventana: así, al cerrar una
            ventana de la columna, las que quedan conservan su identidad de React
            (misma key `row-<id>`, misma posición en el árbol) y NO se recargan. */}
        <Group orientation="vertical" className="h-full w-full">
          {col.flatMap((v, ri) =>
            [
              ri > 0 ? (
                <Separator key={`sep-row-${v.id}`} className={SEP_ROW} />
              ) : null,
              <Panel key={`row-${v.id}`} minSize={10} className="min-h-0">
                {celda(v)}
              </Panel>,
            ].filter(Boolean),
          )}
        </Group>
      </Panel>,
    );
  });

  return (
    <div className="h-full w-full">
      {/* key por cantidad de COLUMNAS (no de ventanas): al cerrar una ventana
          sin cambiar la cantidad de columnas, no se re-monta todo el mosaico
          (evita que se recarguen todas las temporalidades). */}
      <Group
        key={`cols-${columnas.length}`}
        orientation="horizontal"
        className="h-full w-full"
      >
        {hijos}
      </Group>
    </div>
  );
}
