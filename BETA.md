# Verso Beta: LMG con 9 canales y CM con 3

Copia de `Verso Alpha` del 15 de noviembre de 2026, con todas sus rondas hasta la 11.
`Verso Alpha` sigue intacta. La historia de Alpha sigue en `ALPHA.md`.

## Canales quitados

- **LMG:** se quitaron Country Queens (era 05) y Rap Queens (era 11).
- **CM:** se quitó Anthems East (era 04).

Se quitaron del panel (lista de canales, Details, avatares de la píldora compacta, íconos) y de
las dos extensiones (`Content Controler` = Content Management y `Content Controler CM`):
lista de Songs, calendario, grupos LMG/CM, bases de Notion, lanzador del popup y los íconos
del manifest. Los archivos de esos íconos también se borraron.

## Nueva numeración

| #  | LMG (antes)              | CM                |
|----|--------------------------|-------------------|
| 01 | Nightclub Nostalgia      | Distrito Urbano   |
| 02 | Lal Music Group          | Brazil Chaos      |
| 03 | Rap Riot                 | Anthems South     |
| 04 | Rock Surge               |                   |
| 05 | Peaceful Polar (era 06)  |                   |
| 06 | Accelerate (era 07)      |                   |
| 07 | Retro Jams (era 08)      |                   |
| 08 | House Fusion (era 09)    |                   |
| 09 | Rap Rodeo (era 10)       |                   |

- **SRT:** el export web nombra los archivos `01 …` a `09 …` en LMG y `01 …` a `03 …` en CM.
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

El orden de descarga en District es el orden maestro de la extensión: los 9 de LMG y luego los 3
de CM. El grupo CM ya no son "los últimos 4" fijos: es la lista de canales de la página de CM (3).
Así Rap Rodeo cuenta como LMG y nunca se abre una pestaña de un canal de otro grupo. Las pestañas
abiertas de los canales quitados se saltan ("channel not in the list").

## Cambios por archivo

- `LMG/index.html`: `CH_DATA` (9 canales, 01–09) e `ICON_MAP`. `_songReadJsx` y la respuesta de
  Master también reconocen los nombres con la numeración vieja.
- `CM/index.html`: `CH_DATA` (3 canales) e `ICON_MAP`. Mismo cambio en `_songReadJsx` y en Master.
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
- **GitHub:** Beta no está publicada; `leobledo.github.io/Verso/` sigue siendo Alpha.

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
