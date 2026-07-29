---
name: rendimiento-tiempo-real
description: Reglas de rendimiento para este visor de charts en tiempo real (Next 16 · React 19.2 · zustand 5 · lightweight-charts 5). Usar SIEMPRE que se toque un componente que recibe ticks de WebSocket, dibuje en canvas, lea del store, se suscriba a un stream de Binance o al estado de un modelo de IA — y antes de agregar un useState, un useEffect o un intervalo en components/chart/, components/modelos/ o components/panel/.
---

# Rendimiento en tiempo real

Este proyecto no es una web que se carga una vez: es un panel que recibe
**varios ticks por segundo** de Binance y de los motores de IA, y que dibuja
sobre cuatro canvas superpuestos por ventana, con hasta 10 ventanas abiertas.
El costo no está en la carga inicial sino en **lo que pasa 60 veces por
minuto**.

Versiones reales (verificar con `cat package.json` antes de asumir):
Next **16.2.10** · React **19.2.7** · TypeScript **6** · zustand **5** ·
lightweight-charts **5.2** · Tailwind **4** · runtime **bun**.

> La app es **100 % cliente**: todo es `"use client"` y los datos llegan por
> REST/WebSocket desde el navegador. Server Components, `use cache`, PPR,
> streaming y Server Actions **no aplican acá** — no los propongas para este
> repo aunque sean lo recomendado en un Next típico.

---

## La regla que ordena todo lo demás

> **Un dato que se DIBUJA no va en `useState`. Un dato que se MUESTRA, sí.**

Un `useState` re-renderiza el componente entero. En `ChartLigero` eso significa
volver a evaluar un componente que sostiene el chart, las series de
indicadores, el heatmap, el VPVR, el footprint y la caja de la posición — y hay
una instancia por ventana. A 1 tick/segundo con 4 ventanas son 4 re-renders por
segundo a cambio de nada, porque el resultado visible lo produce el canvas, no
el árbol de React.

Las tres formas de evitarlo, todas ya usadas en el repo:

### 1. Ref + repintado propio (para canvas)

`lib/modelos/usePrecioMercado.ts` exporta el mismo dato de las dos maneras, y
la elección no es de estilo:

| Hook | Dónde | Por qué |
|---|---|---|
| `usePrecioMercado()` | `BarraModelosIA`, `StrategyTester` | el número se **muestra**: hace falta re-render |
| `usePrecioMercadoRef()` | `ChartLigero` | el número se **dibuja**: la ref se lee dentro de `dibujarPosicion()` |

Al agregar una fuente de datos en vivo, preguntate cuál de las dos necesitás.
Si dudás, mirá si el valor aparece en el JSX: si no aparece, va en ref.

### 2. Escritura directa al DOM (para texto que cambia cada tick)

`pintarLeyenda()` y `pintarOrderFlow()` en `ChartLigero.tsx` reciben un
`HTMLDivElement` y le asignan `innerHTML`. No hay estado, no hay re-render: la
leyenda OHLC se actualiza con cada trade sin tocar el árbol de React.

Las dos son **funciones de módulo**, fuera del componente, a propósito: no
dependen del scope y quedan a salvo del reordenamiento de declaraciones del
compilador de React.

### 3. Ref espejo del store (para leer valor fresco en callbacks de larga vida)

```ts
const heatmapActivo = useChartStore((s) => s.indicators.liqHeatmap);
const heatmapActivoRef = useRef(heatmapActivo);
heatmapActivoRef.current = heatmapActivo;   // en cada render, sin efecto
```

El handler del WebSocket vive mientras dure la suscripción. Si leyera
`heatmapActivo` directo, capturaría el valor del render en que se creó; meterlo
en las dependencias del efecto obligaría a **desuscribir y resuscribir el
stream** cada vez que el usuario toca un interruptor. La ref da el valor de
ahora sin ninguna de las dos cosas.

Hay ocho de estas en `ChartLigero.tsx` (líneas ~280-330). Seguí el patrón.

---

## Coalescing: nunca dibujar dentro del handler

Binance manda varios trades por segundo; el navegador pinta 60 veces por
segundo como mucho. Dibujar dentro del handler es trabajo tirado.

El patrón del repo, repetido para cada capa (`solicitarDibujoPosicion`,
`solicitarDibujoHeatmap`, `solicitarDibujoVpvr`, `solicitarActualizarUltimoPunto`):

```ts
const dibujoPendienteRef = useRef(false);

function solicitarDibujo() {
  if (dibujoPendienteRef.current) return;   // ya hay uno agendado: salir
  dibujoPendienteRef.current = true;
  requestAnimationFrame(() => {
    dibujoPendienteRef.current = false;
    dibujar();
  });
}
```

Veinte ticks entre dos frames producen **un** dibujo. Si agregás una capa
nueva al chart, dale su propio par `solicitar…` / `dibujar…`; no llames al
dibujo directo desde `onCandle` ni desde `subscribeAggTrade`.

**Nunca** uses `setInterval` a menos de 100 ms para dibujar: no está
sincronizado con el compositor y pinta frames que nadie ve. Un intervalo largo
(≥ 500 ms) sí es válido como *heartbeat* que dispara un `solicitar…`, que es
lo que hace la caja de la posición.

---

## Recalcular en el cierre de vela, no en cada tick

Distinción central de `ChartLigero.onCandle`:

```ts
if (vela.isFinal) {
  recalcularIndicadores();                 // O(n) sobre 1000 velas: ~1 vez por minuto
  heatmapRef.current = computeLiquidationHeatmap(velas, …);
} else {
  solicitarActualizarUltimoPunto();        // O(1): solo el último punto
}
```

Una EMA de 1000 velas recalculada en cada trade es el camino más corto a que el
gráfico se trabe. Cualquier indicador nuevo en `lib/indicators/` tiene que
poder actualizar **solo su último punto** intra-vela.

---

## zustand: seleccionar el campo, nunca el objeto

```ts
// ✅ re-render solo cuando cambia ESE campo
const symbol = useChartStore((s) => s.symbol);
const vpvrActivo = useChartStore((s) => s.indicators.vpvr);

// ❌ re-render con cualquier cambio del store
const { symbol, indicators } = useChartStore();

// ❌ objeto nuevo en cada llamada: re-render infinito en zustand 5
const cfg = useChartStore((s) => ({ a: s.a, b: s.b }));
```

Si de verdad necesitás varios campos juntos, hacé varias llamadas al selector.
Es más barato que un `useShallow` y no puede equivocarse.

**Estado indexado por id.** `modelos-store` guarda
`estados: Record<string, EstadoModeloIA>` justo para que un tick de PPO no
re-renderice el panel de SAC. Está verificado por test
(`__tests__/aislamiento.test.ts`: el estado del otro modelo conserva la misma
referencia). Si agregás estado por modelo, indexalo igual.

**Un setter que no cambia nada tiene que devolver el mismo estado.**

```ts
quitarModelo: (id) =>
  set((s) => {
    if (!(id in s.estados) && !s.disponibles.includes(id)) return s;  // ← misma referencia
    …
  }),
```

Devolver un objeto nuevo pero equivalente re-renderiza a todos los suscriptores
igual. Da lo mismo en un setter que se llama con un clic; importa cuando lo
llama un barrido cada segundo o una lectura de red cada cinco.

**El guardia va en la frontera de entrada, no en una limpieza posterior.**

Aprendido a los golpes: retirar el modelo muerto con un barrido de 1 s mientras
el sondeo del archivo lo republicaba cada 5 s producía un bucle de
aparición/desaparición — y como `modelSignals` cambiaba en cada vuelta, los
gráficos se refetcheaban enteros. La solución no fue barrer más rápido sino
**no publicar** el estado muerto (`useFuente.onDatos`). Si dos mecanismos
periódicos pueden contradecirse sobre el mismo estado, el que decide es el que
está más cerca del dato.

**Qué persiste y qué no.** `chart-store` usa `persist` con `partialize`, y el
estado efímero (`modelSignals`, `posicionDemo`, `tradesPanelOpen`,
`ventanaMaximizada`) queda **fuera** a propósito: si se persistiera, el visor
arrancaría mostrando una operación que ya no existe. `modelos-store` no
persiste nada. Al agregar un campo, decidí explícitamente de qué lado va.

---

## Suscripciones a Binance: una sola conexión

`lib/binance/ws.ts` es un **singleton multiplexado**. Cada stream lleva un
`Set` de handlers: se manda `SUBSCRIBE` con el primer suscriptor y
`UNSUBSCRIBE` cuando se va el último. Diez ventanas del mismo par comparten una
conexión y un stream.

Reglas:

- Usá siempre `getBinanceWS()`. **Nunca** `new WebSocket()` en un componente.
- Toda suscripción devuelve su función de baja: devolvela desde el `useEffect`.
- Guardá el dato **junto a su símbolo** y descartalo si no coincide, en vez de
  resetear estado dentro del efecto:

  ```ts
  const [tick, setTick] = useState<{ simbolo: string; precio: number } | null>(null);
  const precio = tick && tick.simbolo === simbolo ? tick.precio : null;
  ```

  Así, al cambiar de par, el precio viejo deja de mostrarse solo — sin un
  render intermedio con el número del mercado equivocado.

---

## Layout: que el panel no tiemble

Un número que cambia de ancho empuja a sus vecinos y el panel entero vibra en
cada tick. Tres defensas ya aplicadas:

- **Ancho reservado.** `CeldaMetrica` usa `minWidth` fijo (`7rem` por defecto).
- **`tabular-nums`.** Todas las cifras en vivo lo llevan: los dígitos ocupan lo
  mismo, así `63,185.77` no es más ancho que `11,111.11`.
- **Signo siempre presente.** `formatPrecioEstable()` fija
  `minimumFractionDigits === maximumFractionDigits`, y `+`/`−` se muestran
  incluso en el cero. `formatPrice()` **no** sirve para paneles en vivo: usa
  solo `maximumFractionDigits` y el texto cambia de ancho.

Y del lado del shell: `app/page.tsx` es un **grid**, no un flex, y **ninguna
medida va en `vh`** (`vh` mide la ventana del navegador, que puede ser más alta
que el área visible). Las razones están comentadas en el archivo; no las
deshagas sin leerlas.

---

## React 19.2: qué usar acá y qué no

Disponible en esta versión y **útil** para este proyecto:

| API | Para qué acá |
|---|---|
| `useEffectEvent` | leer valor fresco en un handler sin meterlo en las deps de un efecto: **reemplaza el patrón de ref espejo** en casos nuevos y evita resuscribir streams |
| `useSyncExternalStore` | envolver una fuente externa (el WS singleton) sin `useState`; es lo que zustand usa por dentro |
| `useDeferredValue` | despriorizar un recálculo caro (perfil de volumen, footprint) frente a la interacción |
| `<Activity>` | mantener montada una ventana oculta conservando su estado, en vez de desmontarla y pagar el refetch |

Disponible pero **sin uso acá**: `useActionState`, `useOptimistic`,
`useFormStatus` (son para formularios y Server Actions; no hay ninguno),
`cacheSignal` (es de servidor).

`React.memo` **no es la primera herramienta**. Si un componente se re-renderiza
de más, casi siempre es un selector demasiado ancho o un dato que debería estar
en ref. Arreglá eso primero; `memo` sobre un componente que igual recibe props
nuevas en cada render solo agrega una comparación.

---

## Antes de dar algo por terminado

```bash
bun run verificar   # tsc --noEmit && eslint && bun test src
```

Si tocaste el dominio (`lib/modelos/`, `lib/trades.ts`, `lib/indicators/`),
agregá el test: son funciones puras, sin React ni DOM, y los 130 tests corren
en menos de 100 ms. La regla de dependencias está en `docs/ARQUITECTURA.md`:
**siempre hacia abajo** — el dominio no importa componentes ni stores.

Para medir de verdad antes de optimizar:

- **React DevTools → Profiler**, con «Highlight updates» prendido: si una
  ventana parpadea en cada tick, sobra un `useState`.
- **Performance del navegador**, grabando 10 s con el mercado activo: buscá
  tareas largas dentro de handlers de WebSocket.
- No optimices por intuición. Este archivo existe porque cada regla salió de un
  problema real, no de una guía genérica.
