# Decisiones

Notas sobre por qué está hecho así y no de otra manera.

## Phaser y no Unity/Godot exportado a web

Quería que el juego viviera dentro de la web, no en un iframe aparte. Con Phaser el juego es un módulo más de React: se carga con `import()` solo cuando entras a jugar (pesa ~1 MB) y se comunica con la página por eventos (`run:start`, `run:end`, `run:restart`). Una exportación WebGL de Unity pesaría bastante más y la comunicación con React sería más incómoda.

## Gráficos dibujados por código

Los sprites del perrito están en `client/src/game/sprites.ts` como texto, un carácter por píxel. Al arrancar se pintan en canvas y se registran como texturas. Ventajas:

- no hay que cargar imágenes,
- retocar al perrito es cambiar una letra,
- el mismo dibujo sirve para el logo de la web (`DogLogo.tsx` lo pinta en SVG) y para el favicon.

El resto (neumáticos, cajas, lámpara, pared...) se dibuja con la API de canvas en `textures.ts`.

## La puntuación la calcula el servidor

El cliente nunca manda "he hecho 1500 puntos". Manda metros, huesos y duración, y el servidor:

1. comprueba que la partida es suya y sigue abierta (con `SELECT ... FOR UPDATE` para que dos peticiones a la vez no la cierren dos veces),
2. compara la duración que dice el cliente con el tiempo real desde que se abrió la sesión,
3. comprueba que los metros y los huesos son posibles en ese tiempo (límites por juego en la tabla `games`),
4. calcula los puntos él mismo.

No es infalible: alguien que entienda el sistema puede mandar datos "creíbles". La solución completa sería grabar las pulsaciones y re-simular la partida en el servidor (está en los próximos pasos). Para un proyecto así, esto ya corta lo más típico y el panel de admin enseña lo que se rechaza.

## SQL a mano en vez de un ORM

La consulta del ranking usa `DISTINCT ON` para quedarse con la mejor partida de cada jugador, y la del panel usa `generate_series` para rellenar los días sin partidas. Con un ORM habría acabado escribiendo SQL igual. Las migraciones son ficheros `.sql` numerados y un script de 40 líneas que lleva la cuenta en `schema_migrations`.

## Tests contra PostgreSQL real

Los tests de integración usan una base de datos de verdad que se vacía antes de cada test. Es un poco más lento que mockear, pero los mocks no habrían pillado cosas como la condición de carrera al cerrar una partida.

## Socket.IO separado de las rutas

Las rutas no conocen Socket.IO: reciben un objeto `GameEvents` con dos métodos. En producción ese objeto emite por websocket; en los tests guarda lo que se emitió en un array para poder comprobarlo. Así los tests de la API no tienen que levantar websockets.

## El ranking solo se reenvía si cambia el top 10

Cada partida terminada se anuncia en el feed, pero el ranking completo solo se manda a la sala del juego cuando alguien hace un récord personal que entra en el top 10. Si no, con mucha gente jugando se estaría mandando el ranking entero cada pocos segundos para nada.

## Duelo: el servidor simula la partida

En un juego competitivo no te puedes fiar del cliente. El motor del duelo (`server/src/duel/engine.ts`) es una clase sin dependencias: recibe la hora y las acciones y decide. El cliente solo manda "toco el tornillo X" y pinta lo que le dice el servidor.

Al ser una clase pura se puede testear con un reloj falso y un generador aleatorio con semilla: los tests juegan partidas enteras en milisegundos y siempre dan el mismo resultado.

## Duelo: respuesta inmediata en el cliente

Si al tocar un tornillo hubiera que esperar a que el servidor contestase, con 80 ms de ping el juego se nota "pesado". Así que el toque tiene respuesta local al momento (la tuerca gira, chispas y sonido) y lo que cuenta de verdad (quién se lo lleva y los puntos) llega en el siguiente estado del servidor. No muevo los puntos en el cliente antes de tiempo: si luego hubiera que quitarlos, sería peor que esperar 50 ms.

## Duelo: estado completo cada vez que cambia

El servidor no manda "ha pasado X", manda el estado completo (son 5 tornillos como mucho, menos de 1 KB), y solo cuando ha cambiado algo (lleva un contador de versión). Así, si se pierde un mensaje o alguien se reconecta, el siguiente estado lo arregla todo. Los eventos que sirven para animar (quién se llevó qué) van dentro del mismo mensaje.

Los toques no generan un mensaje cada uno: se agrupan en el siguiente tick (cada 50 ms).

## Duelo: reloj del servidor

Las horas de la partida (cuándo empieza, cuándo caduca cada tornillo) vienen en hora del servidor. El cliente calcula la diferencia con su reloj como hace NTP: manda varios pings, se queda con el de menor ida y vuelta y supone que el camino de ida y el de vuelta tardan lo mismo.

## Duelo: estado en memoria

Las partidas en curso, la cola y las salas viven en memoria en el proceso de Node. Para un solo servidor es lo más simple y lo más rápido. En la base de datos solo se guarda el resultado y el ELO, en una transacción. Para escalar a varios servidores habría que mover ese estado a Redis y usar el adaptador de Redis de Socket.IO; lo dejo apuntado en los próximos pasos.

## Duelo: ELO

Lo clásico con K = 32. Lo que gana uno lo pierde el otro, así la media no se infla. Las partidas contra el bot no cuentan, si no sería muy fácil subir.

## Monedero: saldo + libro de movimientos

Guardar solo el saldo es rápido pero no explica nada ("¿por qué tengo 260?"). Guardar solo los movimientos obliga a sumar cada vez. Hago las dos cosas: el saldo en `users.bones` y cada movimiento en `bone_transactions`, siempre en la misma transacción (`economy/wallet.ts` es el único sitio que toca el saldo). Hay un test que comprueba que el saldo coincide con la suma del libro.

Dos protecciones en la propia base de datos, no en el código:

- `CHECK (bones >= 0)`: aunque hubiese un fallo, no se puede quedar en negativo. Si una compra no llega, salta el CHECK y la transacción se deshace entera.
- Índice único parcial en (usuario, motivo, referencia): la misma partida, el mismo duelo o el mismo logro no pueden pagar dos veces.

## Logros recalculados, no contadores

Los logros se comprueban mirando los datos que ya existen (partidas, duelos, compras) en vez de llevar contadores aparte que se puedan desincronizar. Es algo más de trabajo para PostgreSQL, pero son consultas por índice y solo se hacen al terminar una partida o comprar. Los textos y recompensas están en la base de datos; las condiciones, en código (`economy/achievements.ts`).

## Skins como paletas

El perrito ya estaba dibujado como texto con una letra por color, así que una skin es solo un JSON con los colores que cambia. Sale gratis en el juego, en los rankings (mini perrito al lado del nombre), en el perfil y en la tienda, todo desde el mismo dibujo.

## Tests de extremo a extremo

Los tests de la API y del motor ya cubren la lógica, pero no que todo funcione junto en un navegador. Los e2e con Playwright prueban los recorridos importantes de verdad, incluido un duelo con dos navegadores a la vez. Para no depender de vaciar la base de datos, cada test usa nombres de usuario aleatorios. Para preparar datos que por la interfaz llevarían mucho tiempo (tener 200 huesos), los tests escriben directamente en la base de datos.
