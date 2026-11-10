# Verso Alpha: una sola herramienta, tres modelos por URL

Versión preliminar (8 de noviembre de 2026). Une las tres versiones de
`Verso Updates 2` en un solo sitio. La herramienta se llama **Verso**; LMG y CM
son **modelos** y se eligen con la URL:

| URL (GitHub Pages, repo `Verso`)      | Modelo                         | Carpeta |
|---------------------------------------|--------------------------------|---------|
| `leobledo.github.io/Verso/`           | Verso (individual, 1 canal)    | raíz    |
| `leobledo.github.io/Verso/LMG/`       | LMG (11 canales)               | `LMG/`  |
| `leobledo.github.io/Verso/CM/`        | CM (4 canales)                 | `CM/`   |

- `Verso/` a secas siempre abre el individual.
- Sin la `/` final también funciona, porque GitHub agrega la barra.
- En minúsculas (`/Verso/lmg`, `/Verso/cm`) también funciona: GitHub distingue
  mayúsculas, así que `404.html` corrige el modelo y redirige al instante,
  conservando `?…` y `#…`. Cualquier otra ruta inexistente muestra "Page not
  found" con enlaces a los tres modelos.
- La pestaña del navegador dice "Verso" en los tres modelos.

## Qué cambió respecto a `Verso Updates 2`
Solo esto; todo lo demás es idéntico, archivo por archivo:
- `LMG/index.html` y `CM/index.html`: el título de la página pasó de
  "Verso LMG" / "Verso CM" a "Verso".
- `CM/index.html`: el aviso interno de AE "Verso CM: teclas registradas" ahora
  dice "Verso: …".
- Nuevo `404.html` (redirección de minúsculas y página de no encontrado).

Cada modelo conserva sus propios `CSInterface.js`, `Icons/`, `jsx/host.jsx` y
`CSXS/manifest.xml`, con rutas relativas, así que funciona igual dentro de su
subcarpeta.

## Ronda 2 (8 nov): botones, alerta y Short por defecto en AE

### Botones (web y AE)
- Ya no hay gelatina al sacar el mouse.
- Al pasar el mouse se iluminan como antes (brillo y halo tenue) y crecen un
  poco con una escala sutil y suave. Al salir vuelven igual de suave.
- En la barra (Song, Details, 1×, Import, Render, Export) y en las acciones del
  panel de detalles, la pastilla gris crece junto con el botón y queda centrada.

### Alerta al salir (web)
- La tarjeta es gris oscuro, más opaca que antes (ya no casi negra). Conserva un
  poco de blur.

### After Effects: Short es el modo único
- Se quitó el botón Video/Short. En LMG y CM, Render ocupa su lugar, un poco más
  ancho, igual que Export en la web. En Verso ese espacio desaparece.
- Cada acción hace lo de **video** y además lo **Short que exista**. Lo que no
  exista (comp, Lyrics, TH o footage Short) se ignora, sin avisos de error.

| Acción | Video | Short (si existe) |
|---|---|---|
| **Song / Master** | reemplaza la Song y ajusta el rango | el MISMO archivo va a la Short Song del canal (por número); la comp Short no se toca |
| **Verso: Song** | igual que antes | con "Short Song" en el proyecto: Short + Video; sin ella, solo video (ya no crea una "Short Song" vacía) |
| **Import (canal)** | Lyrics | también su Short Lyrics |
| **SRT (varios)** | Lyrics de cada canal, por número | también su Short Lyrics |
| **Bulk** | Lyrics | también su Short Lyrics |
| **Limpiar canal** | SRT de su Lyrics | también su Short Lyrics |
| **Clear (todo)** | SRT de todas las Lyrics | también de las Short |
| **Miniatura** | TH | también Short TH (y en Verso la comp "Short") |
| **Render** | TH (JPEG) + main (H.264) | también Short TH (JPEG) y main Short, todos los TH al principio |
| **Audio del panel** | lee la Song de video | si no hay, la Short Song |

- **En la web no cambia nada:** el modo Short solo se activa dentro de AE.
- **Correcciones necesarias para esto:**
  - **CM:** su Master en modo Short reemplazaba SOLO los audios Short; en un
    proyecto sin Short fallaba. Ahora usa el de LMG: video primero, luego Short.
  - **LMG y CM:** el audio Short se emparejaba por posición. Si solo algunos
    canales tenían Short, se cruzaban las canciones. Ahora se empareja por
    número de canal.
  - **Clear (todo) en modo Short:** borraba solo las Short. Ahora borra video y
    Short.
  - **Verso:** el artista y el título se guardaban por separado para Video y
    Short. Ahora se escriben iguales, así la TH de video y la Short reciben el
    mismo título.

## Ronda 3 (9 nov): barra en 3 módulos + Content Manager dentro de Verso

### Barra inferior (web y AE, los 3 modelos)
La canción ya no va arriba. Abajo hay 3 módulos (píldoras `#191919`, botones `#212121`):

| Módulo | Web | After Effects |
|---|---|---|
| **1 · Canción / detalles** | icono + Artist/Song editables directo (sin cajas) + buscar letra | igual |
| **2 · Línea de tiempo** | cargar canción · línea de tiempo · velocidad | igual |
| **3 · Derecha** | Export SRT (→) + **Content Manager** | Import (+SRT, +Bulk en LMG/CM) + Render |

- **Icono del módulo 1:** en Verso individual es un **espectro de audio** de 3 barras que se mueve al
  ritmo de la canción mientras suena (graves / medios / agudos, leídos del archivo al cargarlo; no
  toca la reproducción). En pausa vuelve a su forma de reposo. En LMG y CM es el **icono del canal**
  activo.
- **Artist / Song:** se editan directo en el módulo (Enter o Esc para salir). En LMG/CM, al salir
  del Song, un "feat." pasa al Artist como antes.
- **Detalles:** clic en el icono o en el fondo del módulo 1 → el módulo crece hacia arriba con la
  letra completa para editar (Verso: con recargar título, TH en AE y limpiar; LMG/CM: la lista de
  canales con la letra del activo y la barra de Lyrics/TH/recargar/limpiar). Se cierra igual, con
  Esc o con clic fuera. La letra se re-centra en el espacio libre.
- **Buscar (lupa):** Verso → si la extensión ve una pestaña de Genius abierta, carga esa letra
  (al pasar el mouse la lupa se pone amarilla); si no, sale una píldora para pegar el link. LMG/CM →
  abre los detalles con el cargador de links de Genius por canal.
- **Paneles angostos (AE chico, iPhone):** el módulo 1 y el 3 van arriba y la línea de tiempo abajo.
- Los botones Song / Details / Import / Render / Export de antes se reemplazaron por estos módulos;
  las acciones son las mismas funciones de siempre.

### Content Manager (solo web) — extensión `Content Controler` v14
- Está en la carpeta **`Content Controler/`** de Verso Alpha (copia de la v13 master con los
  cambios; la master en `/Volumes/Bledo Drive/Content Controler` no se tocó).
- **Dentro de Verso:** la píldora del módulo 3 muestra **Songs · Genius · Calendar**. Cada uno abre
  su panel haciendo crecer el módulo hacia arriba (mismo funcionamiento que la extensión: Songs de
  mañana, Get Lyrics / Get Titles / Get All, Calendario con Week/Month/Schedule y los botones LMG/CM).
  En Verso CM arranca con los 4 canales de CM; en Verso y LMG con LMG.
- **Fuera de Verso:** ya no hay barra flotante. En **admin.district.biz** queda solo el puntito
  compacto: al pasar el mouse aparece **Download** (la descarga de siempre). En las demás páginas no
  aparece nada.
- Sin la extensión, el módulo 3 muestra "Content Manager" atenuado (en iPad/iPhone no se muestra).
- **Instalar:** en `chrome://extensions` quitar (o desactivar) la Content Controler vieja y "Cargar
  descomprimida" → `Verso Alpha/Content Controler`. Como es otra carpeta, Chrome la trata como otra
  extensión: hay que volver a pegar el token de Notion (y el de celdas) en su popup.
- **Al recargar la extensión** con Verso abierto, el Content Manager vuelve solo (sin recargar
  Verso ni perder el trabajo).
- **Publicar en GitHub:** la carpeta `Content Controler/` no hace falta en el sitio; conviene no
  subirla (es la extensión, no parte de la página).

### Cómo se probó la ronda 3
- **Navegador (web y AE simulado, los 3 modelos):** módulos y medidas como el diseño, título de
  arriba oculto, edición directa de Artist/Song, detalles que crecen y se cierran con clic fuera,
  buscar letra (píldora en Verso, cargador de links en LMG/CM), hover con escala, sin errores.
  Espectro: con una canción de prueba las barras siguen el ritmo y en pausa vuelven al reposo.
  Ventana grande (1996 px), panel angosto de AE (700 px), iPad e iPhone.
- **Chrome real con la extensión cargada:** pestañas en la píldora, Calendar/Songs/Genius crecen
  desde el módulo, los íconos de canales cargan, clic fuera cierra, abrir detalles cierra el Content
  Manager, el puente de letras de Genius sigue respondiendo. Recargar la extensión con Verso
  abierto: la copia nueva toma el control sin recargar la página. Dos copias vivas no se pelean.
  Fuera de Verso no aparece nada; con una copia de prueba que trata la página como District, solo
  aparece el puntito con Download.
- Siguen pasando las pruebas anteriores: playhead, velocidad, leyenda, alerta y copiar/pegar
  secciones.
- **No probado:** After Effects real, Notion real (sin token en la prueba) y district.biz real.

## Ronda 4 (9 nov): espectro con fondo, lupa que se extiende, letra completa en LMG/CM

- **Espectro (Verso):** el fondo gris de cada barra también se mueve con la música, con un poco de
  retraso (sigue lo que sonó hace un instante y se suaviza más lento): queda un eco detrás del nivel
  blanco. En pausa ambos vuelven a la forma del diseño.
- **Lupa de Genius (Verso):** al hacer clic, la lupa se extiende hacia la izquierda en una píldora
  (corregido después: en reposo la píldora asomaba ~19 px a la izquierda de la lupa; ahora mide lo
  mismo que la lupa y está oculta hasta abrirla)
  con el campo para pegar el link; la lupa queda a la derecha. Enter o la lupa lo cargan; Esc, o la
  lupa con el campo vacío, lo cierran.
- **Detalles en LMG y CM:** funcionan como en Verso: al abrir, la tarjeta muestra la letra COMPLETA
  del canal en el que estás trabajando. Arriba, el nombre del canal y los canales como iconos para
  cambiar de canal (aro blanco = activo, punto blanco = ya tiene letra). Iconos de la tarjeta:
  refrescar títulos y limpiar el canal.
- **LMG y CM sin el icono de Thumbnail ni el botón Lyrics:** la lupa del módulo hace lo de Lyrics
  (abre los links de Genius por canal dentro de la tarjeta; con links pegados se pone blanca =
  cargar). La vista previa de la TH en AE se conserva bajo la letra.
- Probado en el navegador (web y AE simulado, los 3 modelos), sin errores. Respaldo previo a esta
  ronda: `scratchpad/alpha_before_r4`.

## Ronda 5 (9 nov): pasar de canal con la rueda + Export de todos en LMG/CM

- **Rueda / trackpad sobre el canal (LMG y CM):** con el mouse sobre el icono, el Artist o el Song
  del módulo 1, girar la rueda pasa al canal siguiente (abajo) o anterior (arriba), sin abrir los
  detalles. Un canal por muesca; el trackpad no se dispara con la inercia.
  - Mientras giras solo cambia el módulo (icono, artista y canción entran deslizándose) y la leyenda
    muestra "Canal · 3/11". Al dejar de girar, al sacar el mouse o al hacer clic, se abre de verdad
    ese canal (letra, audio y, en AE, su canción del proyecto), así no se carga cada canal por el
    que pasas.
  - Se detiene en el primero y en el último. Con los detalles abiertos, la tarjeta sigue al canal.
  - Si el canal no tiene Artist, en su lugar se ve el nombre del canal (atenuado).
- **Export SRT en LMG y CM (corrección):** exportaba solo el primer canal. Causa: "canal abierto" se
  medía con la fila desplegada de los detalles viejos, que al abrir Verso queda puesta en el primer
  canal y con el diseño nuevo ya no se puede plegar. Ahora: **detalles cerrados → todos los canales
  con marcas, en orden de canal** (como siempre); **detalles abiertos → solo ese canal** (y los
  detalles no se cierran al pulsar Export).
- Probado en el navegador (LMG y CM, web y AE simulado) con clics y rueda reales: un paso por
  muesca, varias muescas → un solo canal abierto al final, trackpad continuo → uno solo, extremos,
  Artist enfocado, detalles abiertos; Export al abrir Verso → 3/3 en orden, con detalles abiertos →
  solo ese canal. Sin errores. Respaldo previo: `scratchpad/alpha_before_r5`.

## Ronda 6 (9 nov): canales apilados en fila en los detalles (LMG y CM)

- Los canales vuelven a ir **apilados en fila** con sus títulos ("Artist - Song"), en vez de iconos
  arriba. Arriba de la lista: "Channels" con refrescar títulos y limpiar canal.
- El canal abierto despliega su letra **alta**: empuja a los demás canales y deja asomar unos 2 y
  medio por debajo (menos si es de los últimos). La lista se desplaza sola para dejar ese canal
  arriba.
- Clic en la fila de otro canal (o la rueda sobre el módulo) → ese canal se despliega igual. Clic en
  la fila del canal abierto → se pliega y se ven todos los canales. También se puede bajar la lista.
- **Export:** con los detalles abiertos y un canal desplegado → solo ese canal; con los detalles
  cerrados, o con todos los canales plegados → todos en orden de canal.
- Probado en el navegador (LMG 11 canales y CM 4, con letras largas): letra de ~530 px con 3 canales
  asomando, cambio de canal por fila y por rueda, plegar → los 11 visibles, Export 1 y 11/11 en
  orden. Sin errores. Respaldo previo: `scratchpad/alpha_before_r6`.

## Ronda 7 (9 nov): menos cajas en los detalles de LMG y CM

- **Letra del canal abierto:** sin caja propia (sin relleno ni borde), directo sobre la fila del
  canal, con fade arriba y abajo.
- **Links de Genius (la lupa):**
  - El campo para pegar los links en bulk va **abajo**, junto a la lupa, sin caja; en la web queda
    listo para pegar (Cmd/Ctrl+V) al abrirlo.
  - Los canales uno por uno quedan **plegados** en la pestaña **Channels** (muestra cuántos tienen
    link, p. ej. 3/11); al abrirla aparecen arriba, también sin cajas, para cambiar un link suelto.
  - Con la pestaña plegada el panel solo ocupa la parte de abajo y la lista de canales se
    desvanece detrás; con la pestaña abierta ocupa todo el alto.
- Probado en el navegador (LMG y CM): letra sin relleno y con fade, campo de pegar abajo y enfocado,
  pestaña plegada → abierta con los 11/4 canales, conteo de links, lupa en "cargar". Siguen pasando
  las pruebas de la ronda 6 (filas, desplegar/plegar, Export). Sin errores. Respaldo previo:
  `scratchpad/alpha_before_r7`.

## Ronda 8 (9 nov): Content Management (extensión v15)

- La extensión ahora se llama **Content Management** (también el marcador del módulo derecho de
  Verso). La carpeta sigue siendo `Verso Alpha/Content Controler`, para no cambiar el ID de la
  extensión (no hay que volver a pegar los tokens): basta con **recargarla** en `chrome://extensions`.
- **Solo los canales del modelo:** en Verso **CM** aparecen solo los 4 canales de CM; en Verso
  **LMG** solo los 11 de LMG (lista de canciones, iconos del calendario, Week/Month, Schedule y
  nombres de Get Lyrics). Sin los botones LMG/CM. En Verso individual, todos como antes.
- **Dos botones:**
  - **Songs** (Songs + Calendar juntos): arriba el calendario como estaba (mes, días, iconos de
    canales, Week/Month) y abajo las canciones de **mañana** al abrirlo. Clic en otro día = sus
    canciones; Shift/⌘/Ctrl+clic = sumar días. Clic otra vez en la pestaña ("Open 11") abre las
    canciones elegidas como antes; con varios días ("Open 2 days") abre el Schedule de esos días.
  - **Genius**: igual que antes.
- Probado en Chrome real con la extensión cargada y Notion simulado: LMG 11 canciones, CM 4,
  Verso 15; cambio de día, Shift+clic, "Open 2 days" → Schedule de 2 días, "Open 11" → abre como
  antes. Sin probar con Notion real. Respaldo de la v14: `scratchpad/ext_before_v15`.

## Ronda 9 (9 nov): Verso individual sin Content Management

- En **Verso individual** el módulo derecho (web) queda **solo con Export SRT**: se quitó el
  Content Management y el módulo mide lo que el botón. En LMG y CM sigue igual (Export +
  Content Management).
- La extensión no se tocó: sin `#cmHost` en la página no dibuja nada en Verso individual, y sus
  puentes de Genius siguen funcionando ahí.
- Probado en el navegador a 1400, 760 (angosto: módulo 1 y 3 arriba, línea de tiempo abajo) y
  1996 px: un solo botón, sin errores; Export sin marcas de tiempo avisa como antes.

## Ronda 10 (9 nov): AE compacto (panel bajo = una sola píldora)

- **Solo After Effects, los 3 modelos.** Con el panel de **260 px de alto o menos** todo queda en
  una sola píldora: a la izquierda la canción y a la derecha **cargar canciones · Import · Render**
  (solo íconos; Import muestra una flecha hacia abajo y al pasar el mouse siguen saliendo SRT /
  Bulk). Se ocultan la letra, la línea de tiempo, la velocidad y la lupa; los detalles no se abren.
  Al agrandar el panel vuelve el diseño normal tal cual (en vivo, sin recargar).
- **Verso:** espectro de audio + Artist/Song (editables como siempre).
- **LMG / CM:** los íconos de los canales **empalmados**; el activo queda encima y encendido, los
  demás más apagados. Clic en uno = ese canal (carga su canción del proyecto como siempre) y al
  lado aparecen su Artist/Song. La rueda sobre la píldora también pasa de canal. En paneles
  angostos los íconos se empalman más.
- **Avisos:** lo que antes salía en la leyenda de la letra aparece unos segundos en lugar de
  Artist/Song (clic = ocultarlo).
- **Manifiestos:** el alto mínimo del panel bajó de 380 a **64 px** (si no, AE no deja achicarlo).
  Hay que volver a copiar los paneles y reiniciar AE para que lo tome.
- La web no cambia (nunca entra en modo compacto).
- Probado con AE simulado (900×120, 480×100, 900×261 = normal, 900×600): clic en canales, rueda,
  avisos, agrandar/achicar en vivo (los detalles abiertos se cierran al achicar). Siguen pasando las
  pruebas de las rondas 5–7, la lupa y Verso solo Export. Respaldo: `scratchpad/alpha_before_r10`.
  **No probado en AE real.**

## Ronda 11 (9 nov): Refresh y Thumbnail en AE + CM web pide canción por canción

- **AE, panel extendido:** en LMG y CM vuelve el botón **Thumbnail** a la cabecera de Channels
  (Refresh · Thumbnail · Clear, como antes): actualiza **todas** las TH (Artist/Song de cada comp TH,
  video y Short). Verso individual ya tenía Refresh · Thumbnail · Clear en su tarjeta.
- **AE, panel compacto (los 3 modelos):** a la derecha de la píldora ahora van
  **cargar canciones · Refresh · Thumbnail · Import · Render**. Hacen lo mismo que en el panel
  extendido: en Verso, la canción abierta; en LMG/CM, todos los canales. Refresh gira mientras
  trabaja. En paneles angostos (≤ 640 px) los botones se achican un poco.
- **CM web, cargar canciones (como Master en AE):** si eliges **un** archivo, se carga en el canal
  abierto y aparece una tarjeta "Song 2 of 4 · Brazil Chaos" → **Choose song** (o Enter) abre el
  selector para ese canal, y así hasta el último. **Stop here**, Esc, clic fuera o Cancelar en el
  selector = parar ahí. Si eliges **varios** a la vez se reparten como antes (por fecha, desde el
  canal abierto). El navegador solo deja abrir el selector tras un clic o una tecla; por eso cada
  canción se pide con la tarjeta y no se abre sola.
- La web de Verso y LMG no cambia; en AE no cambia nada más.
- Probado con AE simulado (900×600 extendido; 900×120 y 480×120 compacto: clics, giro de Refresh) y
  en Chrome con archivos reales para la carga uno por uno (clic, Enter, Esc, Stop, clic fuera,
  Cancelar, varios archivos, último canal). Respaldo: `scratchpad/alpha_before_r11`.
  **No probado en AE real.**

## Extra (9 nov): extensión "CM" (carpeta `Content Controler CM`)

- Copia de Content Management con nombre **CM** e ícono magenta. La original no se tocó.
- **Solo los 4 canales de CM** (Distrito Urbano, Brazilian Chaos, Anthems South, Anthems East) en
  cualquier página de Verso, con las mismas dos pestañas (Songs con el calendario, y Genius).
- Al abrir canciones abre **solo las canciones, nunca las pestañas "Interaction"** de District (y no
  marca "Missing" a una canción por no tener Interaction). Sin el puntito de admin.district.biz.
- Es otra extensión (otro ID): sus tokens de Notion se pegan aparte en su popup.
- Si las dos están cargadas en el mismo Chrome, dentro de Verso **manda Content Management** y CM
  no hace nada (no se pelean). Para usar CM: desactivar Content Management en `chrome://extensions`
  y recargar la página de Verso (o usar CM en otro perfil / otra computadora).
- Probado en Chrome real con Notion simulado: CM sola en Verso CM y en Verso LMG → 4 canciones de
  CM, "Open 4" abre 4 pestañas, ninguna de District. Las dos cargadas (en los dos órdenes): se queda
  Content Management y el módulo no cambia en 6 s. Sin probar con Notion real.
- Tampoco se sube a GitHub.

## Cosas a tener en cuenta
- **Datos guardados en el navegador:** los tres modelos comparten la velocidad
  de reproducción y los ids/token de Genius. Antes también pasaba: los tres
  repos ya estaban bajo el mismo dominio `leobledo.github.io`.
- **Extensión Content Controler (letras de Genius en web):** funciona por
  dominio (`leobledo.github.io`, localhost), no por ruta, así que no hay que
  cambiar nada.
- **After Effects:**
  - Los paneles siguen siendo tres extensiones separadas, con los mismos IDs y
    nombres de menú (Verso, Verso LMG, Verso CM).
  - Se instala como antes: la raíz de esta carpeta es el panel Verso, y `LMG/`
    y `CM/` se copian cada una como su propia carpeta en
    `…/CEP/extensions`.
  - Si la raíz se copia entera como "Verso", AE ignora las subcarpetas.

## Publicado (9 nov 2026)
- El contenido de esta carpeta se subió al repo `leobledo/Verso` (reemplaza la versión de
  octubre; se publica con su workflow de Pages). Quedan `leobledo.github.io/Verso/`,
  `…/Verso/LMG/` y `…/Verso/CM/`.
- **No se subió** la carpeta `Content Controler/` (la extensión se carga desde el disco en
  `chrome://extensions`).
- Los repos `VersoLMG` y `VersoCM` siguen como estaban (versión anterior, en sus propias URLs).
- **Actualizado el 9 nov con las rondas 10 y 11** (AE compacto, Refresh/Thumbnail, CM web canción por
  canción). Tampoco se subió `Content Controler CM/`.

## Cómo se probó la ronda 2
- **Simulación de AE en Node**, con el `host.jsx` real de cada modelo. Se
  probaron proyectos con Short en todos los canales, con Short solo en uno y
  sin Short.
  - **Master:** cada Short Song recibe el mismo archivo que su canal.
  - **SRT:** cada uno va a su canal y a su Short, sin avisos.
  - **Import, Bulk, Clear, miniatura y Render:** probados en esos tres casos.
  - **Verso:** cargar canción con y sin Short. Sin Short ya no se crea una
    "Short Song"; el host anterior sí la creaba.
- **Lectura de audio:** el código que genera el panel se ejecutó en la
  simulación. Toma la Song de video; si no existe, la Short Song; si no hay
  nada, da un error con la lista de audios.
- **En el navegador (web y AE simulado):**
  - El modo Short solo se activa en AE y no hay toggle.
  - En hover, escala 1.05 y la pastilla queda centrada (0.02 px).
  - No queda ninguna animación de gelatina y no hay errores.
  - Siguen pasando las pruebas del playhead, la velocidad, la alerta,
    copiar/pegar secciones y las rutas `/Verso/`, `/LMG/` y `/CM/`.
- **No se probó en After Effects real** (lo prueba el usuario).

## Cómo se probó
Se sirvió la carpeta como lo hace GitHub Pages: sitio de proyecto `/Verso/`,
redirección de carpeta sin `/`, rutas sensibles a mayúsculas y `404.html` para
lo que no existe. Se abrió en Chrome:

- `/Verso/` y `/Verso` → individual.
- `/Verso/LMG/` y `/Verso/LMG` → LMG (11 canales).
- `/Verso/CM/` → CM (Distrito Urbano, Brazil Chaos, Anthems South, Anthems East).
- `/Verso/lmg`, `/Verso/cm/` y `/Verso/Cm/?x=1#h` → redirigen al modelo correcto.
- `/Verso/nada` → página de no encontrado, con enlaces correctos.

En los tres modelos:
- Título "Verso".
- Todos los íconos cargan y no hay errores. El único 404 es el `favicon.ico`
  que pide el navegador por su cuenta.
- Al cargar audio y letra: la línea de tiempo con puntos, la alerta de salir y
  los botones nuevos funcionan.
