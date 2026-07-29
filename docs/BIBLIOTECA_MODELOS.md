# Biblioteca común de modelos de IA

> Referencia de los componentes compartidos que **todos** los modelos
> reutilizan. Un modelo nuevo no escribe infraestructura: importa de acá.
>
> Si venís a integrar un motor y querés el paso a paso, empezá por
> [INTEGRAR_MODELO.md](INTEGRAR_MODELO.md). Si querés el formato JSON campo por
> campo, [CONTRATO_MODELOS.md](CONTRATO_MODELOS.md). Este documento es el
> **catálogo de piezas**: qué hay, de qué se ocupa cada una y cuándo usarla.

---

## 1. La idea en una frase

```
tu motor (JSON) → transporte → adaptador → EstadoModeloIA → barra · gráfico · Probador
                  cómo viajan   traduce    contrato único    lo que ya funciona
                   los bytes    tu formato
```

Un modelo aporta **dos cosas**: el JSON que publica y una entrada en el
catálogo. Todo lo demás —conexión, reintentos, saneamiento, PnL, win rate,
dibujo sobre el gráfico, panel de métricas— ya está escrito y es común.

---

## 2. El único import que necesitás

```ts
import {
  adaptarContratoEstandar,
  type FuenteModelo,
} from "@/lib/modelos/nucleo";
```

`src/lib/modelos/nucleo/index.ts` es la **API pública**. Lo que no está
re-exportado ahí es interno y puede cambiar sin aviso.

> **No importes archivos sueltos del núcleo** (`nucleo/derivar`,
> `nucleo/adaptadores`…) desde un catálogo de modelo. Si el núcleo se
> reorganiza, quien importa del índice no se entera; quien importa archivos
> sueltos se rompe. (Adentro del propio núcleo sí se usan rutas relativas: un
> índice que se importa a sí mismo es un ciclo.)

---

## 3. Mapa del árbol

```
src/lib/modelos/
├── nucleo/                    ⭐ LA BIBLIOTECA — común a todos los modelos
│   ├── index.ts                   API pública (el único import)
│   ├── tipos.ts                   contrato canónico EstadoModeloIA
│   ├── senales.ts                 vocabulario de eventos + saneamiento
│   ├── adaptadores.ts             traductores de formato → contrato
│   ├── derivar.ts                 PnL, R/R, señal, salud, duración
│   ├── useModelosIA.ts            cableado transporte + adaptador + store
│   ├── usePrecioMercado.ts        precio de mercado compartido
│   └── transportes/               archivo (sondeo) · websocket (push)
│
├── catalogo/                  ⭐ UN DIRECTORIO POR MODELO
│   ├── index.ts                   array MODELOS_INTEGRADOS
│   ├── sac/  sac.fuente.ts · sac.README.md · __tests__/
│   └── ppo/  ppo.fuente.ts · ppo.feed.ts · ppo.README.md · __tests__/
│
└── registro.ts                catálogo + modelos declarados por entorno
```

Y fuera de `modelos/`, dos piezas comunes que la biblioteca **re-exporta** para
que las tengas en el mismo import:

| Pieza | Dónde vive | Por qué no está dentro de `nucleo/` |
|---|---|---|
| Métricas (`buildOperaciones`, `computeResumenTV`) | `lib/trades.ts` | Las comparte el `senales.json` de backtest, que no es un modelo en vivo |
| Dibujo de la posición (`pintarPosicion`) | `lib/chart/pintarPosicion.ts` | Es dibujo puro en canvas, junto al resto de las capas del gráfico |

---

## 4. Qué ofrece cada pieza

### 4.1 Contrato — `tipos.ts`

El formato único que entiende toda la interfaz.

| Export | Para qué |
|---|---|
| `EstadoModeloIA` | El estado normalizado de un motor. **Todo** lo consume esto. |
| `FuenteModelo` | Tu entrada en el catálogo: id, etiqueta, color, transporte, url, adaptador, cadencia. |
| `VistaOperacion` | Las 17 lecturas de la operación en curso (derivadas, nadie las guarda). |
| `SaludMotor` | `operando · arrancando · atrasado · detenido · error`. |
| `SenalOperativa` | `COMPRAR · VENDER · MANTENER · CERRAR`. |
| `CONTRATO_ACTUAL` | Versión del contrato: hoy `1`. |
| `MS_SONDEO_POR_DEFECTO` · `MS_FRESCO_POR_DEFECTO` | 5 s y 6 min. Cada fuente puede declarar los suyos. |

### 4.2 Señales — `senales.ts`

Vocabulario cerrado (`abrir_long`, `abrir_short`, `cerrar_long`,
`cerrar_short`) y su saneamiento.

`sanearSenales()` es la **frontera de confianza**: descarta una por una las
señales inválidas —un `tiempoMs` que no es número, un evento mal escrito, un
`null` en la lista— y conserva el resto. Todo lo que venga de un motor pasa por
acá; sin eso, un precio en cero llegaba al gráfico y le arruinaba la escala.

### 4.3 Adaptadores — `adaptadores.ts`

La **única** capa que conoce formatos concretos.

| Adaptador | Cuándo |
|---|---|
| `adaptarContratoEstandar` | Tu motor publica el contrato v1 en un archivo. Cada lectura trae el estado completo. |
| `adaptarFeedWebSocket` | Tu motor empuja por WebSocket. Los `eventos` son incrementales y el adaptador los **acumula** sobre el estado previo. |

**Si publicás el contrato v1, no escribas un adaptador.** Uno propio solo hace
falta si tu motor tiene un formato heredado que no podés cambiar; en ese caso
que sea lo único que lo conozca.

Tolerancia incluida: campos ausentes → `null`, tipos equivocados → `null`,
contrato v0 (legado) sigue funcionando, y una excepción del adaptador pierde
ese tick sin tumbar la interfaz.

### 4.4 Transportes — `transportes/`

Traen bytes y reintentan. **No interpretan nada.**

| Transporte | Cómo | Reintentos |
|---|---|---|
| `archivo` | Sondea un JSON de `public/` cada `msSondeo` | Reintenta al siguiente sondeo; 404 tras haber respondido → se retira el modelo |
| `websocket` | El motor empuja mensajes | Backoff exponencial 1 s → 10 s, indefinido; al cortarse avisa y el modelo se retira |

`urlsRespaldo` permite declarar nombres de archivo anteriores: el visor prueba
el nuevo y cae al viejo si no está, así actualizar el visor y actualizar el
motor no tienen que pasar al mismo tiempo.

**Para agregar un transporte** (SSE, long-poll…): un archivo en `transportes/`
que cumpla `Conector` y una línea en su índice. Ninguna fuente ni componente
cambia.

### 4.5 Lecturas derivadas — `derivar.ts`

> **El motor publica HECHOS. La interfaz calcula LECTURAS.**

| Publicá esto | Obtenés gratis |
|---|---|
| `precioEntrada`, `nocional`, `precio` | PnL flotante en USD y en % |
| `stopLoss`, `takeProfit` | Riesgo/recompensa y distancia a cada barrera |
| `accion`, `zonaMuerta` | Señal operativa y % de confianza |
| `aperturaMs` | Cronómetro y hora de apertura |
| `actualizadoMs` | Semáforo EN VIVO / ATRASADO / DETENIDO |
| `senales[]` | Win rate, profit factor, drawdown, curva de equity |

**No mandes lecturas.** Si mandaras el PnL habría dos fuentes para el mismo
número y tarde o temprano se contradicen.

Funciones clave:

- `vistaOperacion(estado, precioMercado, ahora)` — las 17 métricas de la
  operación en curso.
- `pnlFlotante(lado, entrada, actual, nocional)` — **la única fórmula de PnL
  del proyecto**. La usan la barra, el Probador y el dibujo del gráfico; por eso
  no pueden dar números distintos.
- `posicionParaGrafico(estado)` — qué dibujar sobre las velas, o `null` si está
  plano.
- `saludMotor(estado, ahora, msFresco)` — se juzga por la **antigüedad del
  estado**, no por el campo `estado`: si el proceso muere, su JSON queda
  congelado diciendo `"operando"` y solo el reloj lo delata.
- `motorSinVida(estado, ahora, msFresco)` — pasado el doble de `msFresco`, el
  motor se retira de la interfaz junto con sus operaciones.

### 4.6 Métricas — `lib/trades.ts` (re-exportadas)

- `buildOperaciones(senales)` — empareja cada `abrir_*` con el `cerrar_*`
  siguiente. La apertura sin pareja se descarta: **es la operación viva**.
- `computeResumenTV(ops)` — métricas por lado (todas / largas / cortas).
- `sharpePorOperacion(ops)` — resultado **ajustado por riesgo**, sobre el PnL
  porcentual. Es la métrica que hace comparables dos motores con capitales
  distintos: sin ella, la comparación se reduce al beneficio neto y premia al
  más temerario. `null` con menos de dos operaciones.
- `formatDuracion(ms)` · `etiquetaMotivo(motivo)` — formateo compartido.

> **Solo cuentan los cierres.** Un modelo recién arrancado —posición abierta,
> ningún cierre— muestra la franja de la operación en curso y las métricas en
> «—». No es un error del panel: el resultado de la abierta todavía no existe.

### 4.7 Precio de mercado — `usePrecioMercado.ts`

Fuente única del "precio actual", sobre el WebSocket singleton de Binance.

| Hook | Cuándo |
|---|---|
| `usePrecioMercado(simbolo)` | El número se **muestra** (barra, Probador): re-renderiza en cada tick. |
| `usePrecioMercadoRef(simbolo)` | El número se **dibuja** (canvas): va a una ref y no re-renderiza. |

Antes cada panel usaba su propio precio y el mismo PnL salía distinto en cada
lugar. Si sumás un consumidor, usá uno de estos dos.


---

## 4.8 Visibilidad multi-modelo — `visibilidad.ts`

Con **dos o más motores operando a la vez**, el gráfico se vuelve ilegible si
todos dibujan todo: dos juegos de flechas, dos cajas de posición, cuatro
barreras. Este módulo define qué capas dibuja cada modelo.

```ts
interface VisibilidadModelo {
  visible: boolean;    // maestro: apaga TODO lo del modelo, conservando las capas
  aperturas: boolean;  // flechas de entrada (L / S)
  cierres: boolean;    // flechas de salida (TP / SL / LIQ / C)
  posicion: boolean;   // caja de la operación abierta
  barreras: boolean;   // stop loss y take profit
}
```

| Export | Para qué |
|---|---|
| `visibilidadDe(mapa, id)` | La visibilidad de un modelo con los defaults aplicados |
| `dibuja(mapa, id, capa)` | ¿Dibuja esta capa? Combina el maestro con la bandera |
| `aislar(mapa, ids, id)` | «Ver solo este». Repetirlo vuelve a mostrarlos todos |
| `alternarVisible` · `alternarCapa` | Los interruptores del panel |
| `CAPAS` | Catálogo de capas, en el orden del panel |

**Un modelo nuevo no toca nada de esto**: sin entrada en el mapa se dibuja
entero, que es lo que se espera al arrancar un motor. El estado vive en
`chart-store.visibilidadModelos` y **persiste** — es una preferencia de
visualización.

**Los colores salen del registro.** `FuenteModelo.color` es la identidad visual
del modelo: tiñe sus flechas, la cápsula de su caja de posición, su cuadrado en
el panel y su fila en la comparación. Un motor nuevo declara su color en la
fuente y aparece diferenciado en los cuatro lugares, sin tocar ningún
componente. Además, cada flecha lleva el prefijo del modelo (`SAC L`, `PPO SL`)
para que la distinción no dependa solo del color.

### Quién consume esto

| Consumidor | Qué hace |
|---|---|
| `components/modelos/PanelModelos` | Los interruptores. Se auto-oculta con menos de dos modelos |
| `components/chart/ChartLigero` | Filtra marcas y cajas de posición por capa antes de dibujar |
| `components/panel/StrategyTester` | Pestaña «Comparar modelos» |

---

## 5. Cómo se integra un modelo

Tres pasos, ninguno toca el núcleo.

**1. Publicá el contrato v1** desde tu motor
([CONTRATO_MODELOS.md](CONTRATO_MODELOS.md)).

**2. Creá `catalogo/<id>/<id>.fuente.ts`:**

```ts
import { adaptarContratoEstandar, type FuenteModelo } from "@/lib/modelos/nucleo";

export const FUENTE_DQN: FuenteModelo = {
  id: "dqn",                       // igual al `modeloId` que publica el motor
  etiqueta: "DQN",
  descripcion: "Deep Q-Network · acciones discretas",
  color: "#ffa726",
  transporte: "archivo",
  url: "/estado_dqn.json",
  adaptar: adaptarContratoEstandar,
  // msSondeo / msFresco solo si tu cadencia no es la de una vela de 5 m
};
```

**3. Sumala a `catalogo/index.ts`:**

```ts
export const MODELOS_INTEGRADOS: FuenteModelo[] = [FUENTE_SAC, FUENTE_PPO, FUENTE_DQN];
```

Listo: aparece en el selector, la barra muestra sus 17 métricas, el gráfico
dibuja su posición y sus señales, y el Probador calcula sus estadísticas.

**Sin tocar código** también se puede, con una variable de entorno:

```bash
NEXT_PUBLIC_MODELOS_EXTRA=[{"id":"dqn","etiqueta":"DQN","url":"/estado_dqn.json"}]
```

Agregá también `catalogo/<id>/<id>.README.md` explicando qué es el motor, dónde
vive y cómo se lanza — como hacen `sac.README.md` y `ppo.README.md`.

---

## 6. Buenas prácticas para extender sin romper

**Publicá hechos, no lecturas.** Si mandás el PnL calculado, tarde o temprano
va a contradecir al que muestra el panel.

**Ids únicos y estables.** El `id` de la fuente tiene que coincidir con el
`modeloId` que publica el motor. Dos fuentes con el mismo id se pisan en el
store.

**Un modelo nuevo no toca el núcleo.** Si te encontrás editando `nucleo/` para
integrar un motor, eso es una señal: o falta una capacidad genérica (y entonces
va al núcleo, con test, sirviendo a todos), o lo que hace falta es un adaptador
propio (y va en tu catálogo).

**Nunca un `if` por modelo en el núcleo ni en un componente.** `useModelosIA`
no tiene ninguno: busca el conector en el registro y usa el adaptador de la
fuente. Si necesitás una rama por modelo, expresala como un campo del contrato.

**Cadencia por fuente.** `msSondeo` y `msFresco` se declaran por modelo, no hay
constante global: un motor de barras horarias juzgado con la vara de uno de 5
minutos aparecería «detenido» el 95 % del tiempo.

**Escritura atómica** en el transporte de archivo: escribí en un `.tmp` y
`os.replace`. Si no, el visor puede leer un JSON a medio escribir.

**Estado efímero, nunca persistido.** `modelos-store` no persiste nada a
propósito: si lo hiciera, el visor arrancaría mostrando una operación que ya no
existe.

**Tests donde importa.** El dominio son funciones puras sin React ni DOM y los
tests corren en milisegundos. `catalogo/<id>/__tests__/` fija que tu fuente esté
bien dada de alta y que un fixture real de tu motor atraviese la cadena entera.

**No rompas hacia atrás.** Subir la versión del contrato nunca puede romper un
motor viejo: los campos nuevos son siempre opcionales y con default.

---

## 7. Aislamiento: por qué un modelo no puede romper a otro

| Mecanismo | Consecuencia |
|---|---|
| Una suscripción por fuente, en su propio componente | Un motor caído no afecta a los demás |
| `try/catch` alrededor del adaptador | Un adaptador con un bug pierde un tick, no tumba la app |
| `sanearSenales()` en la frontera | Un dato inválido se descarta, no se propaga |
| Estado indexado por id de modelo | Un tick de PPO no re-renderiza el panel de SAC |
| 404 o silencio prolongado → se retira el modelo | Un motor apagado sale del selector; los otros siguen |
| Estadísticas solo del modelo activo | Métricas con significado |

Verificado por test en `nucleo/__tests__/aislamiento.test.ts`.

---

## Documentos relacionados

- [CONTRATO_MODELOS.md](CONTRATO_MODELOS.md) — el JSON, campo por campo
- [INTEGRAR_MODELO.md](INTEGRAR_MODELO.md) — guía paso a paso con código
- [ARQUITECTURA.md](ARQUITECTURA.md) — capas, dependencias y flujo de datos
- [contrato/estado_vivo.schema.json](contrato/estado_vivo.schema.json) — JSON Schema validable
