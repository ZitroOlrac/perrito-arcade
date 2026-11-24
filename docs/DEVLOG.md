# Devlog

Lo que me fui encontrando mientras lo hacía.

---

### El servidor se caía al conectar Socket.IO

**Síntoma:** al abrir la web, el servidor petaba con `ERR_HTTP_HEADERS_SENT` dentro de engine.io.

**Causa:** creaba el servidor HTTP vacío, montaba Socket.IO encima y luego enganchaba Express con `server.on('request', app)`. Resulta que así Express también recibía las peticiones de `/socket.io/...`, contestaba con un 404 y luego Socket.IO intentaba contestar a la misma petición.

**Arreglo:** `http.createServer(app)` y Socket.IO después, que es como Socket.IO sabe quitar sus rutas antes de que lleguen a Express. Como las rutas necesitan los eventos de Socket.IO y Socket.IO necesita el servidor ya creado, le paso a la app un objeto que delega en los eventos reales cuando ya existen (ver `server/src/index.ts`).

---

### Las cajas "flotaban" y te mataban sin tocarlas

**Síntoma:** jugando, a veces morías saltando por encima de una caja o un cono sin llegar a tocarlo.

**Cómo lo encontré:** hice un bot que salta solo leyendo las posiciones de los obstáculos (en desarrollo el juego queda en `window.__perritoGame`) y al morir imprimía las cajas de colisión. El cuerpo físico de los obstáculos estaba unos 20-26 px más arriba que el dibujo. Justo media altura de cada sprite.

**Causa:** creaba el obstáculo y luego le cambiaba el `origin` a (0.5, 1) para apoyarlo en el suelo. Arcade Physics interpreta ese cambio como que el sprite se ha movido media altura y en el primer frame lo "corrige", subiéndolo.

**Arreglo:** después de configurar el obstáculo, `body.reset(x, y)`. Con el arreglo el bot aguanta más de dos minutos a velocidad máxima, así que el juego se puede pasar.

---

### Partidas legales rechazadas por "demasiados huesos"

**Síntoma:** una partida buena de 70 segundos salió rechazada.

**Causa:** puse un límite de 3 huesos por segundo a ojo. Haciendo la cuenta: a velocidad máxima (750 px/s) salen filas de 3-5 huesos cada ~700 px y además arcos de 5 huesos sobre un tercio de los obstáculos. Eso da hasta unos 5 por segundo.

**Arreglo:** migración `002_more_bones.sql` que lo sube a 6. Lección: los límites del anti-trampas hay que sacarlos de los números del juego, no a ojo.

---

### Saltos que "no entraban"

Al principio el salto solo funcionaba si el perro estaba tocando el suelo en ese frame exacto. Se notaba injusto: pulsabas justo antes de aterrizar y no saltaba. Añadí:

- **jump buffer** (120 ms): si pulsas un poco antes de tocar el suelo, el salto se guarda y sale al aterrizar,
- **coyote time** (90 ms): margen para saltar justo después de dejar de tocar el suelo,
- **salto variable**: si sueltas pronto, la velocidad de subida se corta a -320, así puedes hacer saltos cortos.

Y las cajas de colisión del perro y de los obstáculos son algo más pequeñas que el dibujo. Que te mate algo que visualmente no has tocado es lo que más frustra en un runner.

---

### Avisos del linter de React

`oxlint` se quejaba de `setState` dentro de efectos. El caso más interesante era el parpadeo de las filas del ranking cuando cambian: lo hacía comparando con el estado anterior y un `setTimeout`. Lo cambié por algo mucho más simple: la `key` de cada fila incluye la puntuación, así que cuando alguien mejora React monta la fila de nuevo y la animación CSS sale sola.

---

# Fase 2: Duelo de Llaves

### Los tornillos ganados a veces "caducaban"

**Síntoma:** a veces te llevabas un tornillo y en vez de salir volando hacia tu marcador, desaparecía como si hubiese caducado.

**Causa:** pasaba el estado del servidor a Phaser a través del estado de React. Llegan estados cada 50 ms y React agrupa las actualizaciones: si dos estados caían en el mismo render, el primero no llegaba a Phaser y con él se perdía el evento "toby se ha llevado el tornillo 12".

**Arreglo:** el componente del tablero escucha el socket directamente y le pasa cada estado a Phaser tal cual llega. React sigue usando el estado solo para el marcador y el tiempo, donde da igual saltarse uno.

### La página se quedaba colgada al entrar por un enlace de invitación

**Síntoma:** al abrir `/duelo?sala=ABCDE`, consola llena de "Maximum update depth exceeded".

**Causa:** el hook `useDuel` devolvía las acciones en un objeto nuevo en cada render. El efecto que une a la sala dependía de ese objeto: se ejecutaba, cambiaba el estado, se volvía a renderizar, objeto nuevo, efecto otra vez...

**Arreglo:** `useMemo` para que el objeto de acciones sea siempre el mismo, y una ref para no intentar unirse dos veces a la misma sala.

### Tornillos que se pisaban

La distancia mínima entre tornillos la medía con las coordenadas de 0 a 1, pero el tablero es el doble de ancho que de alto. En vertical, 0.16 eran menos píxeles que el propio tornillo. Ahora la distancia se corrige por la proporción del tablero (`boltDistance`) y hay un test que juega 20 segundos comprobando que nunca se pisan.

### No dejaba buscar otra partida al acabar

Después de una partida el servidor guarda la partida 30 segundos por si alguien pide la revancha. Mientras tanto, "Buscar otro rival" contestaba "Ya estás en una partida". Ahora, si tu partida ya terminó, buscar otra te saca de ella (y al rival le sale que te has ido).

Relacionado: al volver a la web un rato después te devolvía a la pantalla de resultado de una partida vieja. Ahora solo te devuelve a partidas que siguen en marcha.

### Tests que fallaban según el orden

Los tests del multijugador vacían la base de datos entre test y test, y los ids de usuario vuelven a empezar en 1. Pero las partidas viven en memoria, así que el "usuario 1" del test siguiente seguía en la partida del anterior. Añadí un `reset()` al servidor de duelos que solo usan los tests.

### Probarlo de verdad

Además de los tests, lo probé con dos navegadores a la vez (Playwright con dos contextos, cada uno con su usuario) haciendo clics de ratón reales sobre el canvas: partida completa, revancha, cerrar una pestaña a mitad de partida, recargar la página, entrar por enlace de invitación desde un móvil y jugar con toques.

---

# Fase 3: tienda, monedero y logros

### El perrito salía con la skin clásica al recargar la página

**Síntoma:** comprabas una skin, recargabas la página del juego y el perrito volvía a ser marrón.

**Causa:** el juego se crea una sola vez al montar el componente. Al recargar, la sesión todavía se estaba comprobando (`/api/auth/me`), así que en ese momento no había usuario y el juego se creaba con la paleta por defecto.

**Arreglo:** no crear el juego hasta saber quién es el jugador, y usar la skin como `key` del componente para que, si cambia, el juego se cree de nuevo.

### Los logros de jugadores antiguos

Los jugadores que ya existían tenían partidas de antes de que hubiera logros. No quise darles los logros en la migración (habría que duplicar las condiciones en SQL), así que se les dan la primera vez que juegan o compran algo: como se recalculan con sus datos, les saltan todos los que ya cumplían de golpe. Queda bastante bien, la verdad.

### Un test e2e del duelo que fallaba a veces

El test tocaba el primer tornillo nada más aparecer y a veces el servidor lo rechazaba con `TOO_FAST`: el anti-trampas no acepta toques a menos de 100 ms de que salga el tornillo, y el test era más rápido que cualquier persona. No era un fallo del juego, era el test. Ahora espera 250 ms y reintenta con el tornillo al que más vida le queda. Lo pasé varias veces seguidas para comprobar que es estable.

### Números en español

Un test esperaba "Faltan 1.800" y la web ponía "Faltan 1800". Resulta que `Intl.NumberFormat('es-ES')` no pone el punto en los números de 4 cifras, que es lo que dice la RAE. Lo correcto era el test.

---

# Demo jugable en GitHub Pages

Quería que se pudiera jugar desde mi portafolio sin montar un servidor. Como el motor del duelo no depende de nada de Node (lo hice así para poder testearlo), el cliente lo importa tal cual desde `server/src/duel` y lo ejecuta en el navegador con el bot. El tablero del duelo (`DuelBoard`) ahora recibe de dónde vienen los estados: del socket en la web completa o del duelo local en la demo.

Para poder importarlo tuve que quitar los `private` en los parámetros del constructor del motor y del bot: el tsconfig del cliente tiene `erasableSyntaxOnly` y no los acepta.

### La barra de progreso del duelo había desaparecido

Probando la demo vi que tu barra de puntos no salía. La causa era una regla `.me { display: inline-flex }` que añadí en la fase 3 para el nombre de la cabecera: el marcador del duelo también tiene la clase `me` y dejaba de ser un grid. Llevaba roto desde entonces también en la web completa. Lo arreglé limitando la regla a `.session .me`. Me lo apunto: clases genéricas como `me` o `active` siempre con un selector más concreto.
