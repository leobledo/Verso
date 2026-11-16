# Verso Beta: LMG con 9 canales y CM con 4

Copia de `Verso Alpha` del 15 de noviembre de 2026, con todas sus rondas hasta la 11.
`Verso Alpha` sigue intacta. La historia de Alpha sigue en `ALPHA.md`.

## Canales quitados

- **LMG:** se quitaron Country Queens (era 05) y Rap Queens (era 11).
- **CM:** se quitó Anthems East (era 04).

Se quitaron del panel (lista de canales, Details, avatares de la píldora compacta, íconos) y de
las dos extensiones (`Content Controler` = Content Management y `Content Controler CM`):
lista de Songs, calendario, grupos LMG/CM, bases de Notion, lanzador del popup y los íconos
del manifest. Los archivos de esos íconos también se borraron.

## DESTINED (CM 04, 16 de noviembre de 2026)

- **Panel CM:** DESTINED es el canal 04, el último. Comps: `04 DES Lyrics`, `04 DESTINED TH` y
  `04 DES Song`; las Short son `04 DES Short Lyrics`, `04 DES Short TH` y `04 DES Short Song`.
  Ícono: `CM/Icons/destined.png`.
  - Si en AE las nombras distinto (`04 DESTINED Lyrics`…) o el proyecto todavía tiene las de
    Anthems East (`04 AE …`), el panel usa las comps que empiezan con `04`.
  - Master: si la Song 04 tiene otro nombre, su título igual va a DESTINED. Solo pasa cuando
    ninguna Song coincide por nombre con DESTINED.
- **Extensiones** (las dos, v16.1): DESTINED va al final de CM en Songs, en el calendario y en
  la descarga de MP3 (DU → BC → AS → DESTINED). Ícono: `DESTINED.png`.
- **Notion:** la base del link tiene 3 fuentes de datos (DESTINED, más vistas de Anthems South y
  Anthems East). La API que usa la extensión (2022-06-28) no consulta bases con varias fuentes.
  Por eso DESTINED se consulta por su fuente de datos (`408387f1-0a52-802a-a5f5-000b6bad2861`)
  con la API 2025-09-03. Las demás bases siguen igual.
  - La integración de Notion de tus tokens necesita acceso a DESTINED. Si Songs o el calendario
    marcan error en DESTINED: en Notion, ••• de esa base → Conexiones → agregar la integración.
- **Probado** (sin AE ni Notion reales):
  - `host.jsx` real en AE simulado: comps con los nombres del panel, con nombres completos y con
    las viejas `04 AE …`. SRT 4/4 (video y Short), import, Bulk, miniatura y canción van al 04.
  - Paneles en Chrome: CM con 4 canales, export `01–04`, MP3 en el orden de descarga, Master,
    píldora con 4 avatares. LMG y Verso individual sin cambios.
  - Extensión: `background.js` real con Notion simulado. DESTINED usa `data_sources` y 2025-09-03,
    y las demás usan `databases` y 2022-06-28. Probé Songs, el análisis y llenado del calendario
    (páginas nuevas con `data_source_id`) y el orden de MP3 (13 canales, grupo CM de 4).

## Nueva numeración

| #  | LMG (antes)              | CM                |
|----|--------------------------|-------------------|
| 01 | Nightclub Nostalgia      | Distrito Urbano   |
| 02 | Lal Music Group          | Brazil Chaos      |
| 03 | Rap Riot                 | Anthems South     |
| 04 | Rock Surge               | DESTINED (nuevo)  |
| 05 | Peaceful Polar (era 06)  |                   |
| 06 | Accelerate (era 07)      |                   |
| 07 | Retro Jams (era 08)      |                   |
| 08 | House Fusion (era 09)    |                   |
| 09 | Rap Rodeo (era 10)       |                   |

- **SRT:** el export web nombra los archivos `01 …` a `09 …` en LMG y `01 …` a `04 …` en CM.
  El import de SRT en AE manda cada archivo a su canal por ese número.
- **AE acepta los dos proyectos.** El panel usa los nombres nuevos (`05 PP Lyrics`, `05 Peaceful
  Polar TH`, `05 PP Song`…). Si el proyecto de AE aún tiene la numeración vieja (`06 PP LYrics`,
  `06 Peaceful Polar TH`…), el host la encuentra por el nombre sin el número.
  - Las Short (`… Short Lyrics`, `… Short TH`) se buscan como gemelas de su comp de video.
  - El import de SRT solo toma los canales del panel: si en el proyecto quedan comps de los canales
    quitados, no se tocan.
  - Un SRT `05 …` va a Peaceful Polar aunque su comp se llame `06 PP LYrics`.
  - Seleccionar la Lyrics de un canal en el panel de Proyecto limita el import a ese canal, también
    con la numeración vieja.
- **Master y Render en AE** recorren el proyecto (como siempre). Conviene borrar del proyecto
  de AE las comps y Songs de Country Queens, Rap Queens y Anthems East para que Master no las pida.

## Descarga de MP3 (extensión)

El orden de descarga en District es el orden maestro de la extensión: los 9 de LMG y luego los 4
de CM. El grupo CM ya no son "los últimos 4" fijos: es la lista de canales de la página de CM (4, con DESTINED).
Así Rap Rodeo cuenta como LMG y nunca se abre una pestaña de un canal de otro grupo. Las pestañas
abiertas de los canales quitados se saltan ("channel not in the list").

## Cambios por archivo

- `LMG/index.html`: `CH_DATA` (9 canales, 01–09) e `ICON_MAP`. `_songReadJsx` y la respuesta de
  Master también reconocen los nombres con la numeración vieja.
- `CM/index.html`: `CH_DATA` (4 canales, con DESTINED) e `ICON_MAP`. Mismo cambio en `_songReadJsx` y en Master.
- `LMG/jsx/host.jsx` y `CM/jsx/host.jsx`:
  - `_findCompByNameCI` / `_findFootageByNameCI` → `_findByCoreName` (nombre sin número).
  - `_shortViaVideo` (gemela Short).
  - `importSRTBatch`: solo canales del panel, más `_selChannelNum`.
  - `updateThumbnailBoth`: la Short TH se busca como gemela.
- Extensiones (`content.js`, `background.js`, `popup.js`, `manifest.json` v16.0):
  - Listas sin los 3 canales y `CM_COUNT`.
  - El popup quita Country/Rap Queens si estaban guardados.
- Íconos borrados:
  - `Icons/`, `LMG/Icons/`, `CM/Icons/`: `icon_countryqueens.png`, `icon_rapqueens.png`,
    `anthems east.png`.
  - Extensiones: `AE.png`, `icon_countryqueens.png`, `icon_rapqueens.png`.
- Verso individual (raíz) no cambia.

## Instalar

- **AE:** los manifests (IDs y nombres de menú) son los mismos que en Alpha. Reemplaza las
  carpetas de Alpha en `/Library/Application Support/Adobe/CEP/extensions` con las de Beta (no las
  dos a la vez) y reinicia AE.
- **Extensión:** cargar `Verso Beta/Content Controler` (o `Content Controler CM`) desde una ruta nueva
  le da otro ID, y hay que volver a poner los tokens de Notion en el popup. Para conservarlos, copia
  los archivos de Beta encima de la carpeta que ya tienes cargada y recarga la extensión.
- **GitHub:** Beta se publicó el 15 de noviembre (commit 92a2c91), sin las carpetas de las
  extensiones. DESTINED se publicó el 16 de noviembre (también sin las extensiones).

## Probado (sin AE real)

- Host real (`host.jsx`) en un mock de AE, con 3 tipos de proyecto: numeración vieja, vieja con los
  canales quitados todavía dentro, y nueva. En los tres, cada canal encuentra sus comps:
  - Lyrics, Short Lyrics, TH, Short TH (con nombre completo o abreviado) y Song.
  - El import de SRT pone 9/9 (LMG) y 3/3 (CM), video y Short.
  - El import por selección, Bulk y Thumbnail van a su canal.
- Paneles en Chrome (web y AE simulado):
  - LMG 9 / CM 3 canales.
  - Export `01–09`.
  - Carga de canciones en el orden de descarga.
  - Master con nombres viejos.
  - Píldora compacta con 9 / 3 avatares.
  - Sin errores.
- Extensión:
  - `background.js` real con Chrome, Notion y District simulados: orden de MP3 correcto, apertura
    desde Notion solo dentro del grupo, y pestañas viejas saltadas.
  - Lista de Songs en Verso: LMG 9, CM 3.
