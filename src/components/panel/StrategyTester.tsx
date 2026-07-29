"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, FlaskConical, Play, TrendingUp, X } from "lucide-react";
import { formatPrecioEstable } from "@/lib/format";
import { vistaOperacion } from "@/lib/modelos/nucleo/derivar";
import { usePrecioMercado } from "@/lib/modelos/nucleo/usePrecioMercado";
import { fuentePorId } from "@/lib/modelos/registro";
import {
  useModeloActivo,
  useModelosDisponibles,
  useModelosStore,
} from "@/lib/store/modelos-store";
import { useChartStore } from "@/lib/store/chart-store";
import {
  buildOperaciones,
  computeMetricasGrupo,
  computeResumenTV,
  etiquetaMotivo,
  formatDuracion,
  generarOperacionesDemo,
  type MetricasGrupo,
  type OperacionIA,
} from "@/lib/trades";
import { cn } from "@/lib/utils";

/**
 * Probador de estrategias — réplica del "Strategy Tester" de TradingView:
 * franja de métricas + curva de equity (Resumen), resumen de rendimiento por
 * lado (Todas/Largas/Cortas) y lista de operaciones. Se despliega desde la
 * barra inferior. Sin senales.json cargado, un botón muestra datos de demo.
 */

const VERDE = "#26a69a";
const ROJO = "#ef5350";

type Pestana = "resumen" | "rendimiento" | "operaciones" | "comparar";

function formatUsd(v: number): string {
  const signo = v > 0 ? "+" : "";
  return `${signo}${v.toFixed(2)} USD`;
}

function formatFecha(ms: number): string {
  return new Date(ms).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function claseSigno(v: number): string {
  return v > 0 ? "text-tv-green" : v < 0 ? "text-tv-red" : "text-tv-text";
}

export function StrategyTester() {
  const abierto = useChartStore((s) => s.tradesPanelOpen);
  const setAbierto = useChartStore((s) => s.setTradesPanelOpen);
  const modelSignals = useChartStore((s) => s.modelSignals);
  const posicionDemo = useChartStore((s) => s.posicionDemo);
  const setPosicionDemo = useChartStore((s) => s.setPosicionDemo);
  const [pestana, setPestana] = useState<Pestana>("resumen");
  const [demo, setDemo] = useState(false);
  // Posición abierta del modelo activo: el mismo estado del que sale la barra
  // de modelos y el dibujo del gráfico, así los tres coinciden siempre.
  const estadoModelo = useModeloActivo();
  // Precio de mercado compartido con la barra de modelos y con la caja de la
  // operación en el gráfico. Antes acá se usaba `estadoModelo.precio` —el que
  // publica el motor, que decide una vez cada 5 minutos— así que el PnL de
  // esta franja no coincidía con el de los otros dos paneles.
  const precioVivo = usePrecioMercado(estadoModelo?.simbolo);
  // reloj de 1 s: hace avanzar la duración de la operación en curso sin
  // depender de que el motor publique (decide cada 5 minutos)
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const abierta = useMemo(() => {
    if (!estadoModelo || estadoModelo.posicion === "FLAT") return null;
    return vistaOperacion(estadoModelo, precioVivo, ahora);
  }, [estadoModelo, precioVivo, ahora]);

  // al cargar señales reales, sacar la operación de demo del gráfico
  useEffect(() => {
    if (modelSignals && posicionDemo) setPosicionDemo(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelSignals]);

  // Atajo P: abre/cierra el Probador. Es la salida de emergencia — funciona
  // aunque la barra inferior (el otro camino) no se vea por cualquier motivo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "p" && e.key !== "P") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // no robarle la tecla a un campo de texto (buscador de símbolo, etc.)
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) {
        return;
      }
      setAbierto(!useChartStore.getState().tradesPanelOpen);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setAbierto]);

  const salirDemo = () => {
    setDemo(false);
    setPosicionDemo(null);
  };

  const operaciones = useMemo(() => {
    if (modelSignals) return buildOperaciones(modelSignals.senales);
    return demo ? generarOperacionesDemo() : [];
  }, [modelSignals, demo]);

  const resumen = useMemo(() => computeResumenTV(operaciones), [operaciones]);

  // Cerrado = no ocupa nada. Vive dentro de la región elástica de page.tsx
  // (no es una fila del grid), así que devolver un elemento vacío es inocuo:
  // el mosaico se queda con todo el espacio.
  if (!abierto) return <div data-label="probador-cerrado" aria-hidden />;

  // La operación ABIERTA no es una operación cerrada: no entra en las
  // estadísticas (contarla falsearía win rate y profit factor, porque su
  // resultado todavía no existe). Pero tampoco puede faltar: un modelo recién
  // arrancado, con una posición abierta y ningún cierre, dejaba el panel en
  // "no hay datos" diciendo que conectaras el feed — con el feed conectado.
  const hayCerradas = operaciones.length > 0;
  const hayDatos = hayCerradas || abierta !== null;

  return (
    // Alto DESEADO 320 px, con tope del 45% de la región elástica (los gráficos
    // + este panel). El tope es en %, nunca en vh: vh mide la ventana del
    // navegador, que puede ser más alta que el área visible — pidiendo de más,
    // el faltante lo pagaba el mosaico hasta quedar en cero y los gráficos
    // desaparecían sin dejar scroll. En % del espacio real eso no puede pasar:
    // al mosaico siempre le queda el 55%.
    <section
      data-label="probador-estrategias"
      aria-label="Probador de estrategias"
      className="flex h-80 max-h-[45%] shrink-0 flex-col border-t border-tv-border bg-tv-panel"
    >
      {/* Barra de pestañas, como el Strategy Tester original */}
      <header
        data-label="probador-barra-titulo"
        className="flex h-9 shrink-0 items-center border-b border-tv-border px-2"
      >
        <div className="flex items-center gap-1.5 pr-3 text-xs font-semibold text-tv-text">
          <FlaskConical className="h-3.5 w-3.5 text-tv-blue" />
          <span>Probador de estrategias</span>
          {modelSignals ? (
            <span className="rounded bg-tv-blue/15 px-1.5 py-0.5 text-[10px] font-medium text-tv-blue">
              {/* el store lo alimentan varias fuentes (PPO por SSE, SAC por
                  estado_vivo.json, o un senales.json de backtest): prefijo
                  genérico en vez de "PPO" fijo, que era incorrecto para las
                  otras dos */}
              Modelo · {modelSignals.split}
            </span>
          ) : (
            demo && (
              <span className="rounded bg-tv-yellow/15 px-1.5 py-0.5 text-[10px] font-medium text-tv-yellow">
                Demo
              </span>
            )
          )}
        </div>
        <TabBtn activa={pestana === "resumen"} onClick={() => setPestana("resumen")}>
          Resumen
        </TabBtn>
        <TabBtn
          activa={pestana === "rendimiento"}
          onClick={() => setPestana("rendimiento")}
        >
          Rendimiento
        </TabBtn>
        <TabBtn activa={pestana === "comparar"} onClick={() => setPestana("comparar")}>
          Comparar modelos
        </TabBtn>
        <TabBtn
          activa={pestana === "operaciones"}
          onClick={() => setPestana("operaciones")}
        >
          Lista de operaciones
          {hayDatos && (
            <span className="ml-1.5 text-[10px] text-tv-text-muted">
              {operaciones.length}
            </span>
          )}
        </TabBtn>
        {demo && !modelSignals && (
          <>
            <button
              onClick={() =>
                setPosicionDemo(posicionDemo ? null : { lado: "long" })
              }
              title="Dibujar una operación abierta de ejemplo sobre el gráfico"
              className={cn(
                "ml-2 flex items-center gap-1 rounded px-2 py-1 text-[11px]",
                posicionDemo
                  ? "bg-tv-green/15 text-tv-green"
                  : "text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
              )}
            >
              <TrendingUp className="h-3 w-3" />
              Operación abierta en gráfico
            </button>
            <button
              onClick={salirDemo}
              title="Salir de la demostración"
              className="ml-1 flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
            >
              <X className="h-3 w-3" />
              Salir de demo
            </button>
          </>
        )}
        <button
          onClick={() => setAbierto(false)}
          title="Contraer panel"
          className="ml-auto rounded p-1.5 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </header>

      {/* La posición abierta se muestra SIEMPRE arriba, separada de las
          estadísticas: es información en curso, no un resultado. */}
      {abierta && estadoModelo && (
        <FranjaAbierta vista={abierta} modelo={estadoModelo.modeloEtiqueta} />
      )}

      {/* Sin NINGÚN dato (ni cerradas ni abierta) el panel no tiene pestañas
          que mostrar: se explica qué falta y se ofrece la demo.

          Con datos, la pestaña elegida SIEMPRE manda. Antes, cuando había una
          operación abierta pero ningún cierre, este bloque cortaba acá y
          devolvía el aviso para las tres pestañas: los botones marcaban el
          subrayado azul y abajo no cambiaba nada, así que «Resumen» parecía
          roto y el panel se quedaba clavado en la franja de la operación
          abierta. El aviso ahora es una tira dentro de cada pestaña. */}
      {!hayDatos ? (
        <EstadoVacio onDemo={() => setDemo(true)} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {!hayCerradas && <SinCerradas modelo={estadoModelo?.modeloEtiqueta ?? null} />}
          {pestana === "resumen" ? (
            <Resumen operaciones={operaciones} m={resumen.todas} />
          ) : pestana === "comparar" ? (
            <CompararModelos />
          ) : pestana === "rendimiento" ? (
            <Rendimiento resumen={resumen} />
          ) : (
            <ListaOperaciones operaciones={operaciones} />
          )}
        </div>
      )}
    </section>
  );
}

function TabBtn({
  activa,
  onClick,
  children,
}: {
  activa: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative h-9 px-3 text-xs",
        activa
          ? "text-tv-text after:absolute after:bottom-0 after:left-2 after:right-2 after:h-0.5 after:rounded-full after:bg-tv-blue"
          : "text-tv-text-muted hover:text-tv-text",
      )}
    >
      {children}
    </button>
  );
}

function EstadoVacio({ onDemo }: { onDemo: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-auto px-4 text-center">
      <div className="max-w-xl text-xs text-tv-text-muted">
        Ningún modelo publicó operaciones todavía. Arrancá un motor —por ejemplo
        el SAC con{" "}
        <span className="rounded bg-tv-bg px-1 py-0.5 font-mono text-[11px] text-tv-text">
          python operar_vivo.py
        </span>{" "}
        en <span className="text-tv-text">modelo_SAC/</span>— o cargá un{" "}
        <span className="text-tv-text">senales.json</span> de backtest con el
        botón «Señales IA». También podés previsualizar el panel con datos de
        ejemplo.
      </div>
      <button
        onClick={onDemo}
        className="flex shrink-0 items-center gap-1.5 rounded-md bg-tv-blue px-3 py-1.5 text-xs font-medium text-white hover:bg-tv-blue/90"
      >
        <Play className="h-3.5 w-3.5" />
        Ver demostración
      </button>
    </div>
  );
}

/**
 * Hay una posición abierta pero ningún cierre todavía: no se puede calcular
 * nada (win rate, profit factor…) porque no hay resultados.
 *
 * Es una TIRA, no una pantalla: va arriba del contenido de la pestaña elegida,
 * que se sigue mostrando (con las métricas en "—"). Cuando ocupaba todo el
 * cuerpo, las tres pestañas mostraban lo mismo y el panel parecía trabado.
 */
function SinCerradas({ modelo }: { modelo: string | null }) {
  return (
    <div className="shrink-0 border-b border-tv-border bg-tv-bg/40 px-4 py-2 text-[11px] text-tv-text-muted">
      {modelo ?? "El modelo"} tiene una operación <strong>en curso</strong> y
      todavía ningún cierre, así que las métricas aparecen en «—»: rentabilidad,
      factor de beneficio y drawdown se calculan solo sobre operaciones
      terminadas, y el resultado de la abierta aún no existe.
    </div>
  );
}

/** Franja con la operación EN CURSO del modelo activo. */
function FranjaAbierta({
  vista,
  modelo,
}: {
  vista: ReturnType<typeof vistaOperacion>;
  modelo: string;
}) {
  const largo = vista.lado === "LONG";
  const pnl = vista.pnlNoRealizadoUsd;
  return (
    <div className="flex shrink-0 items-center gap-4 overflow-x-auto border-b border-tv-border bg-tv-bg/40 px-4 py-2 text-[11px]">
      <span className="flex shrink-0 items-center gap-1.5 font-semibold text-tv-text">
        <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tv-green" />
        {modelo} · operación abierta
      </span>
      <span
        className={cn(
          "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase",
          largo ? "bg-tv-green/15 text-tv-green" : "bg-tv-red/15 text-tv-red",
        )}
      >
        {vista.lado}
      </span>
      <DatoAbierta etq="Entrada" v={vista.precioEntrada !== null ? formatPrecioEstable(vista.precioEntrada) : "—"} />
      <DatoAbierta etq="Actual" v={vista.precioActual !== null ? formatPrecioEstable(vista.precioActual) : "—"} />
      <DatoAbierta
        etq="PnL flotante"
        v={
          pnl !== null
            ? `${pnl < 0 ? "−" : "+"}${Math.abs(pnl).toFixed(2)} USD`
            : "—"
        }
        clase={claseSigno(pnl ?? 0)}
      />
      <DatoAbierta
        etq="%"
        v={
          vista.pnlNoRealizadoPct !== null
            ? `${vista.pnlNoRealizadoPct < 0 ? "−" : "+"}${Math.abs(vista.pnlNoRealizadoPct).toFixed(2)} %`
            : "—"
        }
        clase={claseSigno(vista.pnlNoRealizadoPct ?? 0)}
      />
      <DatoAbierta etq="Tamaño" v={vista.nocional !== null ? `${vista.nocional.toFixed(0)} USD` : "—"} />
      <DatoAbierta etq="Duración" v={vista.duracionMs !== null ? formatDuracion(vista.duracionMs) : "—"} />
      <DatoAbierta etq="SL" v={vista.stopLoss !== null ? formatPrecioEstable(vista.stopLoss) : "—"} clase="text-tv-red" />
      <DatoAbierta etq="TP" v={vista.takeProfit !== null ? formatPrecioEstable(vista.takeProfit) : "—"} clase="text-tv-green" />
      <span
        className="ml-auto shrink-0 whitespace-nowrap text-[10px] text-tv-text-dim"
        title="Las estadísticas de abajo se calculan solo con operaciones CERRADAS: incluir la abierta falsearía el win rate y el factor de beneficio"
      >
        no cuenta en las estadísticas
      </span>
    </div>
  );
}

function DatoAbierta({ etq, v, clase }: { etq: string; v: string; clase?: string }) {
  return (
    <span className="flex shrink-0 items-baseline gap-1 whitespace-nowrap">
      <span className="text-tv-text-dim">{etq}</span>
      <span className={cn("font-mono tabular-nums", clase ?? "text-tv-text")}>{v}</span>
    </span>
  );
}

// ── Resumen: franja de métricas + curva de equity (estilo TradingView) ─────

function Resumen({
  operaciones,
  m,
}: {
  operaciones: OperacionIA[];
  m: MetricasGrupo;
}) {
  // Sin cierres no hay nada que promediar: un "+0.00 USD" o un factor de
  // beneficio "∞" se leerían como resultados reales. Mismo criterio que la
  // tabla de Rendimiento, que ya mostraba "—" con cero operaciones.
  const vacio = m.totalTrades === 0;
  const v = (texto: string) => (vacio ? "—" : texto);
  const c = (clase: string) => (vacio ? "text-tv-text-dim" : clase);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 overflow-x-auto border-b border-tv-border">
        <Tarjeta
          etiqueta="Beneficio neto"
          valor={v(formatUsd(m.netProfit))}
          clase={c(claseSigno(m.netProfit))}
        />
        <Tarjeta
          etiqueta="Operaciones cerradas"
          valor={String(m.totalTrades)}
          sub={vacio ? undefined : `${m.winning} gan · ${m.losing} perd`}
        />
        <Tarjeta
          etiqueta="Porcentaje rentable"
          valor={v(`${m.percentProfitable.toFixed(2)} %`)}
          clase={c(m.percentProfitable >= 50 ? "text-tv-green" : "text-tv-red")}
          sub={vacio ? undefined : `${m.winning} de ${m.totalTrades}`}
        />
        <Tarjeta
          etiqueta="Factor de beneficio"
          valor={v(m.profitFactor === null ? "∞" : m.profitFactor.toFixed(3))}
          clase={c(
            m.profitFactor === null || m.profitFactor >= 1
              ? "text-tv-green"
              : "text-tv-red",
          )}
        />
        <Tarjeta
          etiqueta="Máx. drawdown"
          valor={v(formatUsd(-m.maxDrawdown))}
          clase={c("text-tv-red")}
        />
        <Tarjeta
          etiqueta="Operación promedio"
          valor={v(formatUsd(m.avgTrade))}
          clase={c(claseSigno(m.avgTrade))}
        />
        <Tarjeta
          etiqueta="Duración media"
          valor={v(formatDuracion(m.avgDuracionMs))}
          ultima
        />
      </div>
      {vacio ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-4 text-center text-[11px] text-tv-text-dim">
          La curva de equity se dibuja con las operaciones cerradas: todavía no
          hay ninguna.
        </div>
      ) : (
        <CurvaBeneficio operaciones={operaciones} />
      )}
    </div>
  );
}

function Tarjeta({
  etiqueta,
  valor,
  clase,
  sub,
  ultima,
}: {
  etiqueta: string;
  valor: string;
  clase?: string;
  sub?: string;
  ultima?: boolean;
}) {
  return (
    <div
      className={cn(
        "min-w-[150px] flex-1 px-4 py-3",
        !ultima && "border-r border-tv-border",
      )}
    >
      <div className="whitespace-nowrap text-[11px] text-tv-text-muted">
        {etiqueta}
      </div>
      <div className={cn("mt-1 text-lg font-semibold tabular-nums", clase ?? "text-tv-text")}>
        {valor}
      </div>
      {sub && (
        <div className="text-[11px] tabular-nums text-tv-text-dim">{sub}</div>
      )}
    </div>
  );
}

function CurvaBeneficio({ operaciones }: { operaciones: OperacionIA[] }) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);

  const ANCHO = 1000;
  const ALTO = 190;
  const MARGEN = { arriba: 14, abajo: 16, izq: 8, der: 60 };

  const puntos = useMemo(() => {
    const valores = [0, ...operaciones.map((o) => o.acumuladoUsd)];
    const min = Math.min(...valores);
    const max = Math.max(...valores);
    const rango = max - min || 1;
    const anchoUtil = ANCHO - MARGEN.izq - MARGEN.der;
    const altoUtil = ALTO - MARGEN.arriba - MARGEN.abajo;
    const x = (i: number) =>
      MARGEN.izq + (valores.length > 1 ? (i / (valores.length - 1)) * anchoUtil : 0);
    const y = (v: number) => MARGEN.arriba + (1 - (v - min) / rango) * altoUtil;
    return {
      valores,
      coords: valores.map((v, i) => [x(i), y(v)] as const),
      yCero: y(0),
      min,
      max,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operaciones]);

  const linea = puntos.coords
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const primeraX = puntos.coords[0][0];
  const ultimaX = puntos.coords[puntos.coords.length - 1][0];
  const area = `${linea} L${ultimaX.toFixed(1)},${puntos.yCero.toFixed(1)} L${primeraX.toFixed(1)},${puntos.yCero.toFixed(1)} Z`;
  const finalPositivo = puntos.valores[puntos.valores.length - 1] >= 0;
  const colorLinea = finalPositivo ? VERDE : ROJO;

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const xRel = ((e.clientX - rect.left) / rect.width) * ANCHO;
    const n = puntos.coords.length;
    const anchoUtil = ANCHO - MARGEN.izq - MARGEN.der;
    const i = Math.round(((xRel - MARGEN.izq) / anchoUtil) * (n - 1));
    const idx = Math.max(0, Math.min(n - 1, i));
    setHover({ i: idx, x: puntos.coords[idx][0], y: puntos.coords[idx][1] });
  }

  return (
    <div ref={contenedorRef} className="relative min-h-0 flex-1 p-3">
      <div className="mb-1 text-[10px] uppercase tracking-wide text-tv-text-dim">
        Curva de equity · beneficio acumulado (USD)
      </div>
      <svg
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        preserveAspectRatio="none"
        className="h-[calc(100%-18px)] w-full cursor-crosshair"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <line
          x1={MARGEN.izq}
          x2={ANCHO - MARGEN.der}
          y1={puntos.yCero}
          y2={puntos.yCero}
          stroke="#2a2e39"
          strokeWidth="1"
        />
        <text x={ANCHO - MARGEN.der + 6} y={puntos.yCero + 3} fill="#787b86" fontSize="10">
          0
        </text>
        <text x={ANCHO - MARGEN.der + 6} y={MARGEN.arriba + 8} fill="#787b86" fontSize="10">
          {puntos.max.toFixed(0)}
        </text>
        <text x={ANCHO - MARGEN.der + 6} y={ALTO - MARGEN.abajo} fill="#787b86" fontSize="10">
          {puntos.min.toFixed(0)}
        </text>
        <path d={area} fill={colorLinea} opacity="0.12" />
        <path
          d={linea}
          fill="none"
          stroke={colorLinea}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
        />
        {hover && (
          <>
            <line
              x1={hover.x}
              x2={hover.x}
              y1={MARGEN.arriba}
              y2={ALTO - MARGEN.abajo}
              stroke="#787b86"
              strokeWidth="1"
              strokeDasharray="3,3"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={hover.x}
              cy={hover.y}
              r="3.5"
              fill={colorLinea}
              stroke="#131722"
              strokeWidth="1.5"
            />
          </>
        )}
      </svg>
      {hover && (
        <div className="pointer-events-none absolute left-3 top-6 rounded border border-tv-border bg-tv-bg/95 px-2 py-1 text-[11px] tabular-nums">
          <span className="text-tv-text-muted">
            {hover.i === 0 ? "Inicio" : `Operación #${hover.i}`}
          </span>{" "}
          <span className={claseSigno(puntos.valores[hover.i])}>
            {formatUsd(puntos.valores[hover.i])}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Rendimiento: tabla Todas / Largas / Cortas (Performance Summary) ────────

type Celda = { txt: string; clase: string };

const NEUTRO = "text-tv-text";
const usdNeg = (v: number) => formatUsd(-Math.abs(v));

const FILAS: Array<{ etq: string; celda: (m: MetricasGrupo) => Celda }> = [
  { etq: "Beneficio neto", celda: (m) => ({ txt: formatUsd(m.netProfit), clase: claseSigno(m.netProfit) }) },
  { etq: "Beneficio bruto", celda: (m) => ({ txt: formatUsd(m.grossProfit), clase: "text-tv-green" }) },
  { etq: "Pérdida bruta", celda: (m) => ({ txt: usdNeg(m.grossLoss), clase: "text-tv-red" }) },
  { etq: "Máx. run-up", celda: (m) => ({ txt: formatUsd(m.maxRunup), clase: "text-tv-green" }) },
  { etq: "Máx. drawdown", celda: (m) => ({ txt: usdNeg(m.maxDrawdown), clase: "text-tv-red" }) },
  {
    etq: "Factor de beneficio",
    celda: (m) => ({
      txt: m.profitFactor === null ? "∞" : m.profitFactor.toFixed(3),
      clase: m.profitFactor === null || m.profitFactor >= 1 ? "text-tv-green" : "text-tv-red",
    }),
  },
  { etq: "Total de operaciones cerradas", celda: (m) => ({ txt: String(m.totalTrades), clase: NEUTRO }) },
  { etq: "Operaciones ganadoras", celda: (m) => ({ txt: String(m.winning), clase: NEUTRO }) },
  { etq: "Operaciones perdedoras", celda: (m) => ({ txt: String(m.losing), clase: NEUTRO }) },
  {
    etq: "Porcentaje rentable",
    celda: (m) => ({
      txt: `${m.percentProfitable.toFixed(2)} %`,
      clase: m.percentProfitable >= 50 ? "text-tv-green" : "text-tv-red",
    }),
  },
  { etq: "Operación promedio", celda: (m) => ({ txt: formatUsd(m.avgTrade), clase: claseSigno(m.avgTrade) }) },
  { etq: "Operación ganadora promedio", celda: (m) => ({ txt: formatUsd(m.avgWin), clase: "text-tv-green" }) },
  { etq: "Operación perdedora promedio", celda: (m) => ({ txt: usdNeg(m.avgLoss), clase: "text-tv-red" }) },
  {
    etq: "Ratio prom. gan. / pérd.",
    celda: (m) => ({ txt: m.ratioWinLoss === null ? "∞" : m.ratioWinLoss.toFixed(3), clase: NEUTRO }),
  },
  { etq: "Mayor operación ganadora", celda: (m) => ({ txt: formatUsd(m.largestWin), clase: "text-tv-green" }) },
  { etq: "Mayor operación perdedora", celda: (m) => ({ txt: usdNeg(m.largestLoss), clase: "text-tv-red" }) },
  { etq: "Duración media", celda: (m) => ({ txt: formatDuracion(m.avgDuracionMs), clase: NEUTRO }) },
  {
    // Resultado ajustado por riesgo: es lo que permite comparar dos modelos
    // sin premiar al más temerario. Ver `MetricasGrupo.sharpe`.
    etq: "Sharpe (por operación)",
    celda: (m) => ({
      txt: m.sharpe === null ? "—" : m.sharpe.toFixed(3),
      clase: m.sharpe === null ? NEUTRO : m.sharpe >= 0 ? "text-tv-green" : "text-tv-red",
    }),
  },
];


// ── Comparar modelos: una fila por motor, mismas métricas ──────────────────

/**
 * Rendimiento de TODOS los modelos, lado a lado.
 *
 * Las estadísticas de las otras pestañas son del modelo ACTIVO a propósito
 * (mezclar dos motores daría un win rate sin significado). Pero la pregunta
 * "¿cuál va mejor?" necesita verlos juntos, y eso es lo que hace esta tabla:
 * cada fila se calcula por separado, con las mismas funciones puras, así los
 * números coinciden exactamente con los que muestra cada modelo por su cuenta.
 */
function CompararModelos() {
  const modelos = useModelosDisponibles();
  const modeloActivo = useModelosStore((s) => s.modeloActivo);
  const setModeloActivo = useModelosStore((s) => s.setModeloActivo);

  const filas = useMemo(
    () =>
      modelos.map((e) => ({
        id: e.modeloId,
        etiqueta: e.modeloEtiqueta,
        color: fuentePorId(e.modeloId)?.color ?? "#787b86",
        simbolo: e.simbolo,
        m: computeMetricasGrupo(buildOperaciones(e.senales)),
      })),
    [modelos],
  );

  if (filas.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-4 text-center text-xs text-tv-text-muted">
        Ningún modelo publicando. Arrancá al menos dos motores para poder
        compararlos.
      </div>
    );
  }

  const col = "px-3 py-2 text-right font-medium";
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="w-full border-collapse text-[11px] tabular-nums">
        <thead className="sticky top-0 z-10 bg-tv-panel">
          <tr className="border-b border-tv-border text-[10px] uppercase tracking-wide text-tv-text-dim">
            <th className="px-3 py-2 text-left font-medium">Modelo</th>
            <th className={col}>Beneficio neto</th>
            <th className={col}>Cerradas</th>
            <th className={col}>% rentable</th>
            <th className={col}>Factor</th>
            <th className={col}>Sharpe</th>
            <th className={col}>Máx. DD</th>
            <th className={col}>Operación prom.</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => {
            const vacio = f.m.totalTrades === 0;
            const v = (t: string) => (vacio ? "—" : t);
            return (
              <tr
                key={f.id}
                onClick={() => setModeloActivo(f.id)}
                title={`Analizar ${f.etiqueta} en las demás pestañas`}
                className={cn(
                  "cursor-pointer border-b border-tv-border/40 hover:bg-tv-panel-hover",
                  i % 2 === 1 && "bg-tv-bg/30",
                  modeloActivo === f.id && "bg-tv-blue/10",
                )}
              >
                <td className="px-3 py-2">
                  <span className="flex items-center gap-2">
                    {/* mismo color con el que se dibuja en el gráfico */}
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ background: f.color }}
                      aria-hidden
                    />
                    <span className="font-semibold text-tv-text">{f.etiqueta}</span>
                    <span className="text-[10px] text-tv-text-dim">{f.simbolo}</span>
                  </span>
                </td>
                <td className={cn(col, vacio ? "text-tv-text-dim" : claseSigno(f.m.netProfit))}>
                  {v(formatUsd(f.m.netProfit))}
                </td>
                <td className={cn(col, "text-tv-text-muted")}>{f.m.totalTrades}</td>
                <td className={cn(col, vacio ? "text-tv-text-dim" : f.m.percentProfitable >= 50 ? "text-tv-green" : "text-tv-red")}>
                  {v(`${f.m.percentProfitable.toFixed(2)} %`)}
                </td>
                <td className={cn(col, "text-tv-text")}>
                  {v(f.m.profitFactor === null ? "∞" : f.m.profitFactor.toFixed(3))}
                </td>
                <td className={cn(col, f.m.sharpe === null ? "text-tv-text-dim" : f.m.sharpe >= 0 ? "text-tv-green" : "text-tv-red")}>
                  {f.m.sharpe === null ? "—" : f.m.sharpe.toFixed(3)}
                </td>
                <td className={cn(col, vacio ? "text-tv-text-dim" : "text-tv-red")}>
                  {v(formatUsd(-f.m.maxDrawdown))}
                </td>
                <td className={cn(col, vacio ? "text-tv-text-dim" : claseSigno(f.m.avgTrade))}>
                  {v(formatUsd(f.m.avgTrade))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="px-3 py-2 text-[10px] text-tv-text-dim">
        Clic en una fila para analizar ese modelo en las demás pestañas. Las
        métricas se calculan solo sobre operaciones CERRADAS de cada motor.
      </p>
    </div>
  );
}

function Rendimiento({
  resumen,
}: {
  resumen: { todas: MetricasGrupo; largas: MetricasGrupo; cortas: MetricasGrupo };
}) {
  const grupos: Array<[string, MetricasGrupo]> = [
    ["Todas", resumen.todas],
    ["Largas", resumen.largas],
    ["Cortas", resumen.cortas],
  ];
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="w-full border-collapse text-[11px] tabular-nums">
        <thead className="sticky top-0 z-10 bg-tv-panel">
          <tr className="border-b border-tv-border text-[10px] uppercase tracking-wide text-tv-text-dim">
            <th className="px-4 py-2 text-left font-medium">Métrica</th>
            {grupos.map(([nombre]) => (
              <th key={nombre} className="px-4 py-2 text-right font-medium">
                {nombre}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {FILAS.map((fila, i) => (
            <tr
              key={fila.etq}
              className={cn(
                "border-b border-tv-border/40",
                i % 2 === 1 && "bg-tv-bg/30",
              )}
            >
              <td className="px-4 py-1.5 text-tv-text-muted">{fila.etq}</td>
              {grupos.map(([nombre, m]) => {
                const c =
                  m.totalTrades === 0
                    ? { txt: "—", clase: "text-tv-text-dim" }
                    : fila.celda(m);
                return (
                  <td
                    key={nombre}
                    className={cn("px-4 py-1.5 text-right font-medium", c.clase)}
                  >
                    {c.txt}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Lista de operaciones ───────────────────────────────────────────────────

function ListaOperaciones({ operaciones }: { operaciones: OperacionIA[] }) {
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="w-full border-collapse text-[11px] tabular-nums">
        <thead className="sticky top-0 z-10 bg-tv-panel">
          <tr className="border-b border-tv-border text-left text-[10px] uppercase tracking-wide text-tv-text-dim">
            <th className="px-3 py-2 font-medium">#</th>
            <th className="px-3 py-2 font-medium">Tipo</th>
            <th className="px-3 py-2 font-medium">Entrada</th>
            <th className="px-3 py-2 font-medium">Salida</th>
            <th className="px-3 py-2 text-right font-medium">Precio entrada</th>
            <th className="px-3 py-2 text-right font-medium">Precio salida</th>
            <th className="px-3 py-2 font-medium">Señal</th>
            <th className="px-3 py-2 text-right font-medium">Beneficio</th>
            <th className="px-3 py-2 text-right font-medium">%</th>
            <th className="px-3 py-2 text-right font-medium">Acumulado</th>
          </tr>
        </thead>
        <tbody>
          {operaciones.length === 0 && (
            <tr>
              <td colSpan={10} className="px-3 py-6 text-center text-tv-text-dim">
                Ninguna operación cerrada todavía.
              </td>
            </tr>
          )}
          {operaciones.map((op) => (
            <tr
              key={op.indice}
              className="border-b border-tv-border/50 hover:bg-tv-panel-hover"
            >
              <td className="px-3 py-1.5 text-tv-text-muted">{op.indice}</td>
              <td className="px-3 py-1.5">
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                    op.lado === "long"
                      ? "bg-tv-green/15 text-tv-green"
                      : "bg-tv-red/15 text-tv-red",
                  )}
                >
                  {op.lado}
                </span>
              </td>
              <td className="px-3 py-1.5 text-tv-text-muted">
                {formatFecha(op.tiempoEntradaMs)}
              </td>
              <td className="px-3 py-1.5 text-tv-text-muted">
                {formatFecha(op.tiempoSalidaMs)}
              </td>
              <td className="px-3 py-1.5 text-right text-tv-text">
                {op.precioEntrada.toLocaleString("es-AR", { maximumFractionDigits: 2 })}
              </td>
              <td className="px-3 py-1.5 text-right text-tv-text">
                {op.precioSalida.toLocaleString("es-AR", { maximumFractionDigits: 2 })}
              </td>
              <td className="px-3 py-1.5 text-tv-text-muted">{etiquetaMotivo(op.motivo)}</td>
              <td className={cn("px-3 py-1.5 text-right font-medium", claseSigno(op.pnlUsd))}>
                {formatUsd(op.pnlUsd)}
              </td>
              <td className={cn("px-3 py-1.5 text-right", claseSigno(op.pnlPct))}>
                {op.pnlPct > 0 ? "+" : ""}
                {op.pnlPct.toFixed(2)} %
              </td>
              <td className={cn("px-3 py-1.5 text-right", claseSigno(op.acumuladoUsd))}>
                {formatUsd(op.acumuladoUsd)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
