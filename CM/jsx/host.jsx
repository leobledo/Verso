// SRT Editor — ExtendScript host for After Effects
// Called from CEP panel via CSInterface.evalScript()
// CEP sets $.fileName to the .jsx path — we use that to locate sibling files.

// ─── SAVE TO DISK ─────────────────────────────────────────────────────────────
// ─── DIALOGOS DE ARCHIVO MULTIPLATAFORMA ──────────────────────────────────────
// Windows: filtro por STRING (soportado, es el que siempre funciono).
// macOS: SIN filtro. El string "Nombre:*.ext" es Windows-only, y pasar una FUNCION de
// filtro es peor: ExtendScript la invoca por CADA archivo del directorio y puede colgar
// el dialogo, dejando a evalScript sin respuesta ("SRT: no response"). Sin filtro el
// dialogo siempre abre y el usuario elige su archivo igual.
function _isWin() { try { return String($.os).indexOf("Windows") !== -1; } catch (e) { return false; } }
function _dlgFilter(winFilter, exts) { return _isWin() ? winFilter : undefined; }
// Sentinela de version del host: el panel comprueba que ESTA funcion exista para saber
// si AE tiene cargada una copia vieja del jsx y forzar su recarga.
function _hostVersion() { return 'verso-2026-10'; }
function _AUDIO_FILTER() { return _dlgFilter('Audio:*.mp3,*.wav,*.aac,*.aif,*.aiff,*.ogg,*.m4a,*.flac,*.wma,*.caf', ["mp3","wav","aac","aif","aiff","ogg","m4a","flac","wma","caf"]); }
function _SRT_FILTER()   { return _dlgFilter('SRT:*.srt,All files:*', ["srt","txt"]); }
function saveSRTFile(srtContent, suggestedName) {
  try {
    var file = File.saveDialog('Save SRT file', 'SRT files:*.srt,All files:*');
    if (!file) return 'cancelled';
    if (file.open('w')) {
      file.encoding = 'UTF-8';
      file.write(srtContent);
      file.close();
      return 'ok:' + file.fsName;
    }
    return 'err:Could not open file for writing';
  } catch (e) { return 'err:' + e.message; }
}

// ─── GET ACTIVE COMP INFO ─────────────────────────────────────────────────────
function getActiveCompInfo() {
  try {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return 'none';
    return JSON.stringify({
      name: comp.name,
      duration: comp.duration,
      fps: comp.frameRate,
      width: comp.width,
      height: comp.height
    });
  } catch (e) { return 'none'; }
}

// ─── PARSE SRT ────────────────────────────────────────────────────────────────
// FUENTE: evita el glitch de "algunos caracteres con otra fuente".
// Causa: las letras de Genius traen puntuacion TIPOGRAFICA (comillas curvas, guiones
// largos, puntos suspensivos, espacios duros). Si la fuente del Style Frame no trae
// esos glifos, AE sustituye la fuente SOLO en esos caracteres. Se normaliza a ASCII
// una sola vez al parsear el SRT: coste despreciable en la importacion.
function _fontSafeText(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/[\u2018\u2019\u201A\u201B\u02BC\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[\u00A0\u2007\u2009\u200A\u202F]/g, ' ')
    .replace(/[\u200B\u200C\u200D\u200E\u200F\uFEFF]/g, '');
}
// Asigna texto a un TextDocument y REAFIRMA la fuente despues. Si la fuente se fija
// antes del texto, AE puede segmentar el estilo por caracteres al cambiar el contenido
// y dejar glifos con otra fuente. Son dos asignaciones: no afecta el tiempo de import.
function _setDocText(doc, text) {
  var f = null, fs = null;
  try { f = doc.font; } catch (e) {}
  try { fs = doc.fontSize; } catch (e) {}
  doc.text = _fontSafeText(text);
  try { if (f) doc.font = f; } catch (e) {}
  try { if (fs) doc.fontSize = fs; } catch (e) {}
  return doc;
}
function _parseSRT(srtContent) {
  var entries = [];
  var text = srtContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  var blocks = text.split(/\n\n+/);
  for (var i = 0; i < blocks.length; i++) {
    var block = blocks[i].replace(/^\s+|\s+$/g, '');
    if (!block) continue;
    var lines = block.split('\n');
    if (lines.length < 3) continue;
    var tc = lines[1].match(
      /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})/
    );
    if (!tc) continue;
    var ss = parseInt(tc[1])*3600 + parseInt(tc[2])*60 + parseInt(tc[3]) + parseInt(tc[4])/1000;
    var es = parseInt(tc[5])*3600 + parseInt(tc[6])*60 + parseInt(tc[7]) + parseInt(tc[8])/1000;
    entries.push({ startSec: ss, endSec: es, text: _fontSafeText(lines.slice(2).join('\n')) });
  }
  return entries;
}

// ─── IMPORT SRT → TEXT LAYERS ─────────────────────────────────────────────────
function importSRTToComp(srtContent, optionsJSON) {
  try {
    app.beginUndoGroup('SRT Editor: Import Subtitles');

    var opt = {};
    try { opt = JSON.parse(optionsJSON || '{}'); } catch(e) {}

    var fontSize    = opt.fontSize    !== undefined ? +opt.fontSize    : 72;
    var fontName    = opt.fontName    || 'Arial';
    var fillColor   = opt.fillColor   || [1, 1, 1];
    var strokeColor = opt.strokeColor || [0, 0, 0];
    var strokeWidth = opt.strokeWidth !== undefined ? +opt.strokeWidth : 0;
    var alignment   = opt.alignment   || 'center';
    var verticalPos = opt.verticalPos || 'bottom';
    var marginV     = opt.marginV     !== undefined ? +opt.marginV     : 80;
    var groupInNull = opt.groupInNull !== false;
    var layerPrefix = opt.layerPrefix !== undefined ? opt.layerPrefix  : 'SUB_';
    var tracking    = opt.tracking    || 0;
    var addMarkers  = !!opt.addMarkers;
    var applyFade   = opt.applyFade   !== false;                                   // fade activado por defecto
    var fadeIn      = opt.fadeIn      !== undefined ? +opt.fadeIn      : 0.3;       // seg. fade de entrada
    var fadeOut     = opt.fadeOut     !== undefined ? +opt.fadeOut     : 0.3;       // seg. fade de salida

    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) {
      app.endUndoGroup();
      return 'err:No active composition. Click a comp in the Project panel first.';
    }

    var W = comp.width, H = comp.height;
    var entries = _parseSRT(srtContent);
    if (!entries.length) {
      app.endUndoGroup();
      return 'err:No valid subtitle entries found. Check SRT format.';
    }

    // Safe justification — ParagraphJustification may not exist in older AE
    var just;
    try {
      if      (alignment === 'left')  just = ParagraphJustification.LEFT_JUSTIFY;
      else if (alignment === 'right') just = ParagraphJustification.RIGHT_JUSTIFY;
      else                            just = ParagraphJustification.CENTER_JUSTIFY;
    } catch(e) {
      just = null; // will skip setting justification
    }

    // Y position
    var posY = (verticalPos === 'top') ? marginV : (verticalPos === 'center') ? H/2 : H - marginV;
    var posX = W / 2;

    // Expresion de Opacidad: fade in/out relativo al in/outPoint de cada capa,
    // por lo que se adapta sola a la duracion de cada subtitulo.
    var fadeExpr =
      'fadeIn = '  + fadeIn  + ';\n' +
      'fadeOut = ' + fadeOut + ';\n' +
      't = time - inPoint;\n' +
      'd = outPoint - inPoint;\n' +
      'if (d <= 0) { value; }\n' +
      'else if (t < fadeIn) { linear(t, 0, fadeIn, 0, 100); }\n' +
      'else if (t > d - fadeOut) { linear(t, d - fadeOut, d, 100, 0); }\n' +
      'else { 100; }';

    // Null parent
    var nullLayer = null;
    if (groupInNull) {
      nullLayer = comp.layers.addNull(comp.duration);
      nullLayer.name = 'SUBTITLES';
      nullLayer.label = 9;
      nullLayer.shy = true;
    }

    var count = 0;
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      var inPt  = Math.max(0, e.startSec);
      var outPt = Math.min(comp.duration, e.endSec);
      if (inPt >= comp.duration || outPt <= 0 || inPt >= outPt) continue;

      var tl = comp.layers.addText(e.text);
      tl.name     = layerPrefix + _zeroPad(i + 1, 3);
      tl.label    = 2;
      tl.inPoint  = inPt;
      tl.outPoint = outPt;

      // Position
      tl.property('ADBE Transform Group')
        .property('ADBE Position')
        .setValue([posX, posY]);

      // Text document
      var textProp = tl.property('ADBE Text Properties')
                       .property('ADBE Text Document');
      var doc = textProp.value;

      try { doc.resetCharStyle(); } catch(e2) {}
      try { doc.resetParagraphStyle(); } catch(e2) {}

      try { doc.font      = fontName;    } catch(e2) {}
      try { doc.fontSize  = fontSize;    } catch(e2) {}
      try { doc.fillColor = fillColor;   } catch(e2) {}
      try { doc.applyFill = true;        } catch(e2) {}
      try { doc.tracking  = tracking;    } catch(e2) {}

      if (just !== null) {
        try { doc.justification = just; } catch(e2) {}
      }

      if (strokeWidth > 0) {
        try {
          doc.strokeColor    = strokeColor;
          doc.applyStroke    = true;
          doc.strokeWidth    = strokeWidth;
          doc.strokeOverFill = true;
        } catch(e2) {}
      } else {
        try { doc.applyStroke = false; } catch(e2) {}
      }

      try { textProp.setValue(doc); } catch(e2) {}

      // Transicion de entrada/salida tipo fade via expresion en la Opacidad
      if (applyFade) {
        try {
          tl.property('ADBE Transform Group')
            .property('ADBE Opacity')
            .expression = fadeExpr;
        } catch(e2) {}
      }

      if (nullLayer) {
        try { tl.parent = nullLayer; } catch(e2) {}
      }

      if (addMarkers) {
        try {
          var mv = new MarkerValue(e.text.split('\n')[0]);
          comp.markerProperty.setValueAtTime(inPt, mv);
        } catch(e2) {}
      }

      count++;
    }

    if (nullLayer) { try { nullLayer.moveToEnd(); } catch(e2) {} }

    app.endUndoGroup();
    return 'ok:' + count + ' layers created in "' + comp.name + '"';

  } catch (e) {
    try { app.endUndoGroup(); } catch(x) {}
    return 'err:' + e.message + (e.line ? ' (line ' + e.line + ')' : '');
  }
}

// ─── RUN ORIGINAL Import_Subtitles JSX ────────────────────────────────────────
function runImportSubtitlesScript(srtContent) {
  try {
    // Resolve the jsx/ folder — works both as standalone script and inside CEP
    var jsxFolder;
    try {
      // $.fileName is reliable inside CEP
      jsxFolder = new File($.fileName).parent;
    } catch(e) {
      jsxFolder = new Folder(Folder.temp);
    }

    // Write temp SRT
    var tempSRT = new File(jsxFolder.fsName + '/~srt_temp.srt');
    if (!tempSRT.open('w')) {
      // Fallback to system temp folder
      tempSRT = new File(Folder.temp.fsName + '/~srt_editor_temp.srt');
      if (!tempSRT.open('w')) return 'err:Cannot write temp file to ' + tempSRT.fsName;
    }
    tempSRT.encoding = 'UTF-8';
    tempSRT.write(srtContent);
    tempSRT.close();

    // Expose globally for the script to use if it checks
    $.global.SRT_EDITOR_TEMP_FILE = tempSRT.fsName;

    // Locate and run the original script
    var jsxFile = new File(jsxFolder.fsName + '/Import_Subtitles-5_4_2.jsx');
    if (!jsxFile.exists) {
      return 'err:Import_Subtitles-5_4_2.jsx not found at: ' + jsxFile.fsName;
    }

    $.evalFile(jsxFile);

    return 'ok:' + tempSRT.fsName;
  } catch (e) {
    return 'err:' + e.message + (e.line ? ' (line ' + e.line + ')' : '');
  }
}

// ─── IMPORT VIA "Style Controler" ─────────────────────────────────────────────
// Fusion del script SRT_a_Capas_Cascada.jsx dentro del panel:
//   - Toma el estilo (fuente, tamano, color, justificacion y CAJA de texto si la
//     tiene) de una capa de texto llamada "Style Controler", duplicandola por
//     cada subtitulo. Si esa capa es de CAJA (paragraph text), las lineas largas
//     se ajustan dentro de la caja en vez de salirse del frame.
//   - Todas las capas quedan centradas en la composicion.
//   - Cada capa lleva una expresion de Opacidad que hace de transicion de
//     entrada / salida (fade in / out), relativa a su in/outPoint.
//   - Si el canal es "Nightclub Nostalgia" (autoCreate), se crea la composicion
//     con ese nombre si no existe ya una igual en el proyecto.
function importViaStyleController(srtContent, optionsJSON) {
  try {
    app.beginUndoGroup('Lyricator: Import via Style Controler');

    var opt = {};
    try { opt = JSON.parse(optionsJSON || '{}'); } catch (e) {}

    var compName   = (opt.compName || '').replace(/^\s+|\s+$/g, '');
    var autoCreate = !!opt.autoCreate;
    var styleName  = opt.styleLayerName || 'Style Controler';
    var fadeIn     = opt.fadeIn  !== undefined ? +opt.fadeIn  : 0.3;
    var fadeOut    = opt.fadeOut !== undefined ? +opt.fadeOut : 0.3;
    var doCenter   = opt.center  !== false;
    var doExtend   = opt.extend  !== false;
    var cW = +opt.compWidth    || 1920;
    var cH = +opt.compHeight   || 1080;
    var cF = +opt.compFps      || 30;
    var cD = +opt.compDuration || 60;

    var entries = _parseSRT(srtContent);
    if (!entries.length) {
      app.endUndoGroup();
      return 'err:No valid subtitle entries found. Check SRT format.';
    }

    var lastEnd = 0;
    for (var q = 0; q < entries.length; q++) {
      if (entries[q].endSec > lastEnd) lastEnd = entries[q].endSec;
    }

    // Composicion destino:
    //  1) la comp seleccionada / activa en el panel de Proyecto manda;
    //  2) si no hay, se busca una comp con el nombre del canal;
    //  3) para canales con autoCreate (Nightclub Nostalgia), se crea si no existe.
    var comp = null, createdComp = false;
    var active = app.project.activeItem;
    if (active && (active instanceof CompItem)) {
      comp = active;
    } else {
      comp = _findCompByName(compName);
      if (!comp && autoCreate && compName) {
        comp = app.project.items.addComp(compName, cW, cH, 1, Math.max(cD, lastEnd + 1), cF);
        createdComp = true;
      }
    }
    if (!comp || !(comp instanceof CompItem)) {
      app.endUndoGroup();
      return 'err:No hay composicion destino. Selecciona una comp en el panel de Proyecto, o usa el canal "Nightclub Nostalgia" para crearla automaticamente.';
    }

    // Extender la duracion si el SRT es mas largo.
    if (doExtend && (lastEnd + 0.5) > comp.duration) {
      try { comp.duration = lastEnd + 0.5; } catch (e) {}
    }

    // Localizar / crear la capa "Style Controler".
    var styleLayer = _findStyleLayer(comp, styleName);
    var createdStyle = false;
    if (!styleLayer) {
      styleLayer = _createDefaultStyleLayer(comp, styleName);
      createdStyle = true;
    }

    var useStyleAnim  = !createdStyle && _hasTextAnimatorKeyframes(styleLayer);
    var styleOrigIn   = 0; try { styleOrigIn  = styleLayer.inPoint;  } catch(er) {}
    var styleOrigOut  = 0; try { styleOrigOut = styleLayer.outPoint; } catch(er) {}
    var styleLen      = styleOrigOut - styleOrigIn;
    var styleAnimData = useStyleAnim ? _readAnimData(styleLayer) : null;

    var fr = comp.frameRate;
    var cx = comp.width / 2, cy = comp.height / 2;

    // Expresion de Opacidad (fallback si Style Controler no tiene Range Animators).
    var opacityExpr =
      'fadeIn = '  + fadeIn  + ';\n' +
      'fadeOut = ' + fadeOut + ';\n' +
      'var tIn = inPoint;\n' +
      'var tOut = outPoint;\n' +
      'var dur = tOut - tIn;\n' +
      'if (fadeIn + fadeOut > dur) { var k = dur/(fadeIn+fadeOut); fadeIn*=k; fadeOut*=k; }\n' +
      'var entra = (fadeIn > 0) ? linear(time, tIn, tIn+fadeIn, 0, 100) : 100;\n' +
      'var sale  = (fadeOut > 0) ? linear(time, tOut-fadeOut, tOut, 100, 0) : 100;\n' +
      'Math.min(entra, sale);';

    // Expresion de Punto de Anclaje: centra el contenido real del texto
    // (funciona con texto de punto o de caja, en cualquier justificacion).
    var anchorExpr =
      'var r = sourceRectAtTime(time, false);\n' +
      '[r.left + r.width/2, r.top + r.height/2];';

    var count = 0;
    var createdLayers = [];
    var styleStretchOrig = 100; try { styleStretchOrig = styleLayer.stretch; } catch(er) {}
    var styleStartTimeOrig = 0;  try { styleStartTimeOrig = styleLayer.startTime; } catch(er) {}

    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      var start = Math.max(0, Math.min(e.startSec, comp.duration - 1 / fr));
      var end   = Math.min(comp.duration, Math.max(e.endSec, start + 1 / fr));
      if (start >= comp.duration) continue;
      var srtLen = end - start;

      // v7: SIEMPRE duplicate (espejo exacto del Style Controler: estilo + estructura
      // completa de keyframes). Todo el cuerpo va en try/catch para que un fallo en una
      // capa no aborte TODA la importacion.
      var layer;
      try {
      layer = styleLayer.duplicate();
      layer.name = 'SRT ' + _zeroPad(i + 1, 3);
      layer.enabled = true;
      try { layer.guideLayer = false; } catch (er) {}
      try { layer.shy = false; } catch (er) {}

      _setLayerTextSafe(layer, e.text);

      var tr = layer.property('ADBE Transform Group');

      if (doCenter) {
        var anchor = tr.property('ADBE Anchor Point');
        while (anchor.numKeys > 0) anchor.removeKey(1);
        anchor.expression = anchorExpr;

        var pos = tr.property('ADBE Position');
        while (pos.numKeys > 0) pos.removeKey(1);
        if (pos.expressionEnabled) pos.expression = '';
        pos.setValue([cx, cy]);
      }

      var op = tr.property('ADBE Opacity');
      while (op.numKeys > 0) op.removeKey(1);

      // Timing: la capa ocupa [start, end]. (Los keyframes se mueven DESPUES, en
      // el pase posterior — ver mas abajo.)
      layer.startTime = 0;
      try { layer.outPoint = comp.duration; } catch (er) {}
      try { layer.inPoint = 0; } catch (er) {}
      layer.inPoint  = start;
      layer.outPoint = end;

      // Opacidad: si la capa tiene animacion (keyframes), la visibilidad la maneja
      // la animacion -> 100; si no, expresion de fade.
      if (_layerHasAnyKeys(layer)) {
        try { if (op.expressionEnabled) op.expression = ''; } catch(er) {}
        op.setValue(100);
      } else {
        op.expression = opacityExpr;
      }

      count++;
      createdLayers.push({ layer: layer, s: start, e: end });
      } catch (errLayer) { /* una capa fallo: continuar con las demas */ }
    }

    // v5: PASE POSTERIOR — mover los keyframes de cada capa a su rango [start, end].
    // (verde al inicio, rosa al final). Se hace despues de crear todas las capas.
    for (var ri = 0; ri < createdLayers.length; ri++) {
      try { _repositionConstant(createdLayers[ri].layer, createdLayers[ri].s, createdLayers[ri].e); } catch (er) {}
    }

    // Si creamos el Style Controler por defecto, ocultarlo para que no renderice.
    if (createdStyle) {
      try { styleLayer.enabled = false; } catch (er) {}
      try { styleLayer.guideLayer = true; } catch (er) {}
      try { styleLayer.shy = true; } catch (er) {}
      try { styleLayer.moveToEnd(); } catch (er) {}
    }

    /* openInViewer omitido: no sacar el foco del panel al importar */

    app.endUndoGroup();
    var msg = count + ' capas en "' + comp.name + '"';
    if (createdComp)  msg += ' (comp creada)';
    if (createdStyle) msg += ' (Style Controler creado)';
    return 'ok:' + msg;

  } catch (e) {
    try { app.endUndoGroup(); } catch (x) {}
    return 'err:' + e.message + (e.line ? ' (line ' + e.line + ')' : '');
  }
}

// Aplica la animacion del Style Controler a todas las capas "SRT XXX" de la comp activa.
// Se llama desde el boton de varita en el panel, despues de importar los SRT normalmente.
function applyStyleToSRTLayers() {
  try {
    app.beginUndoGroup('Lyricator: Apply Style Controler to SRT layers');

    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) {
      app.endUndoGroup();
      return 'err:Selecciona una composicion activa primero.';
    }

    var styleLayer = _findStyleLayer(comp, 'Style Controler');
    if (!styleLayer) {
      app.endUndoGroup();
      return 'err:No se encontro la capa "Style Controler" en la comp activa.';
    }

    var count = 0;
    for (var i = 1; i <= comp.numLayers; i++) {
      try {
        var layer = comp.layer(i);
        if (!/^SRT\s+\d+/i.test(layer.name)) continue;

        var isText = false;
        try { isText = !!(layer.property('ADBE Text Properties').property('ADBE Text Document')); } catch(e) {}
        if (!isText) continue;

        // v5: reposicionar los keyframes que ya tiene la capa (vinieron del duplicado
        // del Style Controler) a su propio rango [inPoint, outPoint].
        var lyrStart = layer.inPoint;
        var lyrEnd   = layer.outPoint;
        if (_repositionConstant(layer, lyrStart, lyrEnd)) count++;
      } catch(e) {}
    }

    app.endUndoGroup();
    if (count === 0) return 'err:No se encontraron capas SRT con keyframes en la comp.';
    return 'ok:Keyframes alineados en ' + count + ' capa' + (count === 1 ? '' : 's') + ' SRT.';

  } catch(e) {
    try { app.endUndoGroup(); } catch(x) {}
    return 'err:' + e.message + (e.line ? ' (line ' + e.line + ')' : '');
  }
}

// Busca una composicion por nombre exacto en el proyecto.
function _findCompByName(name) {
  if (!name) return null;
  for (var i = 1; i <= app.project.numItems; i++) {
    var it = app.project.item(i);
    if (it instanceof CompItem && it.name === name) return it;
  }
  return null;
}

// Busca la capa de texto de estilo: "Style Layer", "Style Frame" o "Style Controler".
function _findStyleLayer(comp, name) {
  var info = _findStyleInfo(comp);
  if (info) return info.layer;
  return null;
}

// Detecta la capa de estilo y su MODO.
//   'frame' -> "Style Frame": UNA sola capa de texto con source-text keyframes.
//   'layer' -> "Style Layer" / "Style Controler": una capa duplicada por subtitulo.
// Style Frame tiene prioridad si ambas existen.
function _findStyleInfo(comp) {
  var frame = null, layer = null;
  for (var i = 1; i <= comp.numLayers; i++) {
    var l = comp.layer(i);
    if (!(l instanceof TextLayer)) continue;
    var n = l.name.replace(/^\s+|\s+$/g, '').toLowerCase();
    if (n.indexOf('style') === -1) continue;
    if (n.indexOf('frame') !== -1) { frame = frame || l; }
    else if (n.indexOf('layer') !== -1 || n.indexOf('control') !== -1) { layer = layer || l; }
  }
  if (frame) return { layer: frame, mode: 'frame' };
  if (layer) return { layer: layer, mode: 'layer' };
  return null;
}

// Crea un "Style Controler" por defecto: texto de CAJA (para que las lineas
// largas se ajusten dentro del frame), blanco y centrado.
function _createDefaultStyleLayer(comp, name) {
  var margin = Math.round(comp.width * 0.08);
  var boxW = Math.max(80, comp.width - margin * 2);
  var boxH = Math.max(60, Math.round(comp.height * 0.30));

  var layer;
  try { layer = comp.layers.addBoxText([boxW, boxH]); }
  catch (e) { layer = comp.layers.addText(''); }
  layer.name = name;

  var stProp = layer.property('ADBE Text Properties').property('ADBE Text Document');
  var doc = stProp.value;
  try { doc.resetCharStyle(); } catch (e2) {}
  doc.text = 'Style';
  try { doc.fontSize  = Math.max(24, Math.round(comp.height / 12)); } catch (e2) {}
  try { doc.fillColor = [1, 1, 1]; doc.applyFill = true; } catch (e2) {}
  try { doc.justification = ParagraphJustification.CENTER_JUSTIFY; } catch (e2) {}
  stProp.setValue(doc);

  try {
    layer.property('ADBE Transform Group').property('ADBE Position')
         .setValue([comp.width / 2, comp.height / 2]);
  } catch (e2) {}

  return layer;
}

// Crea una capa de texto FRESCA con el formato (TextDocument + Transform) copiado del
// Style Controler. Indispensable cuando hay keyframes que aplicar: las propiedades de
// Text Animator en layers DUPLICADAS rechazan setValueAtTime/addKey/remove en muchas
// versiones de AE, mientras que en una capa creada con addText los animadores nuevos
// (vacios) aceptan keyframes sin problema.
function _createFreshSrtLayer(comp, styleLayer, text, name) {
  // Crear capa nueva — multiples intentos para garantizar exito
  var layer = null;
  var srcDoc = null;
  try { srcDoc = styleLayer.property('ADBE Text Properties').property('ADBE Text Document').value; } catch(e) {}
  var isBox = false;
  try { isBox = !!(srcDoc && srcDoc.boxText); } catch(e) {}
  if (isBox) {
    var boxSize = [comp.width, Math.max(60, Math.round(comp.height / 8))];
    try { boxSize = srcDoc.boxTextSize; } catch(e) {}
    try { layer = comp.layers.addBoxText(boxSize); } catch(e) {}
  }
  if (!layer) { try { layer = comp.layers.addText(text); } catch(e) {} }
  if (!layer) { try { layer = comp.layers.addText(' '); } catch(e) {} }
  if (!layer) { try { layer = comp.layers.addText(); } catch(e) {} }
  if (!layer) return null;
  layer.name = name;

  // Copiar el TextDocument completo (fuente, tamano, color, alineacion, etc.)
  try {
    var dstProp = layer.property('ADBE Text Properties').property('ADBE Text Document');
    var newDoc = dstProp.value;
    if (srcDoc) {
      try { newDoc.resetCharStyle(); } catch(e) {}
      try { newDoc.font            = srcDoc.font; } catch(e) {}
      try { newDoc.fontFamily      = srcDoc.fontFamily; } catch(e) {}
      try { newDoc.fontStyle       = srcDoc.fontStyle; } catch(e) {}
      try { newDoc.fontSize        = srcDoc.fontSize; } catch(e) {}
      try { newDoc.applyFill       = srcDoc.applyFill; } catch(e) {}
      try { newDoc.fillColor       = srcDoc.fillColor; } catch(e) {}
      try { newDoc.applyStroke     = srcDoc.applyStroke; } catch(e) {}
      try { newDoc.strokeColor     = srcDoc.strokeColor; } catch(e) {}
      try { newDoc.strokeWidth     = srcDoc.strokeWidth; } catch(e) {}
      try { newDoc.strokeOverFill  = srcDoc.strokeOverFill; } catch(e) {}
      try { newDoc.tracking        = srcDoc.tracking; } catch(e) {}
      try { newDoc.leading         = srcDoc.leading; } catch(e) {}
      try { newDoc.autoLeading     = srcDoc.autoLeading; } catch(e) {}
      try { newDoc.justification   = srcDoc.justification; } catch(e) {}
      try { newDoc.baselineShift   = srcDoc.baselineShift; } catch(e) {}
      try { newDoc.fauxBold        = srcDoc.fauxBold; } catch(e) {}
      try { newDoc.fauxItalic      = srcDoc.fauxItalic; } catch(e) {}
      try { newDoc.allCaps         = srcDoc.allCaps; } catch(e) {}
      try { newDoc.smallCaps       = srcDoc.smallCaps; } catch(e) {}
      try { newDoc.superscript     = srcDoc.superscript; } catch(e) {}
      try { newDoc.subscript       = srcDoc.subscript; } catch(e) {}
      try { newDoc.verticalScale   = srcDoc.verticalScale; } catch(e) {}
      try { newDoc.horizontalScale = srcDoc.horizontalScale; } catch(e) {}
    }
    // Texto primero y fuente despues: asegura que TODO el string use la del Style.
    newDoc.text = _fontSafeText(text);
    if (srcDoc) {
      try { newDoc.font     = srcDoc.font; } catch (eF) {}
      try { newDoc.fontSize = srcDoc.fontSize; } catch (eF) {}
    }
    dstProp.setValue(newDoc);
  } catch(e) {}

  // Copiar Transform: Anchor, Position, Scale, Rotation, Opacity (valores estaticos)
  try {
    var srcTr = styleLayer.property('ADBE Transform Group');
    var dstTr = layer.property('ADBE Transform Group');
    var props = ['ADBE Anchor Point', 'ADBE Position', 'ADBE Scale', 'ADBE Rotate Z', 'ADBE Opacity'];
    for (var i = 0; i < props.length; i++) {
      try { dstTr.property(props[i]).setValue(srcTr.property(props[i]).value); } catch(e) {}
    }
  } catch(e) {}

  return layer;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function _zeroPad(n, digits) {
  var s = String(n);
  while (s.length < digits) s = '0' + s;
  return s;
}

// v7: Asigna el texto a una capa de forma SEGURA, sin importar la estructura del
// Style Controler. Si el "ADBE Text Document" esta keyframeado, setValue lanzaria
// error y abortaria toda la importacion; aqui se maneja ese caso (se actualiza el
// texto en cada keyframe) y cualquier fallo queda contenido.
function _setLayerTextSafe(layer, text) {
  try {
    var stProp = layer.property('ADBE Text Properties').property('ADBE Text Document');
    var nk = 0; try { nk = stProp.numKeys; } catch(e) {}
    if (nk > 0) {
      // Documento animado: cambiar el texto en cada keyframe (no se puede setValue).
      for (var k = 1; k <= nk; k++) {
        try { var dv = stProp.keyValue(k); dv.text = text; stProp.setValueAtKey(k, dv); } catch(e2) {}
      }
    } else {
      var doc = stProp.value;
      doc.text = text;
      stProp.setValue(doc);
    }
    return true;
  } catch (e) { return false; }
}

// ══════════════════════════════════════════════════════════════════════════════
// v5: REPOSICION DE KEYFRAMES (pase posterior a la importacion)
// El duplicado del Style Controler ya trae los keyframes con su estilo. Aqui los
// MOVEMOS para que la animacion empiece al inicio de la capa y termine al final.
// Busca keyframes en TODA la capa (Transform, Text Animators, Effects) — no solo
// en Text Animators — porque la animacion puede estar en Escala u otra propiedad.
// ══════════════════════════════════════════════════════════════════════════════

// Recorre toda la capa y devuelve { min, max } (tiempo de comp) del primer y ultimo
// keyframe encontrados en cualquier propiedad. null si no hay keyframes.
function _wholeLayerKfSpan(layer) {
  var lo = Infinity, hi = -Infinity;
  function walk(prop) {
    var nk = 0; try { nk = prop.numKeys; } catch(e) {}
    for (var k = 1; k <= nk; k++) {
      try { var t = prop.keyTime(k); if (t < lo) lo = t; if (t > hi) hi = t; } catch(e) {}
    }
    var np = 0; try { np = prop.numProperties; } catch(e) {}
    for (var p = 1; p <= np; p++) { try { walk(prop.property(p)); } catch(e) {} }
  }
  var ln = 0; try { ln = layer.numProperties; } catch(e) {}
  for (var i = 1; i <= ln; i++) { try { walk(layer.property(i)); } catch(e) {} }
  if (lo === Infinity) return null;
  return { min: lo, max: hi };
}

function _layerHasAnyKeys(layer) { return !!_wholeLayerKfSpan(layer); }

// Remapea EN SITIO los tiempos de TODOS los keyframes de la capa:
// [curMin, curMin+curDur] -> [newStart, newStart+newLen]. Conserva el valor.
function _remapWholeLayerKeys(layer, curMin, curDur, newStart, newLen) {
  function walk(prop) {
    var nk = 0; try { nk = prop.numKeys; } catch(e) {}
    if (nk > 0) {
      var arr = [];
      for (var k = 1; k <= nk; k++) {
        try { arr.push({ t: prop.keyTime(k), v: prop.keyValue(k) }); } catch(e) {}
      }
      for (var k = nk; k >= 1; k--) { try { prop.removeKey(k); } catch(e) {} }
      for (var k = 0; k < arr.length; k++) {
        var frac = (curDur > 0.0001) ? (arr[k].t - curMin) / curDur : 0;
        if (frac < 0) frac = 0; else if (frac > 1) frac = 1;
        var nt = newStart + frac * newLen;
        var wrote = false;
        try { prop.setValueAtTime(nt, arr[k].v); wrote = true; } catch(e1) {}
        if (!wrote) { try { var idx = prop.addKey(nt); prop.setValueAtKey(idx, arr[k].v); } catch(e2) {} }
      }
    }
    var np = 0; try { np = prop.numProperties; } catch(e) {}
    for (var p = 1; p <= np; p++) { try { walk(prop.property(p)); } catch(e) {} }
  }
  var ln = 0; try { ln = layer.numProperties; } catch(e) {}
  for (var i = 1; i <= ln; i++) { try { walk(layer.property(i)); } catch(e) {} }
}

// Reposiciona los keyframes de la capa dentro de [start, end].
// Intento 1 (no destructivo, conserva easing): time-stretch + startTime.
// Intento 2 (fallback): reescribir los tiempos de keyframe en sitio.
// Devuelve true si la capa tenia keyframes.
function _repositionAllKeyframes(layer, start, end) {
  var span = _wholeLayerKfSpan(layer);
  if (!span) return false;
  var newLen  = end - start;
  var animDur = span.max - span.min;

  // ── Intento 1: stretch (escala el span a la longitud de la capa) + startTime ──
  if (animDur > 0.0001) { try { layer.stretch = (newLen / animDur) * 100; } catch(e) {} }
  var s2 = _wholeLayerKfSpan(layer);
  if (s2) { try { layer.startTime = layer.startTime + (start - s2.min); } catch(e) {} }

  // Verificar si quedaron alineados a [start, end].
  var s3 = _wholeLayerKfSpan(layer);
  var ok = (s3 && Math.abs(s3.min - start) < 0.05 && Math.abs(s3.max - end) < 0.06);

  if (!ok) {
    // ── Intento 2: remapear tiempos en sitio. Normalizar stretch primero. ──
    try { layer.stretch = 100; } catch(e) {}
    var cur = _wholeLayerKfSpan(layer);
    if (cur) _remapWholeLayerKeys(layer, cur.min, (cur.max - cur.min), start, newLen);
  }

  try { layer.inPoint  = start; } catch(e) {}
  try { layer.outPoint = end;   } catch(e) {}
  return true;
}

// ══════════════════════════════════════════════════════════════════════════════
// v6: REPOSICION CON GRUPOS CONSTANTES
// El grupo de entrada (verde) y el de salida (rosa) conservan EXACTAMENTE la misma
// duracion/espaciado/easing que el Style Controler (velocidad constante). Solo el
// hueco intermedio (el "hold") se estira o encoge segun la longitud de la capa.
//   - grupo entrada: anclado al INICIO de la capa (primer KF -> start).
//   - grupo salida : anclado al FINAL de la capa  (ultimo KF -> end).
// Los grupos se separan automaticamente por el HUECO mas grande entre keyframes.
// ══════════════════════════════════════════════════════════════════════════════

// Junta todas las propiedades-hoja con keyframes de TODA la capa.
// Excluye el "ADBE Text Document" (texto fuente): mover/recrear esos keyframes
// rompe el contenido del texto y no es parte de la animacion de revelado.
function _collectKeyedProps(layer, out) {
  function walk(prop) {
    var mn = ''; try { mn = prop.matchName; } catch(e) {}
    if (mn === 'ADBE Text Document') return;   // no tocar los keyframes del texto fuente
    var nk = 0; try { nk = prop.numKeys; } catch(e) {}
    if (nk > 0) out.push(prop);
    var np = 0; try { np = prop.numProperties; } catch(e) {}
    for (var p = 1; p <= np; p++) { try { walk(prop.property(p)); } catch(e) {} }
  }
  var ln = 0; try { ln = layer.numProperties; } catch(e) {}
  for (var i = 1; i <= ln; i++) { try { walk(layer.property(i)); } catch(e) {} }
}

// Lee un keyframe con TODA su info (tiempo, valor, interpolacion, easing, tangentes).
function _readKey(prop, i) {
  var kd = {};
  try { kd.t = prop.keyTime(i); } catch(e) {}
  try { kd.v = prop.keyValue(i); } catch(e) {}
  try { kd.inInterp  = prop.keyInInterpolationType(i); } catch(e) {}
  try { kd.outInterp = prop.keyOutInterpolationType(i); } catch(e) {}
  try { kd.inEase  = prop.keyInTemporalEase(i); } catch(e) {}
  try { kd.outEase = prop.keyOutTemporalEase(i); } catch(e) {}
  try { kd.tCont = prop.keyTemporalContinuous(i); } catch(e) {}
  try { kd.tAuto = prop.keyTemporalAutoBezier(i); } catch(e) {}
  try { kd.inSpat  = prop.keyInSpatialTangent(i); } catch(e) {}
  try { kd.outSpat = prop.keyOutSpatialTangent(i); } catch(e) {}
  try { kd.sCont = prop.keySpatialContinuous(i); } catch(e) {}
  try { kd.sAuto = prop.keySpatialAutoBezier(i); } catch(e) {}
  try { kd.roving = prop.keyRoving(i); } catch(e) {}
  return kd;
}

// Snap de tiempos a la rejilla de frames del comp (para que los keyframes generados
// caigan SIEMPRE exactamente sobre un frame de la composicion).
var _SNAP_FD = 0;
function _snap(t){ return (_SNAP_FD > 0) ? Math.round(t / _SNAP_FD) * _SNAP_FD : t; }

// Crea un keyframe en newT (snappeado al frame) restaurando TODA la info leida (preserva easing).
function _writeKey(prop, newT, kd) {
  newT = _snap(newT);
  var idx = -1;
  try { idx = prop.addKey(newT); } catch(e) {}
  if (idx < 1) return;
  try { prop.setValueAtKey(idx, kd.v); } catch(e) {}

  // Tangentes ESPACIALES.
  try { if (kd.inSpat != null && kd.outSpat != null)
          prop.setSpatialTangentsAtKey(idx, kd.inSpat, kd.outSpat); } catch(e) {}
  try { if (kd.sCont != null) prop.setSpatialContinuousAtKey(idx, kd.sCont); } catch(e) {}
  try { if (kd.sAuto != null) prop.setSpatialAutoBezierAtKey(idx, kd.sAuto); } catch(e) {}

  // Flags temporales (auto-bezier / continuo / roving) ANTES del ease: si se aplicaran
  // DESPUES, recalcularian las tangentes y APLANARIAN el ease que ya pusimos (por eso
  // "algunos" keyframes quedaban planos). El ease debe ser SIEMPRE lo ultimo.
  try { if (kd.roving != null) prop.setRovingAtKey(idx, kd.roving); } catch(e) {}
  try { if (kd.tAuto != null) prop.setTemporalAutoBezierAtKey(idx, kd.tAuto); } catch(e) {}
  try { if (kd.tCont != null) prop.setTemporalContinuousAtKey(idx, kd.tCont); } catch(e) {}

  // Interpolacion temporal + EASE al FINAL = mirroring EXACTO del template. Se omite el
  // ease solo si AMBOS lados son HOLD (setTemporalEaseAtKey convertiria el HOLD a bezier).
  var _HOLD = KeyframeInterpolationType.HOLD;
  try { if (kd.inInterp !== undefined && kd.outInterp !== undefined)
          prop.setInterpolationTypeAtKey(idx, kd.inInterp, kd.outInterp); } catch(e) {}
  try { if (kd.inEase != null && kd.outEase != null && !(kd.inInterp === _HOLD && kd.outInterp === _HOLD))
          prop.setTemporalEaseAtKey(idx, kd.inEase, kd.outEase); } catch(e) {}
}

// Recrea los keyframes de toda la capa con tiempos = mapFn(tiempoOriginal), preservando easing.
function _remapLayerKeysFidelity(layer, mapFn) {
  var props = [];
  _collectKeyedProps(layer, props);
  for (var p = 0; p < props.length; p++) {
    var prop = props[p];
    var nk = 0; try { nk = prop.numKeys; } catch(e) {}
    if (nk <= 0) continue;
    var kds = [];
    for (var k = 1; k <= nk; k++) kds.push(_readKey(prop, k));
    for (var k = nk; k >= 1; k--) { try { prop.removeKey(k); } catch(e) {} }
    for (var k = 0; k < kds.length; k++) { _writeKey(prop, mapFn(kds[k].t), kds[k]); }
  }
}

// Reposiciona manteniendo los grupos CONSTANTES (misma estructura que el Style Controler).
function _repositionConstant(layer, start, end) {
  try { var cc=layer.containingComp; if(cc) _SNAP_FD=cc.frameDuration; } catch(e) {}   // snap a frames
  start = _snap(start); end = _snap(end);
  try { layer.stretch = 100; } catch(e) {}   // normalizar para que addKey use tiempos exactos

  var props = [];
  _collectKeyedProps(layer, props);
  if (!props.length) { try { layer.inPoint = start; layer.outPoint = end; } catch(e) {} return false; }

  // Reunir todos los tiempos de keyframe.
  var times = [];
  for (var i = 0; i < props.length; i++) {
    var nk = 0; try { nk = props[i].numKeys; } catch(e) {}
    for (var k = 1; k <= nk; k++) { try { times.push(props[i].keyTime(k)); } catch(e) {} }
  }
  if (!times.length) return false;
  times.sort(function(a, b) { return a - b; });
  var gmin = times[0], gmax = times[times.length - 1];
  var layerLen = end - start;

  // Separar entrada/salida por el HUECO mas grande entre keyframes consecutivos.
  var splitTime = gmax + 1, maxGap = -1;
  for (var t = 1; t < times.length; t++) {
    var gap = times[t] - times[t - 1];
    if (gap > maxGap) { maxGap = gap; splitTime = (times[t] + times[t - 1]) / 2; }
  }

  // Calcular la duracion real de cada grupo (sin escalar).
  var entLast = gmin, exFirst = gmax;
  for (var t = 0; t < times.length; t++) {
    if (times[t] < splitTime) { if (times[t] > entLast) entLast = times[t]; }
    else                      { if (times[t] < exFirst) exFirst = times[t]; }
  }
  var entSpan = entLast - gmin;   // duracion del grupo de entrada
  var exSpan  = gmax - exFirst;   // duracion del grupo de salida

  var mapFn;
  if (gmax > gmin && (entSpan + exSpan) < layerLen) {
    // CONSTANTE: grupos sin escalar. Entrada anclada a 'start', salida a 'end'.
    var entOff = start - gmin;    // primer KF de entrada -> start
    var exOff  = end   - gmax;    // ultimo KF de salida  -> end
    mapFn = function (tt) { return (tt < splitTime) ? (tt + entOff) : (tt + exOff); };
  } else {
    // La capa es mas corta que entrada+salida: como ultimo recurso, proporcional.
    var dur = gmax - gmin;
    mapFn = function (tt) {
      var f = (dur > 0.0001) ? (tt - gmin) / dur : 0;
      if (f < 0) f = 0; else if (f > 1) f = 1;
      return start + f * layerLen;
    };
  }

  _remapLayerKeysFidelity(layer, mapFn);
  try { layer.inPoint  = start; } catch(e) {}
  try { layer.outPoint = end;   } catch(e) {}
  return true;
}

// ══════════════════════════════════════════════════════════════════════════════
// RANGE MANAGER (fusionado): Master (cargar canciones + ajustar rangos) y Render.
// Detecta comps main / TH / lyrics / song por nombre, label y posicion de panel.
// ══════════════════════════════════════════════════════════════════════════════

var OUTRO_NAME = 'Outro';

// Video vs Short: Short comps/footage carry the word "Short" in their name. Every
// project-scanning function below filters by mode so the two sections never mix.
function _isShortName(n){ return /\bShort\b/i.test(n || ''); }
function _modeMatch(name, isShort){ return _isShortName(name) === !!isShort; }

function isTHComp(item) {
  return (/ TH$/i.test(item.name) || item.label === 1);
}

// Comps "main / generales" en orden de panel (label naranja, o con audio, o justo
// encima de una TH). Excluye lyrics y TH.
function getGeneralComps(isShort) {
  // Mapa de nombres base de las TH ("01 Nightclub Nostalgia TH" -> "01 nightclub nostalgia")
  // para detectar la main correspondiente por NOMBRE, sin depender del orden ni del label.
  // Solo TH del modo actual (video o short), para no cruzar secciones.
  var thBase = {};
  for (var ti = 1; ti <= app.project.numItems; ti++) {
    var t = app.project.item(ti);
    if (t instanceof CompItem && isTHComp(t) && _modeMatch(t.name, isShort)) {
      thBase[t.name.replace(/\s*TH\s*$/i, '').toLowerCase().replace(/^\s+|\s+$/g, '')] = true;
    }
  }

  var mainLabel = isShort ? 2 : 11;   // Video = naranja(11), Short = amarillo(2)
  var comps = [], seen = {};
  for (var i = 1; i <= app.project.numItems; i++) {
    var item = app.project.item(i);
    if (!(item instanceof CompItem)) continue;
    if (item.name.toLowerCase().indexOf('lyrics') !== -1) continue;
    if (isTHComp(item)) continue;
    if (!_modeMatch(item.name, isShort)) continue;   // mantiene video/short separados

    var isMain = false;
    // 1. existe una TH con su mismo nombre base  -> es su main (lo mas fiable aqui)
    if (thBase[item.name.toLowerCase().replace(/^\s+|\s+$/g, '')]) isMain = true;
    // 2. label del modo (naranja video / amarillo short)
    if (!isMain && item.label === mainLabel) isMain = true;
    // 3. tiene capa de audio
    if (!isMain) {
      for (var l = 1; l <= item.numLayers; l++) {
        var lyr = item.layer(l);
        if (lyr.hasAudio && lyr.source instanceof FootageItem) { isMain = true; break; }
      }
    }
    // 4. la siguiente comp en el panel es una TH
    if (!isMain) {
      for (var k = i + 1; k <= app.project.numItems; k++) {
        var next = app.project.item(k);
        if (next instanceof CompItem) { if (isTHComp(next)) isMain = true; break; }
      }
    }
    if (isMain && !seen[item.id]) { comps.push(item); seen[item.id] = true; }
  }
  return comps;
}

// Todas las comps de lyrics del modo actual, en orden de panel.
function _allLyricsComps(isShort) {
  var out = [];
  for (var i = 1; i <= app.project.numItems; i++) {
    var it = app.project.item(i);
    if (it instanceof CompItem && it.name.toLowerCase().indexOf('lyrics') !== -1 && _modeMatch(it.name, isShort)) out.push(it);
  }
  return out;
}

// Todas las comps TH en orden de panel.
function _allTHComps() {
  var out = [];
  for (var i = 1; i <= app.project.numItems; i++) {
    var it = app.project.item(i);
    if (it instanceof CompItem && isTHComp(it)) out.push(it);
  }
  return out;
}

// Footage "Song" del modo actual, en orden de panel. Video = "… Song" SIN "Short";
// Short = "… Short Song". Evita mezclar canciones donde no van.
function getSongItems(isShort) {
  var items = [];
  for (var i = 1; i <= app.project.numItems; i++) {
    var item = app.project.item(i);
    if (item instanceof FootageItem && item.name.toLowerCase().indexOf('song') !== -1 && _modeMatch(item.name, isShort)) {
      items.push({ footage: item, idx: i });
    }
  }
  items.sort(function (a, b) { return a.idx - b.idx; });
  return items;
}

function getSelectedGeneralCompsByPanelOrder() {
  var comps = [];
  for (var i = 1; i <= app.project.numItems; i++) {
    var item = app.project.item(i);
    if (!(item instanceof CompItem) || !item.selected) continue;
    if (item.name.toLowerCase().indexOf('lyrics') !== -1) continue;
    if (isTHComp(item)) continue;
    comps.push(item);
  }
  return comps;
}

function getRelatedLyricsComps(selectedGeneralComps, isShort) {
  var allGeneral = getGeneralComps(isShort);
  var allLyrics  = _allLyricsComps(isShort);
  var related = [];
  for (var s = 0; s < selectedGeneralComps.length; s++) {
    for (var g = 0; g < allGeneral.length; g++) {
      if (allGeneral[g] === selectedGeneralComps[s]) {
        if (g < allLyrics.length) related.push(allLyrics[g]);
        break;
      }
    }
  }
  return related;
}

// Busca la footage de audio de una comp. Antes solo miraba capas de PRIMER NIVEL y exigia
// "song" en el nombre: por eso fallaba con comps "main" que llevan el audio dentro de una
// precomp (o con otro nombre) y Master devolvia "No audio could be replaced".
//  - strict: match por nombre ("…song") respetando Video/Short.
//  - laxo:   cualquier footage con audio.
// Ambas pasadas recorren tambien las precomps anidadas.
function _songInComp(comp, isShort, depth, strict) {
  if (!comp || depth > 4) return null;
  var i, src;
  for (i = 1; i <= comp.numLayers; i++) {
    src = null; try { src = comp.layer(i).source; } catch (e) { continue; }
    if (!(src instanceof FootageItem) || !src.hasAudio) continue;
    if (!strict) return src;
    var n = src.name.toLowerCase(), sh = n.indexOf('short') !== -1;
    if (n.indexOf('song') !== -1 && (isShort ? sh : !sh)) return src;
  }
  for (i = 1; i <= comp.numLayers; i++) {
    src = null; try { src = comp.layer(i).source; } catch (e2) { continue; }
    if (src instanceof CompItem) {
      var f = _songInComp(src, isShort, depth + 1, strict);
      if (f) return f;
    }
  }
  return null;
}
function getSongItemInComp(comp, isShort) {
  return _songInComp(comp, isShort, 0, true) || _songInComp(comp, isShort, 0, false);
}

// ── Lyric cleaner (recorta keyframes despues de la ultima frontera de grupo) ──
function cleanLyricComp(comp) {
  // SHORTS: no se recorta ni se toca ninguna capa de una comp Short (solo se reescribe su SRT).
  if (!comp || _isShortName(comp.name)) return false;
  var targetLayer = null;
  for (var l = 1; l <= comp.numLayers; l++) {
    if (comp.layer(l).name === 'Lyric') { targetLayer = comp.layer(l); break; }
  }
  if (!targetLayer) {
    for (var l2 = 1; l2 <= comp.numLayers; l2++) {
      try {
        var L = comp.layer(l2);
        if (!(L instanceof TextLayer)) continue;
        var nn = L.name.toLowerCase();
        if (nn.indexOf('style') !== -1 || nn.indexOf('srt') !== -1) continue;  // no tocar Style Frame/Layer ni SRT
        targetLayer = L; break;
      } catch (e) {}
    }
  }
  if (!targetLayer) return false;   // solo hay capas de estilo → no recortar nada
  var cutoff = _getCutoffTime(targetLayer);
  if (cutoff !== null) _trimProps(targetLayer, cutoff);
  for (var k = 1; k <= comp.numLayers; k++) comp.layer(k).selected = false;
  comp.time = 0;
  return true;
}

function _collectTimesTextLayer(propGroup, out) {
  for (var i = 1; i <= propGroup.numProperties; i++) {
    var p = propGroup.property(i);
    try {
      if (p.numProperties !== undefined && p.numProperties > 0) {
        var mn = ''; try { mn = p.matchName; } catch (e2) {}
        if (mn !== 'ADBE Text Range Advanced') _collectTimesTextLayer(p, out);
      } else if (p.numKeys && p.numKeys > 0) {
        for (var k = 1; k <= p.numKeys; k++) out.push(p.keyTime(k));
      }
    } catch (e) {}
  }
}

function _getCutoffTime(layer) {
  var times = [];
  _collectTimesTextLayer(layer, times);
  try {
    var tp = layer.property('ADBE Text Properties');
    if (tp) {
      var st = tp.property('ADBE Text Document');
      if (st && st.numKeys > 0) for (var k = 1; k <= st.numKeys; k++) times.push(st.keyTime(k));
    }
  } catch (e) {}
  if (times.length < 2) return null;
  times.sort(function (a, b) { return a - b; });
  var unique = [times[0]];
  for (var i = 1; i < times.length; i++) if (times[i] - unique[unique.length - 1] > 0.02) unique.push(times[i]);
  if (unique.length < 4) return null;
  var gapArr = [];
  for (var g = 1; g < unique.length; g++) gapArr.push({ gap: unique[g] - unique[g - 1], t: unique[g] });
  var allGaps = [];
  for (var a = 0; a < gapArr.length; a++) allGaps.push(gapArr[a].gap);
  allGaps.sort(function (x, y) { return x - y; });
  var medianGap = allGaps[Math.floor(allGaps.length / 2)];
  var maxGap = allGaps[allGaps.length - 1];
  var thresholds = [medianGap * 3, medianGap * 2, medianGap * 1.5, maxGap * 0.4, maxGap * 0.25, maxGap * 0.15];
  for (var ti = 0; ti < thresholds.length; ti++) {
    var thr = thresholds[ti];
    if (thr <= 0.001) continue;
    var groupCount = 1;
    for (var j = 0; j < gapArr.length; j++) {
      if (gapArr[j].gap >= thr) { groupCount++; if (groupCount === 3) return gapArr[j].t - 0.001; }
    }
  }
  if (unique.length >= 9) return unique[Math.floor(unique.length * 2 / 3)] - 0.001;
  return null;
}

function _trimProps(propGroup, cutoff) {
  for (var i = 1; i <= propGroup.numProperties; i++) {
    var p = propGroup.property(i);
    try {
      if (p.numProperties !== undefined && p.numProperties > 0) {
        var mn = ''; try { mn = p.matchName; } catch (e2) {}
        if (mn !== 'ADBE Text Range Advanced') _trimProps(p, cutoff);
      } else if (p.numKeys && p.numKeys > 0) {
        for (var k = p.numKeys; k >= 1; k--) if (p.keyTime(k) > cutoff) p.removeKey(k);
      }
    } catch (e) {}
  }
}

// ── Range adjuster (work area = audio; reubica Outro al final del audio) ──
function adjustRangeComp(comp) {
  // SHORTS: NUNCA se ajusta el rango de una comp Short (work area, duracion, Song, Outro).
  // Ya tienen su duracion preestablecida; solo se editan su SRT y su Short TH.
  if (!comp || _isShortName(comp.name)) return false;
  var audioLayer = null;
  for (var i = 1; i <= comp.numLayers; i++) {
    var lyr = comp.layer(i);
    if (lyr.hasAudio && lyr.source instanceof FootageItem) { audioLayer = lyr; break; }
  }
  if (!audioLayer) return false;
  var waStart = Math.max(0, audioLayer.inPoint);
  var waEnd = Math.min(audioLayer.outPoint, comp.duration);
  if (waEnd <= waStart) return false;
  comp.workAreaStart = waStart;
  comp.workAreaDuration = waEnd - waStart;
  var audioEnd = audioLayer.outPoint;
  for (var j = 1; j <= comp.numLayers; j++) {
    if (comp.layer(j).name === OUTRO_NAME) {
      var outro = comp.layer(j);
      outro.startTime += audioEnd - outro.outPoint;
      break;
    }
  }
  return true;
}

// Nombre de la gemela Short: "Short" va ANTES del sufijo (" Lyrics"/" TH"); en la main
// (sin sufijo) va al final. Ej: "01 NN Lyrics" -> "01 NN Short Lyrics", "01 NN" -> "01 NN Short".
function _shortTwinName(name) {
  var n = (name || '').replace(/^\s+|\s+$/g, '');
  if (/\sLyrics$/i.test(n)) return n.replace(/\sLyrics$/i, ' Short Lyrics');
  if (/\sTH$/i.test(n))     return n.replace(/\sTH$/i, ' Short TH');
  return n + ' Short';
}
// Nombre de video (quita "Short") a partir de una comp Short: "01 NN Short Lyrics" ->
// "01 NN Lyrics", "01 NN Short" -> "01 NN".
function _videoTwinName(name) {
  return (name || '').replace(/^\s+|\s+$/g, '').replace(/\sShort\b/i, '').replace(/\s{2,}/g, ' ').replace(/\s+$/, '');
}
// Comp Short "gemela" de una comp de video (Lyrics/TH/main). 1) por nombre exacto;
// 2) respaldo por NUMERO de canal + mismo tipo (Lyrics/TH/main) entre las comps Short.
function _shortTwinByName(comp) {
  if (!comp) return null;
  var want = _shortTwinName(comp.name).toLowerCase(), i, it;
  for (i = 1; i <= app.project.numItems; i++) {
    it = app.project.item(i);
    if (it instanceof CompItem && it.name.toLowerCase().replace(/^\s+|\s+$/g, '') === want) return it;
  }
  var n = _leadNum(comp.name), isLyr = /lyrics/i.test(comp.name), isTH = isTHComp(comp);
  if (n != null) {
    for (i = 1; i <= app.project.numItems; i++) {
      it = app.project.item(i);
      if (!(it instanceof CompItem) || !_isShortName(it.name) || _leadNum(it.name) !== n) continue;
      var itLyr = /lyrics/i.test(it.name), itTH = isTHComp(it);
      if (isLyr && itLyr) return it;
      if (isTH && itTH) return it;
      if (!isLyr && !isTH && !itLyr && !itTH) return it;   // main
    }
  }
  return null;
}
// ── Master: reemplaza audios (dialogo) + limpia lyrics + ajusta rangos ──
// Gemela Short de una comp main de VIDEO: mismo nombre + " Short" (o misma main Short por
// numero de canal). En modo SHORTS las operaciones se aplican a la de video Y a esta.
function _shortMainTwin(mainComp) {
  if (!mainComp) return null;
  var base = (mainComp.name || '').replace(/^\s+|\s+$/g, '');
  var want = (base + ' Short').toLowerCase();
  var i, it;
  for (i = 1; i <= app.project.numItems; i++) {
    it = app.project.item(i);
    if (it instanceof CompItem && it.name.toLowerCase().replace(/^\s+|\s+$/g, '') === want) return it;
  }
  var n = _leadNum(base);
  if (n != null) {
    var shorts = getGeneralComps(true);
    for (var k = 0; k < shorts.length; k++) {
      if (_isShortName(shorts[k].name) && _leadNum(shorts[k].name) === n) return shorts[k];
    }
  }
  return null;
}
function masterRun(isShort) {
  try {
    _clearResult();   // volcado limpio: el panel sondea hasta que aparezca el nuevo
    var selectedComps = getSelectedGeneralCompsByPanelOrder();
    // Un SOLO canal seleccionado = "empezar aqui": la carga uno-a-uno debe seguir por los
    // canales SIGUIENTES (Cancelar corta y deja cargados solo los ya elegidos). Antes
    // totalSlots valia 1, el bucle no corria y el dialogo nunca se volvia a abrir.
    if (selectedComps.length === 1) {
      var allComps = getGeneralComps(false);   // lista de canales = mains de VIDEO (short se empareja aparte)
      for (var ai = 0; ai < allComps.length; ai++) {
        if (allComps[ai] === selectedComps[0]) { selectedComps = allComps.slice(ai); break; }
      }
    }
    var limitToSelected = selectedComps.length > 0;

    Folder.current = Folder.desktop;
    var raw = File.openDialog(
      'Select the audio files' + (limitToSelected ? ' (' + selectedComps.length + ' selected comp(s))' : ''),
      _AUDIO_FILTER(), true);
    if (!raw) return _writeResult({ ok: false, step: 'folder', msg: 'Cancelled' });

    var files = (raw instanceof Array) ? raw : [raw];
    if (files.length === 0) return _writeResult({ ok: false, step: 'folder', msg: 'No files selected' });

    var oneByOne = (files.length === 1);
    if (oneByOne) {
      var totalSlots = limitToSelected ? selectedComps.length : getSongItems(false).length;
      for (var s = 1; s < totalSlots; s++) {
        try { Folder.current = files[files.length - 1].parent; } catch (e) {}
        var next = File.openDialog('Audio ' + (s + 1) + ' of ' + totalSlots + '  —  Cancel to stop here',
          _AUDIO_FILTER(), false);
        if (!next) break;
        files.push(next);
      }
    } else {
      files.sort(function (a, b) { return (a.created || new Date(0)).valueOf() - (b.created || new Date(0)).valueOf(); });
    }

    var count = 0, replaced = 0, missed = [];
    app.beginUndoGroup('Lyricator: Master');

    // ── Pase PRIMARIO = VIDEO (identico al comportamiento original que ya funcionaba) ──
    var twins = [];   // gemelas Short (para limpiar lyrics/rango en modo SHORTS)
    if (limitToSelected) {
      count = Math.min(selectedComps.length, files.length);
      for (var j = 0; j < count; j++) {
        var songItem = getSongItemInComp(selectedComps[j], false);
        if (songItem) { try { songItem.replace(files[j]); replaced++; } catch (e) { missed.push(selectedComps[j].name + ': ' + e.toString()); } }
        else missed.push(selectedComps[j].name + ': sin footage de audio');
      }
    } else {
      var songs = getSongItems(false);
      count = Math.min(songs.length, files.length);
      for (var j2 = 0; j2 < count; j2++) { try { songs[j2].footage.replace(files[j2]); replaced++; } catch (e3) {} }
    }

    // ── Pase SHORT (solo en modo SHORTS): el MISMO archivo al "… Short Song" del canal ──
    if (isShort) {
      if (limitToSelected) {
        for (var sj = 0; sj < count; sj++) {
          var tw = _shortMainTwin(selectedComps[sj]);
          if (tw) { twins.push(tw); var ss = getSongItemInComp(tw, true); if (ss) { try { ss.replace(files[sj]); replaced++; } catch (e4) {} } }
        }
      } else {
        // Emparejar por NUMERO de canal ("01 … Song" -> "01 Short Song"), no por posicion:
        // si solo algunos canales tienen Short, por posicion se cruzaban las canciones.
        var vByNum = {};
        for (var vn = 0; vn < count; vn++) { var nV = _leadNum(songs[vn].footage.name); if (nV != null && vByNum[nV] == null) vByNum[nV] = files[vn]; }
        var ssongs = getSongItems(true);
        for (var sk = 0; sk < ssongs.length; sk++) {
          var nS = _leadNum(ssongs[sk].footage.name), fS = (nS != null) ? vByNum[nS] : null;
          if (!fS && nS == null && sk < count) fS = files[sk];   // sin numero: por posicion, como antes
          if (fS) { try { ssongs[sk].footage.replace(fS); replaced++; } catch (e5) {} }
        }
      }
    }

    if (replaced === 0) { try { app.endUndoGroup(); } catch (ue) {} return _writeResult({ ok: false, step: 'replace', msg: 'No se pudo reemplazar el audio' + (missed.length ? ' — ' + missed.join(' | ') : '') }); }

    // Lyrics a limpiar (SRT viejo): las de VIDEO + las Short si estamos en SHORTS.
    var lyricsComps = limitToSelected ? getRelatedLyricsComps(selectedComps, false) : _allLyricsComps(false);
    if (isShort) { var sLy = _allLyricsComps(true); for (var q = 0; q < sLy.length; q++) lyricsComps.push(sLy[q]); }
    var lyricsCleaned = 0;
    for (var lc = 0; lc < lyricsComps.length; lc++) if (cleanLyricComp(lyricsComps[lc])) lyricsCleaned++;

    var srtRemoved = 0;
    for (var sc = 0; sc < lyricsComps.length; sc++) {
      var lcomp = lyricsComps[sc];
      for (var lz = lcomp.numLayers; lz >= 1; lz--) {
        try { var lyz = lcomp.layer(lz); if (/SRT/i.test(lyz.name)) { lyz.remove(); srtRemoved++; } } catch (er) {}
      }
    }

    // Rangos: SOLO canales de VIDEO. Las gemelas Short NUNCA se ajustan de rango — ya
    // tienen su duracion preestablecida (workArea/Outro fijos); adjustRangeComp las corria
    // en base al audio nuevo y terminaba recortando/desplazando capas de esas comps.
    // (Tambien si la Short esta SELECCIONADA en el panel de Proyecto: se filtra aqui y
    // adjustRangeComp/cleanLyricComp ademas la rechazan por nombre.)
    var rangeSrc = limitToSelected ? selectedComps.concat([]) : getGeneralComps(false), rangeComps = [];
    for (var rq = 0; rq < rangeSrc.length; rq++) if (!_isShortName(rangeSrc[rq].name)) rangeComps.push(rangeSrc[rq]);
    var rangeUpdated = 0, rangeSkipped = 0;
    for (var rc = 0; rc < rangeComps.length; rc++) { if (adjustRangeComp(rangeComps[rc])) rangeUpdated++; else rangeSkipped++; }

    // Rutas nuevas de cada Song (para el panel). Video + Short si both.
    var songResults = [];
    var allSongs = getSongItems(false);
    if (isShort) { var ss2 = getSongItems(true); for (var z = 0; z < ss2.length; z++) allSongs.push(ss2[z]); }
    for (var sr = 0; sr < allSongs.length; sr++) {
      var sp = _footagePath(allSongs[sr].footage);
      if (sp) songResults.push({ name: allSongs[sr].footage.name, path: sp });
    }

    app.endUndoGroup();
    return _writeResult({ ok: true, mode: limitToSelected ? 'parcial' : 'completo',
      replaced: replaced, total: count, lyricsTotal: lyricsComps.length, lyricsCleaned: lyricsCleaned,
      rangeTotal: rangeComps.length, rangeUpdated: rangeUpdated, rangeSkipped: rangeSkipped,
      srtRemoved: srtRemoved, songs: songResults });
  } catch (e) {
    try { app.endUndoGroup(); } catch (ue) {}
    return _writeResult({ ok: false, step: 'exception', msg: e.toString() });
  }
}

// ── Render: encola TH y Short TH (JPEG, primero) + main (H.264) en el Render Queue ──
function getAllSelectedCompsByPanelOrder() {
  var comps = [];
  for (var i = 1; i <= app.project.numItems; i++) {
    var item = app.project.item(i);
    if (item instanceof CompItem && item.selected) comps.push(item);
  }
  return comps;
}

function doRenderOrQueue(sendToAME, isShort) {
  try {
    _clearResult();   // volcado limpio: el panel sondea hasta que aparezca el nuevo
    var downloads = new Folder('~/Downloads');
    if (downloads.exists) Folder.current = downloads;
    var outputFolder = Folder.selectDialog('Select the output folder for the render');
    if (!outputFolder) return _writeResult({ ok: false, msg: 'Cancelled' });
    if (!outputFolder.exists) outputFolder.create();

    var selected = getAllSelectedCompsByPanelOrder();
    var thComps = [], mainComps = [];
    if (selected.length > 0) {
      // Respeta la seccion: en VIDEO nada Short salvo los "… Short TH" (JPEG, nov 2026).
      for (var i = 0; i < selected.length; i++) {
        var cs = selected[i];
        if (!isShort && _isShortName(cs.name) && !isTHComp(cs)) continue;
        if (isTHComp(cs)) thComps.push(cs); else mainComps.push(cs);
      }
    } else if (!isShort) {
      // VIDEO: main = comp naranja (label 11) de video + TH de video + Short TH (JPEG). Nunca
      // main de Short ni comps de Lyrics (aunque tengan la etiqueta correcta por error).
      for (var i2 = 1; i2 <= app.project.numItems; i2++) {
        var item = app.project.item(i2);
        if (!(item instanceof CompItem)) continue;
        if (item.name.toLowerCase().indexOf('lyrics') !== -1) continue;
        if (isTHComp(item)) thComps.push(item);   // TH de video y Short TH (JPEG)
        else if (item.label === 11 && !_isShortName(item.name)) mainComps.push(item);
      }
    } else {
      // SHORT: main de VIDEO (naranja 11) + main SHORT (amarillo 2) + TH de video + Short TH
      // (todos los TH en JPEG, al principio de la cola).
      for (var i3 = 1; i3 <= app.project.numItems; i3++) {
        var it3 = app.project.item(i3);
        if (!(it3 instanceof CompItem)) continue;
        if (it3.name.toLowerCase().indexOf('lyrics') !== -1) continue;
        if (isTHComp(it3)) thComps.push(it3);   // TH de video y Short TH (JPEG)
        else if ((it3.label === 11 && !_isShortName(it3.name)) || (it3.label === 2 && _isShortName(it3.name))) mainComps.push(it3);
      }
    }
    if (thComps.length === 0 && mainComps.length === 0)
      return _writeResult({ ok: false, msg: 'No ' + (isShort ? 'Short ' : '') + 'compositions detected.\nSelect comps in the panel\nor label main ' + (isShort ? 'yellow' : 'orange') + ' / TH red.' });

    // Todos los TH al principio de la cola (nov 2026): primero los TH de video y despues los
    // Short TH, cada grupo en el orden del panel; luego las main. Todos los TH en JPEG.
    var thV = [], thS = [];
    for (var tq = 0; tq < thComps.length; tq++) (_isShortName(thComps[tq].name) ? thS : thV).push(thComps[tq]);
    thComps = thV.concat(thS);
    var allComps = thComps.concat(mainComps);
    var rq = app.project.renderQueue, jpegTplName = null, h264TplName = null;
    try {
      var probeItem = rq.items.add(allComps[0]);
      var tplArr = probeItem.outputModules[1].templates;
      probeItem.remove();
      for (var t = 0; t < tplArr.length; t++) {
        var tl = (tplArr[t] + '').toLowerCase();
        if (!jpegTplName && tl.indexOf('jpeg') !== -1) jpegTplName = tplArr[t];
        if (tl.indexOf('264') !== -1 || tl.indexOf('avc') !== -1) {
          if (!h264TplName) h264TplName = tplArr[t];
          if (tl.indexOf('15') !== -1) h264TplName = tplArr[t];
        }
      }
    } catch (e) {}
    if (!jpegTplName) jpegTplName = 'JPEG Sequence';
    if (!h264TplName) h264TplName = 'H.264';

    var added = 0, usedJpeg = '', tmplWarning = '';
    for (var j = 0; j < allComps.length; j++) {
      var comp = allComps[j];
      try {
        var rqItem = rq.items.add(comp);
        var om = rqItem.outputModules[1];
        var isTH = false;
        for (var ti = 0; ti < thComps.length; ti++) { if (thComps[ti] === comp) { isTH = true; break; } }
        if (isTH) { try { om.applyTemplate(jpegTplName); usedJpeg = jpegTplName; } catch (e) { tmplWarning = 'JPEG "' + jpegTplName + '" not found'; } }
        else { try { om.applyTemplate(h264TplName); } catch (e2) { if (!tmplWarning) tmplWarning = 'H.264 "' + h264TplName + '" not found'; } }
        if (isTH) om.file = new File(outputFolder.fsName + '/' + comp.name + '_[####].jpg');
        else om.file = new File(outputFolder.fsName + '/' + comp.name);
        added++;
      } catch (e3) {}
    }
    if (added === 0) return _writeResult({ ok: false, msg: 'Could not add any comp to the queue' });
    if (sendToAME) { try { rq.queueInAME(false); } catch (e) { try { app.executeCommand(3767); } catch (e2) {} } }
    return _writeResult({ ok: true, added: added, thCount: thV.length, shortThCount: thS.length, mainCount: mainComps.length, mode: sendToAME ? 'AME' : 'AE', tmplWarning: tmplWarning, jpegTpl: usedJpeg });
  } catch (e) {
    return _writeResult({ ok: false, msg: e.toString() });
  }
}

function renderRun(isShort) { return doRenderOrQueue(false, isShort); }
function queueRun(isShort)  { return doRenderOrQueue(true, isShort);  }

// ══════════════════════════════════════════════════════════════════════════════
// CANALES DESDE EL PROYECTO
// Cada comp main numerada = un canal. Lyrics / TH / Song se mapean por posicion.
// ══════════════════════════════════════════════════════════════════════════════

// Quita el numero inicial: "01 Nightclub Nostalgia" -> "Nightclub Nostalgia".
function _stripChannelNumber(name) {
  return (name || '').replace(/^\s*\d+\s*[-.)]?\s*/, '').replace(/^\s+|\s+$/g, '');
}

// Numero inicial del nombre ("01 ..." -> 1). null si no empieza con numero.
function _leadNum(name) {
  var m = (name || '').match(/^\s*(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function _isLyricsComp(it) {
  return (it instanceof CompItem) && it.name.toLowerCase().indexOf('lyrics') !== -1;
}

// Comp "main / canal": numerada, NO lyrics, NO TH (naranja en el proyecto del usuario).
function _isChannelComp(it) {
  if (!(it instanceof CompItem)) return false;
  if (_isLyricsComp(it)) return false;
  if (isTHComp(it)) return false;
  return _leadNum(it.name) !== null;
}

// Busca por numero inicial dentro de una categoria.
function _lyricsCompByNum(n) {
  for (var i = 1; i <= app.project.numItems; i++) {
    var it = app.project.item(i);
    if (_isLyricsComp(it) && _leadNum(it.name) === n) return it;
  }
  return null;
}
function _thCompByNum(n) {
  for (var i = 1; i <= app.project.numItems; i++) {
    var it = app.project.item(i);
    if (it instanceof CompItem && isTHComp(it) && _leadNum(it.name) === n) return it;
  }
  return null;
}
function _songByNum(n) {
  for (var i = 1; i <= app.project.numItems; i++) {
    var it = app.project.item(i);
    if (it instanceof FootageItem && it.name.toLowerCase().indexOf('song') !== -1 && _leadNum(it.name) === n) return it;
  }
  return null;
}

// Busca una comp por nombre exacto, sin distinguir mayusculas/minusculas
// (asi "06 PP LYrics" coincide con "06 PP Lyrics").
function _findCompByNameCI(name) {
  if (!name) return null;
  var want = ('' + name).replace(/^\s+|\s+$/g, '').toLowerCase();
  for (var i = 1; i <= app.project.numItems; i++) {
    var it = app.project.item(i);
    if (it instanceof CompItem && it.name.replace(/^\s+|\s+$/g, '').toLowerCase() === want) return it;
  }
  return null;
}

// Lista de canales = comps main numeradas, ordenadas por su numero (orden de panel).
// Cada canal se empareja con su lyrics / TH / song por el MISMO numero inicial.
function getProjectChannels() {
  try {
    var mains = [];
    for (var i = 1; i <= app.project.numItems; i++) {
      var it = app.project.item(i);
      if (_isChannelComp(it)) mains.push(it);
    }
    mains.sort(function (a, b) {
      var na = _leadNum(a.name), nb = _leadNum(b.name);
      na = (na == null ? 9999 : na); nb = (nb == null ? 9999 : nb);
      return na - nb;
    });

    var out = [];
    for (var m = 0; m < mains.length; m++) {
      var n = _leadNum(mains[m].name);
      out.push({
        num:       n,
        name:      _stripChannelNumber(mains[m].name),
        rawName:   mains[m].name,
        hasLyrics: !!_lyricsCompByNum(n),
        hasTH:     !!_thCompByNum(n),
        hasSong:   !!_songByNum(n)
      });
    }
    return JSON.stringify({ ok: true, channels: out });
  } catch (e) {
    return JSON.stringify({ ok: false, msg: e.toString() });
  }
}

// Busca un FootageItem por nombre exacto (sin distinguir mayusculas).
function _findFootageByNameCI(name) {
  if (!name) return null;
  var want = ('' + name).replace(/^\s+|\s+$/g, '').toLowerCase();
  for (var i = 1; i <= app.project.numItems; i++) {
    var it = app.project.item(i);
    if (it instanceof FootageItem && it.name.replace(/^\s+|\s+$/g, '').toLowerCase() === want) return it;
  }
  return null;
}

// Extrae la ruta en disco de un FootageItem (archivo ya cargado / reemplazado por Master).
function _footagePath(item) {
  try { if (item.file) return item.file.fsName; } catch (e) {}
  try { if (item.mainSource && item.mainSource.file) return item.mainSource.file.fsName; } catch (e) {}
  return null;
}

// Ruta del archivo de audio del Song del canal. Busca por NOMBRE exacto ("01 NN Song"),
// luego por numero, luego por coincidencia parcial. Devuelve la ruta del archivo cargado.
function getSongPath(songNameOrNum) {
  try {
    var song = _findFootageByNameCI(songNameOrNum);
    if (!song) { var n = parseInt(songNameOrNum, 10); if (!isNaN(n)) song = _songByNum(n); }
    if (!song) {
      // ultimo intento: footage cuyo nombre (sin espacios) contenga el texto pedido
      var want = ('' + songNameOrNum).replace(/\s+/g, '').toLowerCase();
      for (var i = 1; i <= app.project.numItems; i++) {
        var it = app.project.item(i);
        if (it instanceof FootageItem && it.name.replace(/\s+/g, '').toLowerCase().indexOf(want) !== -1) { song = it; break; }
      }
    }
    if (!song) {
      // diagnostico: listar los footage de audio que SI existen en el proyecto
      var list = [];
      for (var k = 1; k <= app.project.numItems; k++) {
        var ft = app.project.item(k);
        if (ft instanceof FootageItem && ft.hasAudio) list.push(ft.name);
      }
      return JSON.stringify({ ok: false, msg: 'Audio not found: "' + songNameOrNum + '". Available: ' + (list.join(' | ') || '(none)') });
    }
    var p = _footagePath(song);
    if (!p) return JSON.stringify({ ok: false, msg: 'El audio "' + song.name + '" no tiene archivo en disco (cargalo con Master)' });
    return JSON.stringify({ ok: true, path: p, name: song.name });
  } catch (e) {
    return JSON.stringify({ ok: false, msg: e.toString() });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// STYLE FRAME — una sola capa de texto con source-text keyframes. El texto cambia
// (HOLD kf) en el inicio de cada subtitulo; la animacion (verde=entrada, rosa=salida)
// se replica en cada momento alineada al source-text keyframe del template. Primer
// momento = solo entrada; ultimo (texto vacio) = solo salida.
// ══════════════════════════════════════════════════════════════════════════════
function _buildStyleFrame(comp, entries, frameLayer, doCenter) {
  try { _SNAP_FD = comp.frameDuration; } catch (e) {}   // snap a frames del comp
  var fr = comp.frameRate, cx = comp.width / 2, cy = comp.height / 2;

  var lastEnd = 0;
  for (var q = 0; q < entries.length; q++) if (entries[q].endSec > lastEnd) lastEnd = entries[q].endSec;

  // Misma longitud (in/out) que el Style Frame template — es 1 sola capa de texto.
  var tIn = 0, tOut = comp.duration;
  try { tIn = frameLayer.inPoint; } catch (e) {}
  try { tOut = frameLayer.outPoint; } catch (e) {}

  var layer = frameLayer.duplicate();
  layer.name = 'SRT Frame';
  layer.enabled = true;
  try { layer.guideLayer = false; } catch (e) {}
  try { layer.shy = false; } catch (e) {}
  try { layer.stretch = 100; } catch (e) {}
  try { layer.inPoint = tIn; } catch (e) {}
  try { layer.outPoint = tOut; } catch (e) {}

  // Si el template es BOX TEXT (paragraph box), el propio box define posicion y wrap:
  // NO recentrar, hay que respetar el paragraph box tal cual esta en el template.
  var isBoxFrame = false;
  try { isBoxFrame = !!(layer.property('ADBE Text Properties').property('ADBE Text Document').value.boxText); } catch (e) {}

  if (doCenter && !isBoxFrame) {
    try {
      var tr = layer.property('ADBE Transform Group');
      var anchorP = tr.property('ADBE Anchor Point'); while (anchorP.numKeys > 0) anchorP.removeKey(1);
      anchorP.expression = 'var r = sourceRectAtTime(time, false);\n[r.left + r.width/2, r.top + r.height/2];';
      var pos = tr.property('ADBE Position'); while (pos.numKeys > 0) pos.removeKey(1);
      if (pos.expressionEnabled) pos.expression = '';
      pos.setValue([cx, cy]);
    } catch (e) {}
  }

  // Punto de referencia = el source-text keyframe del template. Replicamos su estructura.
  var anchor = null;
  try {
    var stRef = layer.property('ADBE Text Properties').property('ADBE Text Document');
    var rnk = 0; try { rnk = stRef.numKeys; } catch (e) {}
    if (rnk > 0) anchor = stRef.keyTime(1);
  } catch (e) {}

  var props = []; _collectKeyedProps(layer, props);
  var times = [];
  for (var p = 0; p < props.length; p++) {
    var nk = 0; try { nk = props[p].numKeys; } catch (e) {}
    for (var k = 1; k <= nk; k++) { try { times.push(props[p].keyTime(k)); } catch (e) {} }
  }
  if (times.length) {
    times.sort(function (a, b) { return a - b; });
    if (anchor === null) anchor = times[0];   // sin source-text kf en el template → primer KF
    // El CORTE se hace en el SOURCE TEXT (anchor) del template:
    //   - keyframes ANTES del source text  = SALIDA (la columna previa al texto).
    //   - keyframes DESPUES del source text = ENTRADA (el texto siguiente).
    // Por subtitulo: la ENTRADA se ancla al INICIO del marcador; la SALIDA al punto
    // de transicion = inicio del siguiente, salvo que haya un HUECO > 2s, en cuyo
    // caso la salida cae en el FINAL del marcador (su recorte en la timeline).
    var GAP_CUT = 2.0;   // segundos
    var EPS = 0.0005;

    for (var pp = 0; pp < props.length; pp++) {
      var prop = props[pp];
      var nk2 = 0; try { nk2 = prop.numKeys; } catch (e) {}
      if (nk2 <= 0) continue;
      var kds = [];
      for (var k2 = 1; k2 <= nk2; k2++) kds.push(_readKey(prop, k2));
      for (var k3 = nk2; k3 >= 1; k3--) { try { prop.removeKey(k3); } catch (e) {} }

      for (var j = 0; j < entries.length; j++) {
        var sj = _snap(Math.max(0, Math.min(entries[j].startSec, comp.duration - 1 / fr)));
        var ej = _snap(Math.min(comp.duration, Math.max(entries[j].endSec, sj + 1 / fr)));
        var exitT;
        if (j + 1 < entries.length) {
          var nextStart = entries[j + 1].startSec;
          exitT = ((nextStart - entries[j].endSec) > GAP_CUT)
            ? ej
            : _snap(Math.min(comp.duration, Math.max(nextStart, sj + 1 / fr)));
        } else {
          exitT = ej;   // ultimo subtitulo → fin del marcador
        }
        for (var a = 0; a < kds.length; a++) {
          if (kds[a].t >= anchor - EPS) {                       // ENTRADA (despues del source text) → inicio
            _writeKey(prop, sj + (kds[a].t - anchor), kds[a]);
          } else {                                              // SALIDA (antes del source text) → exitT
            _writeKey(prop, exitT + (kds[a].t - anchor), kds[a]);
          }
        }
      }
    }
  }

  try {
    var st = layer.property('ADBE Text Properties').property('ADBE Text Document');
    var snk = 0; try { snk = st.numKeys; } catch (e) {}
    for (var sk = snk; sk >= 1; sk--) { try { st.removeKey(sk); } catch (e) {} }
    for (var j2 = 0; j2 < entries.length; j2++) {
      var tj2 = _snap(Math.max(0, Math.min(entries[j2].startSec, comp.duration - 1 / fr)));
      var d = _setDocText(st.value, entries[j2].text);
      try { st.setValueAtTime(tj2, d); } catch (e) {}
    }
    var de = st.value; de.text = '';
    try { st.setValueAtTime(_snap(Math.min(comp.duration, lastEnd)), de); } catch (e) {}
    var fnk = 0; try { fnk = st.numKeys; } catch (e) {}
    for (var fk = 1; fk <= fnk; fk++) { try { st.setInterpolationTypeAtKey(fk, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD); } catch (e) {} }
  } catch (e) {}

  return 1;
}

// Core compartido: construye las capas de letra (duplicando "Style Controler") en una comp.
function _buildLyricLayers(comp, entries, fadeIn, fadeOut, styleName, doCenter, doExtend) {
  try { _SNAP_FD = comp.frameDuration; } catch (e) {}   // snap keyframes a frames del comp
  // SHORTS: en una comp Short SOLO se reescribe la letra (capas SRT). No se cambia la
  // duracion de la comp (doExtend se ignora) y los subtitulos que empiezan despues de su
  // final se omiten: antes se apilaban todos en el ultimo frame. Se valida ANTES de borrar
  // nada, asi un SRT que no cabe no deja la comp sin su letra anterior.
  if (_isShortName(comp.name)) {
    doExtend = false;
    var inRange = [];
    for (var sq = 0; sq < entries.length; sq++) if (entries[sq].startSec < comp.duration) inRange.push(entries[sq]);
    if (!inRange.length) throw new Error('el SRT empieza despues del final de "' + comp.name + '" (' + Math.round(comp.duration) + ' s)');
    entries = inRange;
  }
  // Quitar capas SRT generadas antes (incl. "SRT Frame") para que NO se sobrepongan al reimportar.
  for (var rl = comp.numLayers; rl >= 1; rl--) {
    try { if (/^SRT\b/i.test(comp.layer(rl).name)) comp.layer(rl).remove(); } catch (e) {}
  }
  var lastEnd = 0;
  for (var q = 0; q < entries.length; q++) if (entries[q].endSec > lastEnd) lastEnd = entries[q].endSec;
  if (doExtend && (lastEnd + 0.5) > comp.duration) { try { comp.duration = lastEnd + 0.5; } catch (e) {} }

  var styleInfo = _findStyleInfo(comp);
  var styleLayer = styleInfo ? styleInfo.layer : null;
  var createdStyle = false;
  if (!styleLayer) { styleLayer = _createDefaultStyleLayer(comp, styleName); createdStyle = true; }

  // "Style Frame" → UNA sola capa con source-text keyframes (animacion por momento).
  if (styleInfo && styleInfo.mode === 'frame') {
    var nF = _buildStyleFrame(comp, entries, styleLayer, doCenter);
    return { count: nF, createdStyle: false };
  }

  var useStyleAnim  = !createdStyle && _hasTextAnimatorKeyframes(styleLayer);
  var styleOrigIn   = 0; try { styleOrigIn  = styleLayer.inPoint;  } catch(er) {}
  var styleOrigOut  = 0; try { styleOrigOut = styleLayer.outPoint; } catch(er) {}
  var styleLen      = styleOrigOut - styleOrigIn;
  var styleAnimData = useStyleAnim ? _readAnimData(styleLayer) : null;

  var fr = comp.frameRate, cx = comp.width / 2, cy = comp.height / 2;
  var opacityExpr =
    'fadeIn = ' + fadeIn + ';\n' +
    'fadeOut = ' + fadeOut + ';\n' +
    'var tIn = inPoint;\n' +
    'var tOut = outPoint;\n' +
    'var dur = tOut - tIn;\n' +
    'if (fadeIn + fadeOut > dur) { var k = dur/(fadeIn+fadeOut); fadeIn*=k; fadeOut*=k; }\n' +
    'var entra = (fadeIn > 0) ? linear(time, tIn, tIn+fadeIn, 0, 100) : 100;\n' +
    'var sale  = (fadeOut > 0) ? linear(time, tOut-fadeOut, tOut, 100, 0) : 100;\n' +
    'Math.min(entra, sale);';
  var anchorExpr =
    'var r = sourceRectAtTime(time, false);\n' +
    '[r.left + r.width/2, r.top + r.height/2];';

  var count = 0;
  var createdLayers = [];
  var styleStartTimeOrig = 0; try { styleStartTimeOrig = styleLayer.startTime; } catch(er) {}

  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    var start = _snap(Math.max(0, Math.min(e.startSec, comp.duration - 1 / fr)));
    var end = _snap(Math.min(comp.duration, Math.max(e.endSec, start + 1 / fr)));
    if (start >= comp.duration) continue;
    var srtLen = end - start;

    // v7: SIEMPRE duplicate (espejo del Style Controler). Cuerpo en try/catch para
    // que un fallo en una capa no aborte toda la importacion.
    var layer;
    try {
    layer = styleLayer.duplicate();
    layer.name = 'SRT ' + _zeroPad(i + 1, 3);
    layer.enabled = true;
    try { layer.guideLayer = false; } catch (er) {}
    try { layer.shy = false; } catch (er) {}

    _setLayerTextSafe(layer, e.text);

    var tr = layer.property('ADBE Transform Group');
    if (doCenter) {
      var anchor = tr.property('ADBE Anchor Point');
      while (anchor.numKeys > 0) anchor.removeKey(1);
      anchor.expression = anchorExpr;
      var pos = tr.property('ADBE Position');
      while (pos.numKeys > 0) pos.removeKey(1);
      if (pos.expressionEnabled) pos.expression = '';
      pos.setValue([cx, cy]);
    }

    var op = tr.property('ADBE Opacity');
    while (op.numKeys > 0) op.removeKey(1);

    // Timing: la capa ocupa [start, end]. Los keyframes se mueven en el pase posterior.
    layer.startTime = 0;
    try { layer.outPoint = comp.duration; } catch (er) {}
    try { layer.inPoint = 0; } catch (er) {}
    layer.inPoint  = start;
    layer.outPoint = end;

    if (_layerHasAnyKeys(layer)) {
      try { if (op.expressionEnabled) op.expression = ''; } catch(er) {}
      op.setValue(100);
    } else {
      op.expression = opacityExpr;
    }

    count++;
    createdLayers.push({ layer: layer, s: start, e: end });
    } catch (errLayer) { /* una capa fallo: continuar con las demas */ }
  }

  // v5: PASE POSTERIOR — mover los keyframes de cada capa a su rango [start, end].
  for (var ri = 0; ri < createdLayers.length; ri++) {
    try { _repositionConstant(createdLayers[ri].layer, createdLayers[ri].s, createdLayers[ri].e); } catch (er) {}
  }

  if (createdStyle) {
    try { styleLayer.enabled = false; } catch (er) {}
    try { styleLayer.guideLayer = true; } catch (er) {}
    try { styleLayer.shy = true; } catch (er) {}
    try { styleLayer.moveToEnd(); } catch (er) {}
  }
  return { count: count, createdStyle: createdStyle };
}

// Devuelve true solo si los Text Animators de la capa tienen keyframes reales.
function _hasTextAnimatorKeyframes(layer) {
  try {
    var anims = layer.property('ADBE Text Properties').property('ADBE Text Animators');
    if (!anims) return false;
    var np = 0; try { np = anims.numProperties; } catch(e) {}
    if (np === 0) return false;
    return _countSubKeys(anims) > 0;
  } catch (e) { return false; }
}

function _countSubKeys(prop) {
  var total = 0;
  try { var nk = 0; try { nk = prop.numKeys; } catch(e2) {} total += nk; } catch(e) {}
  var np = 0; try { np = prop.numProperties; } catch(e) {}
  for (var p = 1; p <= np; p++) {
    try { total += _countSubKeys(prop.property(p)); } catch(e) {}
  }
  return total;
}

// Lee la estructura completa de los Text Animators del Style Controler en objetos JS puros.
// Captura matchName (para recrear el animador desde cero), value y keys.
function _readAnimData(layer) {
  var result = [];
  try {
    var anims = layer.property('ADBE Text Properties').property('ADBE Text Animators');
    var np = 0; try { np = anims.numProperties; } catch(e) {}
    for (var a = 1; a <= np; a++) {
      try { result.push(_readPropTree(anims.property(a))); }
      catch(e) { result.push({ matchName: '', value: null, keys: [], children: [] }); }
    }
  } catch(e) {}
  return result;
}

function _readPropTree(prop) {
  var node = { matchName: '', value: null, keys: [], children: [] };
  try { node.matchName = prop.matchName; } catch(e) {}
  try { node.value = prop.value; } catch(e) {}
  var nk = 0; try { nk = prop.numKeys; } catch(e) {}
  for (var k = 1; k <= nk; k++) {
    try { node.keys.push({ t: prop.keyTime(k), v: prop.keyValue(k) }); } catch(e) {}
  }
  var np = 0; try { np = prop.numProperties; } catch(e) {}
  for (var p = 1; p <= np; p++) {
    try { node.children.push(_readPropTree(prop.property(p))); }
    catch(e) { node.children.push({ matchName: '', value: null, keys: [], children: [] }); }
  }
  return node;
}

// Crea animadores de texto frescos en la capa (que es una capa FRESCA creada con addText,
// no un duplicado del Style Controler). Como la capa es nueva, no tiene animadores y los
// nuevos que agregamos con addProperty aceptan keyframes sin problema.
// (Tambien borra cualquier animador preexistente como salvaguarda — en capas frescas
// no habra ninguno, asi que la limpieza es no-op.)
function _retimeLayerTextAnims(layer, animData, styleOrigIn, styleLen, newStart, newLen) {
  if (!animData || !animData.length) return;
  try {
    var anims = layer.property('ADBE Text Properties').property('ADBE Text Animators');

    // 1) Borrar todos los animadores existentes del duplicado
    var na = 0; try { na = anims.numProperties; } catch(e) {}
    for (var a = na; a >= 1; a--) {
      try { anims.property(a).remove(); } catch(e) {}
    }

    // 2) Recrear cada animador desde el snapshot
    for (var a = 0; a < animData.length; a++) {
      try {
        var newAnim = anims.addProperty('ADBE Text Animator');
        _populateFreshAnim(newAnim, animData[a], styleOrigIn, styleLen, newStart, newLen);
      } catch(e) {}
    }
  } catch(e) {}
}

// Puebla un animador nuevo (recien creado con addProperty) con los Range Selectors
// y propiedades animadas que vienen en el snapshot del Style Controler.
function _populateFreshAnim(newAnim, snap, styleOrigIn, styleLen, newStart, newLen) {
  if (!newAnim || !snap || !snap.children) return;

  for (var c = 0; c < snap.children.length; c++) {
    var child = snap.children[c];
    var mn = child.matchName || '';

    if (mn === 'ADBE Text Selectors') {
      // Contenedor de Range Selectors — acceder por nombre, agregar selectors dentro
      var selsCont = null;
      try { selsCont = newAnim.property('ADBE Text Selectors'); } catch(e) {}
      if (selsCont) {
        for (var s = 0; s < child.children.length; s++) {
          var selSnap = child.children[s];
          if ((selSnap.matchName || '') === 'ADBE Text Selector') {
            try {
              var newSel = selsCont.addProperty('ADBE Text Selector');
              _populateFreshProp(newSel, selSnap, styleOrigIn, styleLen, newStart, newLen);
            } catch(e) {}
          }
        }
      }
    } else if (mn === 'ADBE Text Animator Properties') {
      // Contenedor de propiedades animadas (Opacity, Scale, Position, etc.)
      var propsCont = null;
      try { propsCont = newAnim.property('ADBE Text Animator Properties'); } catch(e) {}
      if (propsCont) {
        for (var p = 0; p < child.children.length; p++) {
          var propSnap = child.children[p];
          var pmn = propSnap.matchName || '';
          if (pmn) {
            try {
              var newProp = propsCont.addProperty(pmn);
              _populateFreshProp(newProp, propSnap, styleOrigIn, styleLen, newStart, newLen);
            } catch(e) {}
          }
        }
      }
    }
  }
}

// v3: Escribe los keyframes/valor en una propiedad nueva (fresca, no duplicada).
// Posicionamiento FORZADO:
//   - Grupo entrada (verde): PRIMER KF colocado en t = newStart (mero inicio del SRT).
//     Los demas KFs verdes desplazados por el mismo offset (preservan espaciado interno).
//   - Grupo salida (rosa): ULTIMO KF colocado en t = newStart+newLen (mero final del SRT).
//     Los demas KFs rosas desplazados por el mismo offset (preservan espaciado interno).
//   - Recursion por matchName (mas robusto que indices) para encontrar sub-propiedades.
function _populateFreshProp(prop, snap, styleOrigIn, styleLen, newStart, newLen) {
  if (!prop || !snap) return;

  var dk = snap.keys ? snap.keys.length : 0;

  if (dk > 0) {
    var threshold = Math.min(styleLen > 0 ? styleLen * 0.5 : 2.0, 2.0);

    var entrKfs = [], exitKfs = [], midKfs = [];
    for (var k = 0; k < dk; k++) {
      var fs = snap.keys[k].t - styleOrigIn;
      var fe = styleLen - fs;
      if      (fs <= threshold) entrKfs.push(snap.keys[k]);
      else if (fe <= threshold) exitKfs.push(snap.keys[k]);
      else                      midKfs.push(snap.keys[k]);
    }

    var newKfs = [];

    // VERDE: el primer KF cronologico se ancla EXACTO en newStart (inicio del SRT)
    if (entrKfs.length > 0) {
      var t0 = entrKfs[0].t;            // tiempo del primer KF verde en el Style Controler
      for (var k = 0; k < entrKfs.length; k++) {
        var rel = entrKfs[k].t - t0;    // offset desde el primer KF (0 para el primero)
        newKfs.push({ t: newStart + rel, v: entrKfs[k].v });
      }
    }

    // KFs medios: remap proporcional
    for (var k = 0; k < midKfs.length; k++) {
      var fs = midKfs[k].t - styleOrigIn;
      newKfs.push({ t: newStart + (styleLen > 0 ? fs / styleLen : 0.5) * newLen, v: midKfs[k].v });
    }

    // ROSA: el ultimo KF cronologico se ancla EXACTO en newStart+newLen (fin del SRT)
    if (exitKfs.length > 0) {
      var tLast = exitKfs[exitKfs.length - 1].t;  // tiempo del ultimo KF rosa en el SC
      for (var k = 0; k < exitKfs.length; k++) {
        var rel = exitKfs[k].t - tLast;            // offset desde el ultimo KF (0 para el ultimo, negativo para los anteriores)
        newKfs.push({ t: newStart + newLen + rel, v: exitKfs[k].v });
      }
    }

    // Escribir keyframes en la propiedad fresca — primero setValueAtTime, fallback addKey
    for (var k = 0; k < newKfs.length; k++) {
      var wrote = false;
      try { prop.setValueAtTime(newKfs[k].t, newKfs[k].v); wrote = true; } catch(e1) {}
      if (!wrote) {
        try {
          var idx = prop.addKey(newKfs[k].t);
          prop.setValueAtKey(idx, newKfs[k].v);
        } catch(e2) {}
      }
    }
  } else if (snap.value !== null && snap.value !== undefined) {
    try { prop.setValue(snap.value); } catch(e) {}
  }

  // v3: recursion por matchName (no por indice) — robusto si AE devuelve hijos en otro orden
  if (snap.children && snap.children.length > 0) {
    for (var c = 0; c < snap.children.length; c++) {
      var childSnap = snap.children[c];
      var mn = childSnap.matchName || '';
      if (!mn) continue;
      var childProp = null;
      try { childProp = prop.property(mn); } catch(e) {}
      if (childProp) {
        try { _populateFreshProp(childProp, childSnap, styleOrigIn, styleLen, newStart, newLen); } catch(e) {}
      }
    }
  }
}

// Importa la letra en la comp Lyrics indicada (por nombre exacto, ej "01 NN Lyrics").
function importLyricsToComp(lyrCompName, srtContent, optionsJSON) {
  try {
    app.beginUndoGroup('Lyricator: Import lyrics');
    var opt = {};
    try { opt = JSON.parse(optionsJSON || '{}'); } catch (e) {}
    var fadeIn   = opt.fadeIn  !== undefined ? +opt.fadeIn  : 0.3;
    var fadeOut  = opt.fadeOut !== undefined ? +opt.fadeOut : 0.3;
    var styleName = opt.styleLayerName || 'Style Controler';

    var comp = _findCompByNameCI(lyrCompName);
    if (!comp) {
      // Fallback CONSCIENTE del modo: para "… Short Lyrics" busca la Lyrics Short del canal,
      // no la de video (_lyricsCompByNum devolvia la primera = la de video). Mismo fix que ya
      // tenia bulkImportOne — faltaba aqui, por eso el import INDIVIDUAL fallaba/pegaba en la
      // comp equivocada cuando el nombre exacto no coincidia, mientras que el bulk si funcionaba.
      var wantShort = _isShortName(lyrCompName), nn = _leadNum(lyrCompName), qi;
      for (qi = 1; qi <= app.project.numItems && !comp; qi++) {
        var qt = app.project.item(qi);
        if (_isLyricsComp(qt) && _leadNum(qt.name) === nn && (_isShortName(qt.name) === wantShort)) comp = qt;
      }
    }
    if (!comp) {
      app.endUndoGroup();
      return 'err:Comp "' + lyrCompName + '" not found in the project.';
    }

    var entries = _parseSRT(srtContent);
    if (!entries.length) { app.endUndoGroup(); return 'err:No valid subtitles in the SRT.'; }

    var res = _buildLyricLayers(comp, entries, fadeIn, fadeOut, styleName, true, true);
    /* openInViewer omitido: no sacar el foco del panel al importar */
    app.endUndoGroup();
    var msg = res.count + ' capas en "' + comp.name + '"';
    if (res.createdStyle) msg += ' (Style Controler creado)';
    return 'ok:' + msg;
  } catch (e) {
    try { app.endUndoGroup(); } catch (x) {}
    return 'err:' + e.message + (e.line ? ' (line ' + e.line + ')' : '');
  }
}
// Importa la MISMA letra a VARIAS comps (modo SHORTS: la de video y la Short del canal).
// namesJSON = ["01 NN Lyrics","01 NN Short Lyrics"]. Cada comp respeta su propio Style Frame.
// La Lyrics Short del canal por numero (misma busqueda que el fallback de importLyricsToComp).
function _shortLyricsByNum(n) {
  if (n == null) return null;
  for (var i = 1; i <= app.project.numItems; i++) {
    var it = app.project.item(i);
    if (_isLyricsComp(it) && _isShortName(it.name) && _leadNum(it.name) === n) return it;
  }
  return null;
}
function importLyricsToMany(namesJSON, srtContent, optionsJSON) {
  var names; try { names = JSON.parse(namesJSON || '[]'); } catch (e) { names = []; }
  if (!names.length) return 'err:sin comps destino';
  var okc = 0, parts = [];
  for (var i = 0; i < names.length; i++) {
    if (!names[i]) continue;
    // Nov 2026 (Short por defecto): una "… Short Lyrics" que no existe se ignora sin aviso.
    if (_isShortName(names[i]) && !_findCompByNameCI(names[i]) && !_shortLyricsByNum(_leadNum(names[i]))) continue;
    var r = importLyricsToComp(names[i], srtContent, optionsJSON);
    if (String(r).indexOf('ok:') === 0) { okc++; parts.push(String(r).slice(3)); }
    else parts.push('ERR ' + names[i] + ': ' + String(r).replace(/^err:/, ''));
  }
  return okc ? ('ok:' + parts.join('  ·  ')) : ('err:' + parts.join('  ·  '));
}

// Descarga una URL con el curl del SISTEMA (Windows 10+ y macOS lo traen) a un archivo
// temporal PROPIO de esta peticion y devuelve 'ok:<ruta>' (+ '\n<url final>' en Mac).
// Fallback de red del panel cuando fetch/proxies fallan en CEP: curl usa el TLS real del
// sistema + user-agent de navegador (pasa Cloudflare).
// CADA llamada escribe a SU archivo (tag unico que manda el panel). Antes todas usaban
// 'verso_genius.html': con varios canales en cola, en Mac los callbacks de evalScript
// llegaban cuando la cola ya habia terminado y TODOS los canales leian el ultimo archivo
// descargado (= la misma letra en todos los canales).
function fetchGeniusToFile(url, tag) {
  try {
    url = String(url || '');
    if (!/^https?:\/\/[^\s"`$\\]+$/.test(url)) return 'err:bad url';
    tag = String(tag || '').replace(/[^A-Za-z0-9_\-]/g, '');
    if (!tag) tag = (new Date()).getTime() + '_' + Math.floor(Math.random() * 1000000);
    _cleanGeniusTemp();
    var f = new File(Folder.temp.fsName + '/verso_genius_' + tag + '.html');
    try { if (f.exists) f.remove(); } catch (e0) {}
    var eff = '';
    if (_isWin()) {
      var ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
      var cmd = 'curl -s -L --max-time 10 -A "' + ua + '" -o "' + f.fsName + '" "' + url + '"';
      // Ejecutar curl OCULTO: 'cmd.exe /c' abre una ventana de consola por cada llamada
      // (molesto en bulk). WScript.Shell.Run(cmd, 0, True) = ventana oculta + espera.
      var vbs = new File(Folder.temp.fsName + '/verso_fetch_' + tag + '.vbs');
      vbs.encoding = 'UTF-8';
      if (vbs.open('w')) {
        vbs.write('CreateObject("WScript.Shell").Run "cmd /c ' + cmd.replace(/"/g, '""') + '", 0, True');
        vbs.close();
        system.callSystem('wscript.exe //B //Nologo "' + vbs.fsName + '"');
        try { vbs.remove(); } catch (eV) {}
      } else {
        system.callSystem('cmd.exe /c ' + cmd);   // si no se puede escribir el shim, modo normal
      }
    } else {
      // macOS: /usr/bin/curl siempre existe (no depende del PATH de AE); --compressed baja
      // ~5x menos datos. Con -s y -o, stdout = solo la URL final (-w): el panel la usa para
      // aceptar redirecciones de Genius (link viejo → slug actual).
      var bin = (new File('/usr/bin/curl')).exists ? '/usr/bin/curl' : 'curl';
      var uaM = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
      eff = String(system.callSystem(bin + ' -s -L --compressed --max-time 12 -A "' + uaM + '"' +
        ' -H "Accept: text/html,application/xhtml+xml" -H "Accept-Language: en-US,en;q=0.9"' +
        ' -o "' + f.fsName + '" -w "%{url_effective}" "' + url + '"') || '').replace(/^\s+|\s+$/g, '');
      if (!/^https?:\/\//.test(eff)) eff = '';
    }
    if (!f.exists || f.length < 500) {
      try { if (f.exists) f.remove(); } catch (e1) {}
      return 'err:curl produced no output';
    }
    return 'ok:' + f.fsName + (eff ? '\n' + eff : '');
  } catch (e) { return 'err:' + e.toString(); }
}
// Compatibilidad con paneles anteriores: misma descarga (archivo unico), devuelve solo la ruta.
function fetchGeniusToTemp(url) {
  var r = fetchGeniusToFile(url, '');
  var nl = r.indexOf('\n');
  return nl >= 0 ? r.substring(0, nl) : r;
}
// Borra descargas de Genius de mas de 10 min que el panel no alcanzo a borrar.
function _cleanGeniusTemp() {
  try {
    var old = Folder.temp.getFiles('verso_genius_*.html'), now = (new Date()).getTime();
    for (var i = 0; i < old.length; i++) {
      try { if (old[i] instanceof File && now - old[i].modified.getTime() > 600000) old[i].remove(); } catch (e) {}
    }
  } catch (e2) {}
}

// Bulk (1 canal por llamada): importa la letra a su comp Lyrics SOLO si hace falta.
// Si la comp ya tiene capas SRT existentes se omite ('skip:<comp>'). El boton Bulk
// del panel encadena una llamada corta por canal (evalScript confiable, sin payloads
// gigantes). No abre las comps en el viewer para no interrumpir.
function bulkImportOne(lyrCompName, srtContent, optionsJSON) {
  try {
    var opt = {};
    try { opt = JSON.parse(optionsJSON || '{}'); } catch (e) {}
    var fadeIn   = opt.fadeIn  !== undefined ? +opt.fadeIn  : 0.3;
    var fadeOut  = opt.fadeOut !== undefined ? +opt.fadeOut : 0.3;
    var styleName = opt.styleLayerName || 'Style Controler';

    var comp = _findCompByNameCI(lyrCompName);
    if (!comp) {
      // Fallback CONSCIENTE del modo: para "… Short Lyrics" busca la Lyrics Short del canal,
      // no la de video (_lyricsCompByNum devolvia la primera = la de video).
      var wantShort = _isShortName(lyrCompName), nn = _leadNum(lyrCompName), qi;
      for (qi = 1; qi <= app.project.numItems && !comp; qi++) {
        var qt = app.project.item(qi);
        if (_isLyricsComp(qt) && _leadNum(qt.name) === nn && (_isShortName(qt.name) === wantShort)) comp = qt;
      }
    }
    if (!comp) return 'err:Comp "' + lyrCompName + '" not found';

    // Reimporta SIEMPRE, igual que el import individual: _buildLyricLayers ya borra las
    // capas SRT previas antes de reconstruir, así que reemplaza la letra existente en vez
    // de omitirla (antes se saltaba las comps que ya tenían SRT).

    var entries = _parseSRT(srtContent);
    if (!entries.length) return 'err:No valid subtitles';

    app.beginUndoGroup('Lyricator: Bulk import');
    var res = _buildLyricLayers(comp, entries, fadeIn, fadeOut, styleName, true, true);
    app.endUndoGroup();
    return 'ok:' + res.count;
  } catch (e) {
    try { app.endUndoGroup(); } catch (x) {}
    return 'err:' + e.message + (e.line ? ' (line ' + e.line + ')' : '');
  }
}

// Borra las capas de letra previas (nombre con "SRT") en la comp Lyrics indicada.
function clearLyricLayers(lyrCompName) {
  try {
    var comp = _findCompByNameCI(lyrCompName);
    if (!comp) comp = _lyricsCompByNum(_leadNum(lyrCompName));
    if (!comp) return 'ok:0';
    app.beginUndoGroup('Lyricator: Clear lyric layers');
    var removed = 0;
    for (var i = comp.numLayers; i >= 1; i--) {
      var l = comp.layer(i);
      if (/SRT/i.test(l.name)) { try { l.remove(); removed++; } catch (er) {} }
    }
    app.endUndoGroup();
    return 'ok:' + removed;
  } catch (e) {
    try { app.endUndoGroup(); } catch (x) {}
    return 'err:' + e.message;
  }
}

// Comps de Lyrics seleccionadas en el panel de proyecto (orden de panel).
function _selectedLyricsComps() {
  var out = [];
  for (var i = 1; i <= app.project.numItems; i++) {
    var it = app.project.item(i);
    if (_isLyricsComp(it) && it.selected) out.push(it);
  }
  return out;
}

// Lee el contenido de texto de un File.
function _readFile(f) {
  try { f.encoding = 'UTF-8'; if (!f.open('r')) return null; var c = f.read(); f.close(); return c; }
  catch (e) { return null; }
}

// Importa SRT en masa: pide archivos .srt y los aplica a las comps de Lyrics en orden.
//  - Si hay comps "… Lyrics" SELECCIONADAS en el panel, aplica solo a esas (en orden).
//  - Si no, aplica a TODAS las comps de Lyrics del proyecto (en orden).
//  - Multi-seleccion: ordena por fecha de creacion. 1 solo archivo: modo 1 por 1.
//  - Sin alertas; cada SRT crea la letra en su comp con el estilo "Style Controler".
// El valor de retorno de evalScript se PIERDE cuando la funcion abre un dialogo modal
// (el panel recibia cadena vacia -> "sin respuesta de AE"). Por eso el resultado se
// vuelca ademas a un archivo temporal que el panel lee con cep.fs, igual que ya se hace
// con fetchGeniusToTemp. _resultPath() devuelve la ruta para que el panel sepa donde leer.
function _resultPath() { return Folder.temp.fsName + '/verso_result.json'; }
// Lectura del volcado temporal en una segunda llamada CORTA: al no abrir ningun dialogo,
// evalScript SI devuelve el valor. Asi el panel recupera el resultado que se perdio.
// Borra el volcado anterior. El panel lo llama ANTES de cada accion para no leer un
// resultado viejo y para poder detectar cuando aparece el nuevo.
function _clearResult() {
  try { var f = new File(_resultPath()); if (f.exists) f.remove(); } catch (e) {}
  return 'ok';
}
function _readResultText() {
  try {
    var f = new File(_resultPath());
    if (!f.exists) return '';
    f.encoding = 'UTF-8';
    if (!f.open('r')) return '';
    var c = f.read(); f.close();
    return c || '';
  } catch (e) { return ''; }
}
// Igual que _writeResult pero para las funciones que devuelven texto plano ("ok:"/"err:").
// EMPUJA el resultado al panel con CSXSEvent. Es el mecanismo estandar de CEP para
// ExtendScript -> panel y NO depende del valor de retorno de evalScript, que se pierde
// cuando la funcion abrio un dialogo modal (causa de que las leyendas no aparecieran).
var _xLib = null;
function _notify(s) {
  try {
    if (!_xLib) _xLib = new ExternalObject('lib:PlugPlugExternalObject');
    var ev = new CSXSEvent();
    ev.type = 'com.leobledo.verso.result';
    ev.data = String(s);
    ev.dispatch();
  } catch (err) {}
}
function _writeRaw(s) {
  s = String(s);
  try {
    var f = new File(_resultPath());
    f.encoding = 'UTF-8';
    if (f.open('w')) { f.write(s); f.close(); }
  } catch (e) {}
  _notify(s);
  return s;
}
function _writeResult(obj) {
  var s = JSON.stringify(obj);
  try {
    var f = new File(_resultPath());
    f.encoding = 'UTF-8';
    if (f.open('w')) { f.write(s); f.close(); }
  } catch (e) {}
  _notify(s);
  return s;
}
// Nombre legible de un File (File.name viene codificado tipo URI: "01%20Artist…").
// Solo ASCII imprimible: el nombre viaja de vuelta al panel dentro del resultado.
function _fileDisplayName(f) {
  var s = '';
  try { s = decodeURI(f.name); } catch (e) { try { s = String(f.displayName || f.name); } catch (e2) { s = ''; } }
  return s.replace(/[^\x20-\x7E]/g, '');
}
// Importa SRT en masa. Cada .srt va a la Lyrics de SU canal segun el NUMERO al inicio del
// nombre del archivo ("01 Artist - Song.srt" -> canal 01). Ni el orden de seleccion ni la
// fecha de creacion de los archivos deciden nada: antes CM asignaba por fecha de creacion y
// el 01 caia en el 02, el 03 en el 01, etc.
//  - mapJSON (opcional, lo manda el panel): [{num:1, lyr:"01 DU Lyrics", shortLyr:"01 DU
//    Short Lyrics"}, ...] = el mapa de canales del panel. Manda sobre la busqueda por numero.
//  - Video: solo la Lyrics de VIDEO del canal.
//  - Short (isShort): la Lyrics de video Y la "… Short Lyrics" del canal (2 por 1). En la
//    Short solo se reescriben las capas SRT: ni duracion, ni rango, ni otras capas.
//  - Comps "… Lyrics" seleccionadas en el panel de Proyecto: limita a esos canales.
//  - Archivo SIN numero: va al siguiente canal libre, en orden de canal.
// El valor de retorno de evalScript se PIERDE cuando la funcion abre un dialogo modal, por
// eso el resultado tambien se vuelca a un temporal + evento (ver _writeResult).
function importSRTBatch(isShort, mapJSON) {
  try {
    _clearResult();   // volcado limpio: el panel sondea hasta que aparezca el nuevo
    isShort = (isShort === true || isShort === 'true');
    var panelMap = {}, pm = [], pi, key;
    try { pm = JSON.parse(mapJSON || '[]') || []; } catch (eM) { pm = []; }
    for (pi = 0; pi < pm.length; pi++) if (pm[pi] && pm[pi].num != null && !isNaN(+pm[pi].num)) panelMap[+pm[pi].num] = pm[pi];

    // Lyrics de VIDEO por numero de canal: 1) el nombre que usa el panel; 2) "NN XX Lyrics";
    // 3) la primera Lyrics de video con ese numero (orden del proyecto).
    var byNum = {}, nums = [], i, it, n, exact;
    for (i = 1; i <= app.project.numItems; i++) {
      it = app.project.item(i);
      if (!(it instanceof CompItem) || !/lyrics/i.test(it.name) || _isShortName(it.name)) continue;
      n = _leadNum(it.name); if (n == null) continue;
      exact = /^\s*\d+\s+\S+\s+Lyrics\s*$/i.test(it.name);
      if (!byNum[n]) { byNum[n] = { comp: it, exact: exact }; nums.push(n); }
      else if (exact && !byNum[n].exact) byNum[n] = { comp: it, exact: exact };
    }
    for (key in panelMap) {
      if (!panelMap.hasOwnProperty(key)) continue;
      var pc = _findCompByNameCI(panelMap[key].lyr);
      if (pc && /lyrics/i.test(pc.name) && !_isShortName(pc.name)) {
        if (!byNum[key]) nums.push(+key);
        byNum[key] = { comp: pc, exact: true };
      }
    }
    nums.sort(function (a, b) { return a - b; });

    // Lyrics seleccionadas en el panel de Proyecto (video o Short) = limitar a esos canales.
    var sel = _selectedLyricsComps(), allow = null, anyAllowed = false;
    if (sel.length) {
      allow = {};
      for (i = 0; i < sel.length; i++) { n = _leadNum(sel[i].name); if (n != null) allow[n] = true; }
      for (i = 0; i < nums.length; i++) if (allow[nums[i]]) anyAllowed = true;
      if (!anyAllowed) allow = null;
    }
    var targets = [];
    for (i = 0; i < nums.length; i++) if (!allow || allow[nums[i]]) targets.push(nums[i]);
    if (!targets.length) return _writeResult({ ok: false, msg: 'No hay comps de Lyrics de video en el proyecto' });

    Folder.current = Folder.desktop;
    var raw = File.openDialog('Select the SRT files (' + targets.length + ' Lyrics comp(s))', _SRT_FILTER(), true);
    if (!raw) return _writeResult({ ok: false, msg: 'Cancelado' });
    var files = (raw instanceof Array) ? raw : [raw];
    if (files.length === 0) return _writeResult({ ok: false, msg: 'Sin archivos' });

    if (files.length === 1) {
      var slots = targets.length;
      for (var s = 1; s < slots; s++) {
        try { Folder.current = files[files.length - 1].parent; } catch (e) {}
        var next = File.openDialog('SRT ' + (s + 1) + ' of ' + slots + '  —  Cancel to stop here', _SRT_FILTER(), false);
        if (!next) break;
        files.push(next);
      }
    } else {
      // Solo importa para archivos SIN numero (y para que, si un numero se repite, gane el mas reciente).
      files.sort(function (a, b) { return (a.created || new Date(0)).valueOf() - (b.created || new Date(0)).valueOf(); });
    }

    // 1) archivos CON numero -> su canal. 2) archivos SIN numero -> canales libres, en orden.
    var useFile = {}, pending = [], missed = [], j, fname, fnum, okTarget = {};
    for (i = 0; i < targets.length; i++) okTarget[targets[i]] = true;
    for (j = 0; j < files.length; j++) {
      fname = _fileDisplayName(files[j]);
      fnum = _leadNum(fname);
      if (fnum == null) { pending.push(files[j]); continue; }
      if (!okTarget[fnum]) {
        missed.push('"' + fname + '": ' + (byNum[fnum] ? 'canal no seleccionado' : 'no hay Lyrics ' + _zeroPad(fnum, 2)));
        continue;
      }
      if (useFile[fnum]) missed.push('canal ' + _zeroPad(fnum, 2) + ' repetido: se uso "' + fname + '"');
      useFile[fnum] = files[j];
    }
    var t = 0;
    for (j = 0; j < pending.length; j++) {
      while (t < targets.length && useFile[targets[t]]) t++;
      if (t >= targets.length) { missed.push('"' + _fileDisplayName(pending[j]) + '": sin canal libre'); continue; }
      useFile[targets[t]] = pending[j]; t++;
    }

    // Trabajos en orden de canal: Lyrics de video (+ su Short Lyrics en modo SHORTS).
    var jobs = [];
    for (i = 0; i < targets.length; i++) {
      n = targets[i];
      if (!useFile[n]) continue;
      var vcomp = byNum[n].comp;
      jobs.push({ comp: vcomp, file: useFile[n], kind: 'video', num: n });
      if (isShort) {
        var tw = null;
        if (panelMap[n] && panelMap[n].shortLyr) tw = _findCompByNameCI(panelMap[n].shortLyr);
        if (tw && !(_isShortName(tw.name) && /lyrics/i.test(tw.name))) tw = null;
        if (!tw) tw = _shortTwinByName(vcomp);
        if (tw) jobs.push({ comp: tw, file: useFile[n], kind: 'short', num: n });   // sin Short Lyrics: se ignora
      }
    }

    app.beginUndoGroup('Lyricator: Import SRT batch');
    var applied = 0, shortApplied = 0, totalLayers = 0, done = [], jc;
    for (jc = 0; jc < jobs.length; jc++) {
      var job = jobs[jc];
      var content = _readFile(job.file);
      if (content === null) { missed.push(job.comp.name + ': no se pudo leer el .srt'); continue; }
      var entries = _parseSRT(content);
      if (!entries.length) { missed.push(job.comp.name + ': SRT sin subtitulos'); continue; }
      try {
        var r = _buildLyricLayers(job.comp, entries, 0.3, 0.3, 'Style Controler', true, true);
        totalLayers += r.count;
        if (job.kind === 'short') shortApplied++;
        else { applied++; done.push(_zeroPad(job.num, 2) + ' -> ' + job.comp.name); }
      } catch (eB) { missed.push(job.comp.name + ': ' + (eB.message || eB.toString())); }
    }
    app.endUndoGroup();
    /* openInViewer omitido: quedarse en el panel tras importar SRT */
    return _writeResult({ ok: true, applied: applied, total: files.length, layers: totalLayers,
      shortApplied: shortApplied, done: done.join(', '), missed: missed.join(' | ') });
  } catch (e) {
    try { app.endUndoGroup(); } catch (x) {}
    return _writeResult({ ok: false, msg: e.toString() });
  }
}

// Borra TODAS las capas con "SRT" en el nombre, en TODAS las comps del proyecto.
function clearAllLyricLayers(isShort) {
  try {
    isShort = (isShort === true || isShort === 'true');
    app.beginUndoGroup('Lyricator: Clear ALL SRT layers');
    var removed = 0, comps = 0;
    for (var i = 1; i <= app.project.numItems; i++) {
      var it = app.project.item(i);
      if (!(it instanceof CompItem)) continue;
      if (it.name.toLowerCase().indexOf('lyrics') === -1) continue;
      if (!isShort && _isShortName(it.name)) continue;   // false: solo video; true (Short, nov 2026): video Y Short
      var touched = false;
      for (var l = it.numLayers; l >= 1; l--) {
        var ly = it.layer(l);
        if (/SRT/i.test(ly.name)) { try { ly.remove(); removed++; touched = true; } catch (er) {} }
      }
      if (touched) comps++;
    }
    app.endUndoGroup();
    return JSON.stringify({ ok: true, removed: removed, comps: comps });
  } catch (e) {
    try { app.endUndoGroup(); } catch (x) {}
    return JSON.stringify({ ok: false, msg: e.toString() });
  }
}

// Actualiza las capas de texto "Artist" / "Song" de la comp TH indicada (por nombre).
function updateThumbnailComp(thCompName, artist, song) {
  try {
    var comp = _findCompByNameCI(thCompName);
    if (!comp) {
      // Fallback CONSCIENTE del modo: para "… Short TH" busca la TH Short del canal, no la
      // de video. (_thCompByNum devolvia la primera TH del numero = la de video, por eso la
      // Short TH nunca se actualizaba.)
      var wantShort = _isShortName(thCompName), nn = _leadNum(thCompName), qi;
      for (qi = 1; qi <= app.project.numItems && !comp; qi++) {
        var qt = app.project.item(qi);
        if (qt instanceof CompItem && isTHComp(qt) && _leadNum(qt.name) === nn && (_isShortName(qt.name) === wantShort)) comp = qt;
      }
    }
    if (!comp) return _writeRaw('err:TH comp "' + thCompName + '" not found.');
    app.beginUndoGroup('Lyricator: Update thumbnail');
    var setA = _setTextLayer(comp, 'Artist', artist);
    var setS = _setTextLayer(comp, 'Song', song);
    app.endUndoGroup();
    if (!setA && !setS) return _writeRaw('err:No "Artist" / "Song" layers found in "' + comp.name + '".');
    return _writeRaw('ok:' + comp.name);
  } catch (e) {
    try { app.endUndoGroup(); } catch (x) {}
    return _writeRaw('err:' + e.message);
  }
}

// Modo SHORTS: actualiza la TH de video Y la "… Short TH" con el mismo titulo. shortName
// vacio = solo la de video. Devuelve el valor directo (no via _writeRaw: no es op de dialogo).
function updateThumbnailBoth(thName, shortName, artist, song) {
  var r1 = updateThumbnailComp(thName, artist, song);
  var okc = (String(r1).indexOf('ok:') === 0) ? 1 : 0, names = okc ? String(r1).slice(3) : '';
  if (shortName && shortName !== '') {
    var r2 = updateThumbnailComp(shortName, artist, song);
    if (String(r2).indexOf('ok:') === 0) { okc++; names += (names ? ' + ' : '') + String(r2).slice(3); }
  }
  return okc ? ('ok:' + names) : String(r1);
}
// Update ALL thumbnails at once. dataJSON = [{th, artist, song}, ...].
function updateAllThumbnails(dataJSON) {
  try {
    var arr = JSON.parse(dataJSON || '[]');
    app.beginUndoGroup('Lyricator: Update all thumbnails');
    var updated = 0;
    for (var k = 0; k < arr.length; k++) {
      var d = arr[k];
      var comp = _findCompByNameCI(d.th); if (!comp) comp = _thCompByNum(_leadNum(d.th));
      if (!comp) continue;
      var a = _setTextLayer(comp, 'Artist', d.artist);
      var s = _setTextLayer(comp, 'Song', d.song);
      if (a || s) updated++;
    }
    app.endUndoGroup();
    return JSON.stringify({ ok: true, updated: updated, total: arr.length });
  } catch (e) {
    try { app.endUndoGroup(); } catch (x) {}
    return JSON.stringify({ ok: false, msg: e.toString() });
  }
}

function _setTextLayer(comp, layerName, text) {
  var want = layerName.toLowerCase().replace(/^\s+|\s+$/g, '');
  var exact = null, partial = null;
  for (var i = 1; i <= comp.numLayers; i++) {
    var l = comp.layer(i);
    if (!(l instanceof TextLayer)) continue;
    var ln = l.name.toLowerCase().replace(/^\s+|\s+$/g, '');
    if (ln === want) { exact = l; break; }
    if (!partial && (ln.indexOf(want) !== -1 || want.indexOf(ln) !== -1)) partial = l;
  }
  var found = exact || partial;
  if (!found) return false;
  try {
    var sp = found.property('ADBE Text Properties').property('ADBE Text Document');
    var doc = sp.value;
    doc.text = String(text || '');
    sp.setValue(doc);
    return true;
  } catch (er) { return false; }
}

// Genera una previa PNG del frame de la comp TH indicada (por nombre) y devuelve su ruta.
function getThumbnailPreviewComp(thCompName) {
  try {
    var comp = _findCompByNameCI(thCompName);
    if (!comp) comp = _thCompByNum(_leadNum(thCompName));
    if (!comp) return JSON.stringify({ ok: false, msg: 'Sin TH' });
    var out = new File(Folder.temp.fsName + '/lyricator_th_' + (new Date()).getTime() + '.png');
    try { comp.saveFrameToPng(comp.workAreaStart || 0, out); }
    catch (e) { return JSON.stringify({ ok: false, msg: 'saveFrameToPng no disponible' }); }
    if (!out.exists) return JSON.stringify({ ok: false, msg: 'No se genero la previa' });
    return JSON.stringify({ ok: true, path: out.fsName });
  } catch (e) {
    return JSON.stringify({ ok: false, msg: e.toString() });
  }
}
