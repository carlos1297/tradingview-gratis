# Arquitectura de TradingView-clon

> Cómo está organizado el visor, quién depende de quién y por dónde circulan los
> datos. Si venís a **integrar un modelo**, lo que necesitás está en
> [CONTRATO_MODELOS.md](CONTRATO_MODELOS.md) (el formato) y en
> [INTEGRAR_MODELO.md](INTEGRAR_MODELO.md) (el paso a paso); no hace falta leer
> este documento ni el código fuente.

---

## 1. Qué es este proyecto

Un visor de gráficos de criptomonedas (velas en vivo de Binance, indicadores,
multi-ventana) que además **monitorea en tiempo real varios modelos de IA
operando a la vez**. Cada modelo corre en su propio proyecto, como un proceso
independiente; el visor solo los observa.

La restricción que manda sobre todo el diseño:

> **Agregar un modelo nuevo no puede requerir tocar el núcleo de la aplicación
> ni afectar a los modelos que ya funcionan.**

---

## 2. Las cuatro capas

```
┌────────────────────────────────────────────────────────────────────┐
│  MOTORES  (procesos externos, fuera de este repo)                  │
│  modelo_SAC/operar_vivo.py · modelo_PPO/main.py · el que venga     │
└──────────────────────────┬─────────────────────────────────────────┘
                           │  JSON (contrato v1)
┌──────────────────────────▼─────────────────────────────────────────┐
│  TRANSPORTE   lib/modelos/transportes/                             │
│  Cómo viajan los bytes. NO interpreta nada.                        │
│  archivo.ts (sondeo)   websocket.ts (push + reconexión)            │
└──────────────────────────┬─────────────────────────────────────────┘
                           │  `unknown` crudo
┌──────────────────────────▼─────────────────────────────────────────┐
│  ADAPTACIÓN   lib/modelos/adaptadores.ts                           │
│  Traduce el formato de CADA motor al contrato canónico.            │
│  Es la única pieza que conoce formatos concretos.                  │
└──────────────────────────┬─────────────────────────────────────────┘
                           │  EstadoModeloIA (normalizado)
┌──────────────────────────▼─────────────────────────────────────────┐
│  DOMINIO      lib/modelos/tipos.ts · derivar.ts · lib/trades.ts    │
│  Contrato + cálculos puros (PnL, R/R, señal, estadísticas).        │
│  Sin React, sin stores, sin DOM.                                   │
└──────────────────────────┬─────────────────────────────────────────┘
                           │  EstadoModeloIA + VistaOperacion
┌──────────────────────────▼─────────────────────────────────────────┐
│  PRESENTACIÓN  components/modelos/ · chart/ · panel/               │
│  Barra de modelos · marcas y posición en el gráfico · Probador     │
│  NINGÚN componente sabe qué modelo está mostrando.                 │
└────────────────────────────────────────────────────────────────────┘
```

**Regla de dependencias: siempre hacia abajo.** El dominio no importa
componentes ni stores; los componentes no hablan con transportes. La única
excepción es el núcleo (`useModelosIA.ts`), que por definición cablea las capas.

---

## 3. Estructura de directorios

```
src/
├── app/
│   ├── layout.tsx              Raíz HTML, fuentes, TooltipProvider
│   ├── page.tsx                Shell en grid + modo inmersivo
│   └── globals.css             Paleta TradingView
│
├── components/
│   ├── modelos/                ⭐ capa multi-modelo (presentación)
│   │   ├── ProveedorModelosIA.tsx   Monta las suscripciones. No dibuja nada.
│   │   ├── BarraModelosIA.tsx       Barra de métricas en vivo (ancho completo)
│   │   ├── SelectorModelo.tsx       Pestañas para alternar de modelo
│   │   └── CeldaMetrica.tsx         Celda reutilizable (ancho fijo, sin temblor)
│   ├── chart/
│   │   ├── ChartLigero.tsx          Una ventana: velas, capas, marcas, posición
│   │   ├── VentanasTimeframes.tsx   Mosaico de ventanas
│   │   ├── VentanaFrame.tsx         Marco y controles de una ventana
│   │   ├── ModelSignals.tsx         Carga manual/automática de senales.json
│   │   ├── IndicatorMenu.tsx        Diálogo del registro de indicadores
│   │   ├── SymbolSelector.tsx       Buscador de pares
│   │   └── *Config.tsx              Ajustes de heatmap / VPVR / footprint
│   ├── layout/                      Header, BottomPanel, RightSidebar
│   ├── panel/StrategyTester.tsx     Probador de estrategias
│   ├── watchlist/Watchlist.tsx      Precios multi-símbolo
│   └── ui/                          Primitivas (shadcn)
│
└── lib/
    ├── modelos/                ⭐ capa multi-modelo (dominio)
    │   ├── senales.ts               Vocabulario de eventos + saneamiento
    │   ├── tipos.ts                 CONTRATO CANÓNICO (EstadoModeloIA)
    │   ├── adaptadores.ts           Traductores por formato de motor
    │   ├── registro.ts              Catálogo de modelos (código + entorno)
    │   ├── derivar.ts               PnL, R/R, señal, salud, duración
    │   ├── useModelosIA.ts          NÚCLEO: transporte + adaptador + store
    │   ├── transportes/
    │   │   ├── tipos.ts             Interfaz `Conector`
    │   │   ├── archivo.ts           Sondeo de un JSON en public/
    │   │   ├── websocket.ts         Push con reconexión y backoff
    │   │   └── index.ts             Registro de transportes
    │   └── __tests__/               86 tests del contrato
    ├── store/
    │   ├── chart-store.ts           Config del gráfico (persiste)
    │   └── modelos-store.ts         Estado en vivo por modelo (efímero)
    ├── binance/                     REST + WebSocket multiplexado
    ├── indicators/                  Cálculos puros + registro de indicadores
    ├── chart/pintarPosicion.ts      Dibujo de la operación abierta
    ├── trades.ts                    Reconstrucción de trades + métricas
    ├── liveFeed.ts                  Envoltorio compatible sobre el transporte WS
    └── format.ts                    Formateo de precios, % y volumen
```

---

## 4. Responsabilidad de cada módulo de `lib/modelos/`

| Módulo | Responsabilidad | Qué NO hace |
|---|---|---|
| `senales.ts` | Vocabulario de eventos (`abrir_long`…) y saneamiento de listas crudas | No calcula PnL |
| `tipos.ts` | Define `EstadoModeloIA`, `VistaOperacion`, `FuenteModelo` y los defaults de cadencia | No tiene lógica |
| `transportes/` | Traer bytes y reintentar | No interpreta el JSON |
| `adaptadores.ts` | Traducir el formato de un motor al contrato; tolerar versiones viejas | No calcula lecturas |
| `registro.ts` | Catálogo de fuentes: código + `NEXT_PUBLIC_MODELOS_EXTRA` | No conecta nada |
| `derivar.ts` | Calcular PnL, R/R, señal, salud, duración, posición dibujable | No guarda estado |
| `useModelosIA.ts` | Cablear transporte + adaptador + store, aislando fallos | No conoce modelos concretos |

### La regla de oro

> **El motor publica HECHOS. La interfaz calcula LECTURAS.**

| Publica el motor (hechos) | Calcula el visor (lecturas) |
|---|---|
| `precioEntrada`, `nocional`, `stopLoss`, `takeProfit` | PnL flotante en USD y % |
| `saldo`, `equity`, `capitalInicial` | Riesgo/recompensa vigente |
| `accion`, `zonaMuerta` | Señal `COMPRAR/VENDER/MANTENER/CERRAR` |
| `aperturaMs` | Duración de la operación |
| `actualizadoMs` | Salud del motor (`EN VIVO`/`ATRASADO`/`DETENIDO`) |
| `senales[]` | Win rate, profit factor, drawdown, curva de equity |

Por eso la barra, el gráfico y el Probador **no pueden contradecirse**: los tres
derivan del mismo `EstadoModeloIA` con las mismas funciones puras. Está
verificado por test (`derivar.test.ts` → "coherencia entre paneles").

Y por eso un modelo nuevo obtiene todo el panel gratis: le alcanza con publicar
los hechos.

---

## 5. Flujo de datos completo

### 5.1 Del motor a la pantalla

```
 1. El motor decide y escribe su estado
        modelo_SAC/operar_vivo.py → public/estado_vivo.json  (escritura atómica)

 2. El transporte lo trae
        transportes/archivo.ts → fetch cada `msSondeo` (5 s por defecto)

 3. El adaptador lo normaliza
        adaptadores.adaptarContratoEstandar(crudo, fuente, previo)
        → EstadoModeloIA con `null` explícito donde el motor no publica

 4. El núcleo lo publica
        useFuente() → modelos-store.publicarEstado("sac", estado)

 5. Los componentes se suscriben POR MODELO
        BarraModelosIA   → vistaOperacion()      → 17 métricas
        ChartLigero      → posicionParaGrafico() → entrada, SL, TP, PnL flotante
        StrategyTester   → buildOperaciones()    → win rate, profit factor…
```

### 5.2 Las señales al Probador de estrategias

`useSincronizarSenales()` copia las señales del modelo **activo** a
`chart-store.modelSignals`, que es de donde leen el Probador y las marcas del
gráfico. Ahí confluyen los tres orígenes posibles:

| Origen | Cómo llega | ¿Abre el panel? |
|---|---|---|
| `senales.json` cargado a mano | `setModelSignals(f)` | Sí — lo acabás de pedir |
| `senales.json` autocargado de `public/` | igual, al montar | Sí, **salvo** que ya haya un modelo en vivo |
| Modelo en vivo del registro | `setModelSignals(f, { abrirPanel: false })` | No — respeta si lo cerraste |

Dos reglas de negocio:

1. **Solo manda el modelo activo.** Mezclar operaciones de dos motores daría un
   win rate y un profit factor sin significado.
2. **La operación abierta no entra en las estadísticas.** Se muestra aparte, en
   una franja propia: su resultado todavía no existe.

### 5.3 Precio de mercado

La barra se suscribe al `miniTicker` de Binance para refrescar el PnL flotante
entre decisiones del modelo (que decide una vez cada 5 minutos). Reutiliza el
**WebSocket singleton** de `lib/binance/ws.ts`; no abre una conexión propia.

Si el motor declara `enVivo: false` (replay de datos históricos), el feed se
**ignora**: restarle el precio de BTC de hoy a una entrada de hace dos años daría
cientos de por ciento de PnL inexistente. La decisión está en `derivar.ts`, así
que todos los consumidores muestran el mismo número por construcción.

---

## 6. Los dos stores, y por qué son dos

| | `chart-store` | `modelos-store` |
|---|---|---|
| Qué guarda | Símbolo, ventanas, indicadores, watchlist | Estado en vivo de cada modelo |
| Persiste | Sí (localStorage, con migraciones) | **No** |
| Vida | Entre sesiones | Solo runtime |

Mezclarlos haría que se persistan posiciones viejas y que el visor arranque
mostrando una operación que ya no existe.

`modelos-store` indexa **por id de modelo**, así un tick de PPO no re-renderiza
el panel de SAC (verificado en `aislamiento.test.ts`: el estado del otro modelo
conserva la misma referencia).

---

## 7. Aislamiento entre modelos

| Mecanismo | Consecuencia |
|---|---|
| Una suscripción por fuente, en su propio componente | Un motor caído no afecta a los demás |
| `try/catch` alrededor del adaptador | Un adaptador con un bug pierde un tick, no tumba la app |
| `sanearSenales()` en la frontera | Un `tiempoMs` inválido se descarta, no se propaga como `NaN` |
| Estado indexado por id | Ni datos ni renders compartidos |
| 404 → `quitarModelo(id)` | Un motor apagado sale del selector; los otros siguen |
| Estadísticas solo del modelo activo | Métricas con significado |

---

## 8. Dónde vive la extensibilidad

Tres puntos de extensión, todos declarativos:

| Quiero agregar… | Toco… | Componentes afectados |
|---|---|---|
| Un **modelo** con contrato v1 | `NEXT_PUBLIC_MODELOS_EXTRA` (ni código) | ninguno |
| Un **modelo** con formato propio | un adaptador + una entrada en `registro.ts` | ninguno |
| Un **transporte** (SSE, long-poll…) | un archivo en `transportes/` + una línea en su `index.ts` | ninguno |
| Un **indicador** de gráfico | una entrada en `indicators/registro.ts` | ninguno |

El núcleo (`useModelosIA.ts`) **no tiene ningún `if` por modelo ni por
transporte**: busca el conector en el registro y usa el adaptador de la fuente.

---

## 9. Decisiones de diseño que conviene conocer

**El proveedor de datos va separado de la barra.**
`ProveedorModelosIA` no dibuja nada y se monta en la raíz de la página, también
en modo inmersivo. Antes el sondeo lo arrancaba `BarraModelosIA`: al entrar en
pantalla completa esa barra se desmonta, el sondeo moría y el gráfico seguía
dibujando la última posición conocida —con su PnL y sus barreras congeladas— sin
ninguna señal de que ya no era real.

**La salud se juzga por la antigüedad del estado, no por el campo `estado`.**
Si el proceso muere, su JSON queda congelado diciendo `"operando"`. Solo el
desfase contra `actualizadoMs` lo delata.

**El modelo no cambia el símbolo del gráfico.**
Hacerlo disparaba un refetch de velas en cada cambio de modelo y el gráfico
saltaba. Si el modelo activo opera otro par, la barra lo avisa y ofrece cambiar
con un clic; mientras tanto sus marcas y su posición se filtran por símbolo, así
que nunca se dibujan sobre el mercado equivocado.

**Las celdas de métrica tienen ancho reservado.**
En un panel en vivo, una celda dimensionada por su contenido se ensancha cuando
el precio pasa de `63,185` a `63,185.77` y empuja a todas las de la derecha: el
panel entero tiembla en cada tick. Con ancho fijo, `tabular-nums` y signo
siempre presente, el número cambia sin mover nada.

**El shell de la página es un grid, no un flex.**
Con flex, una fila que se niega a encoger empuja a las de abajo y —con
`overflow-hidden` en la raíz— lo que sobra se recorta sin scroll; la víctima era
la barra inferior, justo la que tiene el botón para reabrir el Probador. En grid
solo la fila central es elástica. Ninguna medida en `vh`: `vh` mide la ventana
del navegador, que puede ser más alta que el área visible.

---

## 10. Verificación

```bash
bun run verificar     # tsc --noEmit && eslint && bun test src
bun test src          # solo los tests (86, ~30 ms)
bun run build         # build de producción
```

Los tests viven en `src/lib/modelos/__tests__/` y cubren la parte del sistema
que un modelo nuevo puede romper:

| Archivo | Qué fija |
|---|---|
| `senales.test.ts` | El saneamiento descarta basura y conserva el orden |
| `adaptadores.test.ts` | v1, legado v0, campos ausentes, entradas corruptas, acumulación por WS |
| `derivar.test.ts` | PnL long/short, replay vs vivo, barreras, cronómetro, salud, coherencia entre paneles |
| `registro.test.ts` | Alta por entorno, JSON roto, ids duplicados, defaults |
| `aislamiento.test.ts` | Dos modelos conviven sin tocarse; caída y traspaso del foco |

---

## Documentos relacionados

- [CONTRATO_MODELOS.md](CONTRATO_MODELOS.md) — el formato JSON, campo por campo
- [INTEGRAR_MODELO.md](INTEGRAR_MODELO.md) — guía paso a paso, con código
- [contrato/estado_vivo.schema.json](contrato/estado_vivo.schema.json) — JSON Schema validable
