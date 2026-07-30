"use client";

import {
  Group,
  Panel,
  Separator,
  useDefaultLayout,
  type LayoutStorage,
} from "react-resizable-panels";
import { columnasPara } from "@/lib/chart/plantillas";
import { useChartStore, type VentanaTF } from "@/lib/store/chart-store";
import { VentanaFrame } from "@/components/chart/VentanaFrame";

/**
 * Mosaico de ventanas estilo TradingView.
 *
 * La geometría la DECLARA la plantilla activa (`lib/chart/plantillas.ts`), no se
 * calcula: por eso hay dos disposiciones para la misma cantidad (2 lado a lado
 * vs. 2 apiladas) y las rejillas de 8 y 10 salen parejas. Antes se repartía en
 * `ceil(√n)` columnas y 8 ventanas quedaban en columnas de 3+3+2.
 *
 * Estructura: un `Group` horizontal de columnas, y cada columna un `Group`
 * vertical de filas. Las ventanas no flotan; se arrastran las líneas divisorias
 * —y sus proporciones se recuerdan entre recargas—. Al maximizar una, se muestra
 * sola.
 */

const SEP_COL =
  "w-1 shrink-0 cursor-col-resize bg-tv-border transition-colors hover:bg-tv-blue/60 data-[separator]:bg-tv-border";
const SEP_ROW =
  "h-1 shrink-0 cursor-row-resize bg-tv-border transition-colors hover:bg-tv-blue/60";

/**
 * Dónde se guardan las proporciones de los divisores.
 *
 * En el servidor va un almacenamiento INERTE, no `undefined`: con `undefined` la
 * librería cae a su default, que es `localStorage` a secas, y Next pre-renderiza
 * esta página en el servidor —donde `localStorage` no existe— así que el build
 * fallaba con `ReferenceError: localStorage is not defined`.
 */
const SIN_ALMACENAMIENTO: LayoutStorage = {
  getItem: () => null,
  setItem: () => {},
};

const almacenamiento: LayoutStorage =
  typeof window === "undefined" ? SIN_ALMACENAMIENTO : window.localStorage;

/** Reparte las ventanas según las filas que declara cada columna. */
function repartir(ventanas: VentanaTF[], columnas: number[]): VentanaTF[][] {
  const salida: VentanaTF[][] = [];
  let i = 0;
  for (const filas of columnas) {
    salida.push(ventanas.slice(i, i + filas));
    i += filas;
  }
  return salida;
}

function celda(v: VentanaTF, symbol: string, puedeCerrar: boolean) {
  return (
    <div data-label="celda-mosaico" className="h-full w-full p-0.5">
      <VentanaFrame
        ventana={v}
        symbol={symbol}
        maximizada={false}
        puedeCerrar={puedeCerrar}
      />
    </div>
  );
}

/**
 * Una columna del mosaico: sus ventanas apiladas, con divisores propios.
 *
 * Es un componente aparte porque `useDefaultLayout` es un hook y las columnas se
 * generan en un bucle — no se puede llamar un hook ahí adentro. Cada columna
 * recuerda sus proporciones por separado.
 */
function ColumnaVentanas({
  ventanas,
  symbol,
  puedeCerrar,
  idGrupo,
}: {
  ventanas: VentanaTF[];
  symbol: string;
  puedeCerrar: boolean;
  idGrupo: string;
}) {
  const layout = useDefaultLayout({
    id: idGrupo,
    // Los ids de los paneles tienen que coincidir con los que se rendericen, o
    // la librería restaura un layout que no corresponde.
    panelIds: ventanas.map((v) => `fila-${v.id}`),
    storage: almacenamiento,
  });

  return (
    // Siempre un Group vertical, incluso con 1 ventana: así, al cerrar una
    // ventana de la columna, las que quedan conservan su identidad de React
    // (misma key `fila-<id>`, misma posición en el árbol) y NO se recargan.
    <Group orientation="vertical" className="h-full w-full" {...layout}>
      {ventanas.flatMap((v, ri) =>
        [
          ri > 0 ? <Separator key={`sep-fila-${v.id}`} className={SEP_ROW} /> : null,
          <Panel
            key={`fila-${v.id}`}
            id={`fila-${v.id}`}
            minSize={10}
            className="min-h-0"
          >
            {celda(v, symbol, puedeCerrar)}
          </Panel>,
        ].filter(Boolean),
      )}
    </Group>
  );
}

export function VentanasTimeframes() {
  const symbol = useChartStore((s) => s.symbol);
  const ventanas = useChartStore((s) => s.ventanasTF);
  const plantillaId = useChartStore((s) => s.plantillaId);
  const maximizadaId = useChartStore((s) => s.ventanaMaximizada);
  const maximizada = maximizadaId
    ? ventanas.find((v) => v.id === maximizadaId)
    : null;
  const puedeCerrar = ventanas.length > 1;

  // `columnasPara` se defiende de un estado incoherente (una plantilla de 4 con
  // 3 ventanas, o un id retirado en una versión anterior): manda la cantidad
  // real de ventanas.
  const columnas = columnasPara(plantillaId, ventanas.length);
  /**
   * Firma de la GEOMETRÍA, no de la plantilla.
   *
   * Se usa para el id de almacenamiento y para la `key` del grupo. Al ser la
   * geometría y no el nombre, dos disposiciones con la misma forma comparten
   * proporciones y no re-montan el mosaico al alternar entre ellas.
   */
  const firma = columnas.join("-");

  const layout = useDefaultLayout({
    id: `mosaico-${firma}`,
    panelIds: columnas.map((_, ci) => `col-${ci}`),
    storage: almacenamiento,
  });

  if (maximizada) {
    return (
      <div data-label="mosaico-maximizado" className="h-full w-full p-1">
        <VentanaFrame
          ventana={maximizada}
          symbol={symbol}
          maximizada
          puedeCerrar={puedeCerrar}
        />
      </div>
    );
  }

  const grupos = repartir(ventanas, columnas);
  const hijos: React.ReactNode[] = [];
  grupos.forEach((col, ci) => {
    if (ci > 0) hijos.push(<Separator key={`sep-col-${ci}`} className={SEP_COL} />);
    hijos.push(
      <Panel key={`col-${ci}`} id={`col-${ci}`} minSize={10} className="min-w-0">
        <ColumnaVentanas
          ventanas={col}
          symbol={symbol}
          puedeCerrar={puedeCerrar}
          idGrupo={`mosaico-${firma}-col${ci}`}
        />
      </Panel>,
    );
  });

  return (
    <div
      data-label="mosaico-ventanas"
      data-ventanas={ventanas.length}
      data-plantilla={plantillaId}
      data-columnas={columnas.length}
      className="h-full w-full"
    >
      {/* key por la GEOMETRÍA: `defaultLayout` solo se aplica al montar, así que
          cambiar de forma necesita re-montar el grupo para tomar las
          proporciones guardadas de esa forma. Los charts se recrean, pero
          `cacheVelas` / `cacheRango` los restauran sin volver a pedir velas. */}
      <Group
        key={`geo-${firma}`}
        orientation="horizontal"
        className="h-full w-full"
        {...layout}
      >
        {hijos}
      </Group>
    </div>
  );
}
