import { beforeEach, describe, expect, test } from "bun:test";
import { useChartStore } from "@/lib/store/chart-store";
import type { ModelSignalsFile } from "../senales";

/**
 * Las señales del gráfico tienen DOS orígenes que escriben en el mismo lugar
 * (`chart-store.modelSignals`): un `senales.json` de backtest cargado a mano y
 * el modelo en vivo. Confundirlos rompía el gráfico de dos maneras distintas,
 * y estos tests fijan la separación.
 */

const senal = (tiempoMs: number) =>
  ({ tiempoMs, evento: "abrir_long", precio: 100 }) as const;

/** Backtest de marzo: 500 señales viejas. */
const BACKTEST: ModelSignalsFile = {
  simbolo: "BTCUSDT",
  split: "val",
  origen: "archivo",
  senales: [senal(1_741_192_200_000), senal(1_741_195_800_000)],
};

/** Modelo en vivo: una apertura de recién. */
const EN_VIVO: ModelSignalsFile = {
  simbolo: "BTCUSDT",
  split: "SAC en vivo",
  origen: "vivo",
  senales: [senal(Date.now())],
};

/**
 * La decisión que toma `ChartLigero`: ¿este conjunto de señales pone al
 * gráfico en modo histórico (sin WebSocket, saltando al período) o lo deja
 * corriendo en vivo?
 */
function esPeriodoHistorico(sig: ModelSignalsFile | null, simbolo: string): boolean {
  return !!(
    sig &&
    sig.origen !== "vivo" &&
    sig.senales.length > 0 &&
    sig.simbolo?.toUpperCase() === simbolo.toUpperCase()
  );
}

describe("modo histórico solo para backtests", () => {
  test("un backtest cargado a mano manda al gráfico al período histórico", () => {
    expect(esPeriodoHistorico(BACKTEST, "BTCUSDT")).toBe(true);
  });

  test("un modelo EN VIVO deja el gráfico corriendo", () => {
    // Esta era la regresión: las señales del motor entraban por el mismo campo
    // que un backtest, el gráfico entraba en modo histórico y NO se suscribía
    // al WebSocket — las velas quedaban congeladas mientras el modelo operaba.
    expect(esPeriodoHistorico(EN_VIVO, "BTCUSDT")).toBe(false);
  });

  test("señales de OTRO par no tocan este gráfico", () => {
    expect(esPeriodoHistorico(BACKTEST, "ETHUSDT")).toBe(false);
  });

  test("sin `origen` se asume backtest: es el comportamiento que ya existía", () => {
    const legado = { ...BACKTEST, origen: undefined };
    expect(esPeriodoHistorico(legado, "BTCUSDT")).toBe(true);
  });
});

describe("el backtest cargado a mano no lo pisa el modelo en vivo", () => {
  beforeEach(() => {
    useChartStore.getState().setModelSignals(null, { abrirPanel: false });
  });

  /** El guardia de `useSincronizarSenales` antes de publicar. */
  const elVivoPuedePublicar = () =>
    useChartStore.getState().modelSignals?.origen !== "archivo";

  test("con un backtest puesto, el sync en vivo se abstiene", () => {
    useChartStore.getState().setModelSignals(BACKTEST);
    expect(elVivoPuedePublicar()).toBe(false);
  });

  test("sin nada puesto, el modelo en vivo publica normalmente", () => {
    expect(elVivoPuedePublicar()).toBe(true);
  });

  test("al quitar el backtest, el vivo vuelve a mandar", () => {
    useChartStore.getState().setModelSignals(BACKTEST);
    expect(elVivoPuedePublicar()).toBe(false);

    useChartStore.getState().setModelSignals(null, { abrirPanel: false });
    expect(elVivoPuedePublicar()).toBe(true);
  });

  test("las señales en vivo sí se pisan entre sí (un tick reemplaza al anterior)", () => {
    useChartStore.getState().setModelSignals(EN_VIVO, { abrirPanel: false });
    expect(elVivoPuedePublicar()).toBe(true);
  });
});
