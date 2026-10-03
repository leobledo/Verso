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
    var lyricsBySuffix = !!opt.lyricsBySuffix;   // Verso: target the comp containing "Lyrics"
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
    // Verso single-channel: SIEMPRE apuntar a la comp que contiene "Lyrics".
    if (lyricsBySuffix) {
      comp = _anyCompBySuffix('lyrics');
    }
    if (!comp) {
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

    try { comp.openInViewer(); } catch (er) {}

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

// Verso 2: detecta la capa de estilo y su MODO.
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

function isTHComp(item) {
  return (/ TH$/i.test(item.name) || item.label === 1);
}

// Comps "main / generales" en orden de panel (label naranja, o con audio, o justo
// encima de una TH). Excluye lyrics y TH.
function getGeneralComps() {
  // Mapa de nombres base de las TH ("01 Nightclub Nostalgia TH" -> "01 nightclub nostalgia")
  // para detectar la main correspondiente por NOMBRE, sin depender del orden ni del label.
  var thBase = {};
  for (var ti = 1; ti <= app.project.numItems; ti++) {
    var t = app.project.item(ti);
    if (t instanceof CompItem && isTHComp(t)) {
      thBase[t.name.replace(/\s*TH\s*$/i, '').toLowerCase().replace(/^\s+|\s+$/g, '')] = true;
    }
  }

  var comps = [], seen = {};
  for (var i = 1; i <= app.project.numItems; i++) {
    var item = app.project.item(i);
    if (!(item instanceof CompItem)) continue;
    if (item.name.toLowerCase().indexOf('lyrics') !== -1) continue;
    if (isTHComp(item)) continue;

    var isMain = false;
    // 1. existe una TH con su mismo nombre base  -> es su main (lo mas fiable aqui)
    if (thBase[item.name.toLowerCase().replace(/^\s+|\s+$/g, '')]) isMain = true;
    // 2. label naranja / verde
    if (!isMain && (item.label === 9 || item.label === 11)) isMain = true;
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

// Todas las comps de lyrics en orden de panel.
function _allLyricsComps() {
  var out = [];
  for (var i = 1; i <= app.project.numItems; i++) {
    var it = app.project.item(i);
    if (it instanceof CompItem && it.name.toLowerCase().indexOf('lyrics') !== -1) out.push(it);
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

// Todos los footage "Song" en orden de panel. Excluye "Short Song": este listado alimenta
// SIEMPRE el Master de video (Short tiene su propio loadShortSongFile/_findShortSongFootage);
// sin la exclusion, si "Short Song" aparecia antes que "Song" en el panel, el audio nuevo se
// cargaba ahi y la Song normal nunca se actualizaba.
function getSongItems() {
  var items = [];
  for (var i = 1; i <= app.project.numItems; i++) {
    var item = app.project.item(i);
    if (item instanceof FootageItem && item.name.toLowerCase().indexOf('song') !== -1 && !/\bshort\b/i.test(item.name)) {
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

function getRelatedLyricsComps(selectedGeneralComps) {
  var allGeneral = getGeneralComps();
  var allLyrics  = _allLyricsComps();
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

function getSongItemInComp(comp) {
  for (var i = 1; i <= comp.numLayers; i++) {
    var src = comp.layer(i).source;
    if (src instanceof FootageItem && src.name.toLowerCase().indexOf('song') !== -1 && !/\bshort\b/i.test(src.name)) return src;
  }
  return null;
}

// ── Lyric cleaner (recorta keyframes despues de la ultima frontera de grupo) ──
function cleanLyricComp(comp) {
  var targetLayer = null;
  for (var l = 1; l <= comp.numLayers; l++) {
    if (comp.layer(l).name === 'Lyric') { targetLayer = comp.layer(l); break; }
  }
  if (!targetLayer) {
    for (var l2 = 1; l2 <= comp.numLayers; l2++) {
      try { if (comp.layer(l2) instanceof TextLayer) { targetLayer = comp.layer(l2); break; } } catch (e) {}
    }
  }
  if (!targetLayer) return false;
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

// ── Master: reemplaza audios (dialogo) + limpia lyrics + ajusta rangos ──
function masterRun() {
  try {
    _clearResult();   // volcado limpio: el panel sondea hasta que aparezca el nuevo
    var selectedComps = getSelectedGeneralCompsByPanelOrder();
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
      var totalSlots = limitToSelected ? selectedComps.length : getSongItems().length;
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

    var count = 0, replaced = 0;
    app.beginUndoGroup('Lyricator: Master');

    if (limitToSelected) {
      count = Math.min(selectedComps.length, files.length);
      for (var j = 0; j < count; j++) {
        var songItem = getSongItemInComp(selectedComps[j]);
        if (songItem) { try { songItem.replace(files[j]); replaced++; } catch (e) {} }
      }
    } else {
      var songs = getSongItems();
      count = Math.min(songs.length, files.length);
      for (var j2 = 0; j2 < count; j2++) { try { songs[j2].footage.replace(files[j2]); replaced++; } catch (e) {} }
    }

    if (replaced === 0) { try { app.endUndoGroup(); } catch (ue) {} return _writeResult({ ok: false, step: 'replace', msg: 'No audio could be replaced' }); }

    var lyricsComps = limitToSelected ? getRelatedLyricsComps(selectedComps) : _allLyricsComps();
    var lyricsCleaned = 0;
    for (var lc = 0; lc < lyricsComps.length; lc++) if (cleanLyricComp(lyricsComps[lc])) lyricsCleaned++;

    // Borrar las capas SRT (incl. "SRT Frame") AQUI DENTRO. Antes lo hacia el panel en una
    // segunda llamada, pero masterRun abre un dialogo modal y evalScript pierde el retorno:
    // el panel cortaba en el JSON.parse fallido y ese paso NUNCA llegaba a ejecutarse.
    var srtRemoved = 0;
    for (var sc = 0; sc < lyricsComps.length; sc++) {
      var lcomp = lyricsComps[sc];
      for (var lz = lcomp.numLayers; lz >= 1; lz--) {
        try { var lyz = lcomp.layer(lz); if (/SRT/i.test(lyz.name)) { lyz.remove(); srtRemoved++; } } catch (er) {}
      }
    }

    var rangeComps = limitToSelected ? selectedComps : getGeneralComps();
    var rangeUpdated = 0, rangeSkipped = 0;
    for (var rc = 0; rc < rangeComps.length; rc++) { if (adjustRangeComp(rangeComps[rc])) rangeUpdated++; else rangeSkipped++; }

    // Collect new file paths for every Song item (post-replacement).
    var songResults = [];
    var allSongs = getSongItems();
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

// ── Render: encola TH (JPEG) + main (H.264) en el Render Queue ──
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
      for (var i = 0; i < selected.length; i++) { if (isTHComp(selected[i])) thComps.push(selected[i]); else mainComps.push(selected[i]); }
    } else if (!isShort) {
      // VIDEO: TH roja + main naranja. Nunca Lyrics.
      for (var i2 = 1; i2 <= app.project.numItems; i2++) {
        var item = app.project.item(i2);
        if (!(item instanceof CompItem)) continue;
        if (item.name.toLowerCase().indexOf('lyrics') !== -1) continue;   // nunca a render
        if (isTHComp(item)) thComps.push(item);
        else if (item.label === 9 || item.label === 11) mainComps.push(item);
      }
    } else {
      // SHORT: TH roja (se reusa la de video, no hay "Short TH") + main naranja de video +
      // la comp "Short" (amarilla). Antes solo se mandaba el Short — faltaban TH y video.
      for (var i3 = 1; i3 <= app.project.numItems; i3++) {
        var it3 = app.project.item(i3);
        if (!(it3 instanceof CompItem)) continue;
        if (it3.name.toLowerCase().indexOf('lyrics') !== -1) continue;
        if (isTHComp(it3)) thComps.push(it3);
        else if (it3.label === 9 || it3.label === 11) mainComps.push(it3);
      }
      var shortComp = _shortComp();
      if (shortComp) mainComps.push(shortComp);
    }
    if (thComps.length === 0 && mainComps.length === 0)
      return _writeResult({ ok: false, msg: 'No ' + (isShort ? 'Short ' : '') + 'compositions detected.\nSelect comps in the panel\nor use a red (TH) / orange (main) / yellow (Short) label.' });

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
    return _writeResult({ ok: true, added: added, thCount: thComps.length, mainCount: mainComps.length, mode: sendToAME ? 'AME' : 'AE', tmplWarning: tmplWarning, jpegTpl: usedJpeg });
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

// Verso single-channel: devuelve la PRIMERA comp cuyo nombre contiene el sufijo
// (ej. "lyrics"). Solo hay una de cada en un proyecto de un canal.
function _anyCompBySuffix(suffix) {
  var want = ('' + suffix).toLowerCase();
  for (var i = 1; i <= app.project.numItems; i++) {
    var it = app.project.item(i);
    if (it instanceof CompItem && it.name.toLowerCase().indexOf(want) !== -1) return it;
  }
  return null;
}

// Verso single-channel: la PRIMERA comp TH del proyecto (termina en " TH" o label rojo).
function _anyTHComp() {
  for (var i = 1; i <= app.project.numItems; i++) {
    var it = app.project.item(i);
    if (it instanceof CompItem && isTHComp(it)) return it;
  }
  return null;
}

// Verso 2: la comp SELECCIONADA en el panel de Proyecto (para romper el orden por
// defecto y trabajar ESE canal). Prioriza la seleccion; luego la comp activa.
function _selComp() {
  var sel = app.project.selection || [];
  for (var i = 0; i < sel.length; i++) if (sel[i] instanceof CompItem) return sel[i];
  var a = app.project.activeItem;
  if (a && (a instanceof CompItem)) return a;
  return null;
}

// La footage de audio "Song" objetivo, respetando la seleccion del panel:
//  1) una footage de audio "…Song" seleccionada; 2) el audio dentro de la comp
//  seleccionada; 3) la "NN …Song" del numero de esa comp; 4) la primera "…Song".
// VIDEO song footage only: contains "song" but NOT "short" (the Short Song is handled
// separately by loadShortSongFile). This keeps the Video Master from touching Short Song.
function _isVideoSong(it) {
  if (!(it instanceof FootageItem)) return false;
  var n = it.name.toLowerCase();
  return n.indexOf('song') !== -1 && n.indexOf('short') === -1;
}
// Audio dentro de una comp, recorriendo tambien las precomps anidadas.
//  strict=true  -> solo footage "…Song" de video (_isVideoSong)
//  strict=false -> cualquier footage con audio
function _songInCompV(comp, depth, strict) {
  if (!comp || depth > 4) return null;
  var i, src;
  for (i = 1; i <= comp.numLayers; i++) {
    src = null; try { src = comp.layer(i).source; } catch (e) { continue; }
    if (!(src instanceof FootageItem) || !src.hasAudio) continue;
    if (!strict || _isVideoSong(src)) return src;
  }
  for (i = 1; i <= comp.numLayers; i++) {
    src = null; try { src = comp.layer(i).source; } catch (e2) { continue; }
    if (src instanceof CompItem) {
      var f = _songInCompV(src, depth + 1, strict);
      if (f) return f;
    }
  }
  return null;
}
function _pickSongFootage(selComp) {
  var sel = app.project.selection || [];
  for (var i = 0; i < sel.length; i++) {
    if (sel[i] instanceof FootageItem && sel[i].hasAudio && _isVideoSong(sel[i])) return sel[i];
  }
  if (selComp) {
    // Recursivo: el audio puede vivir dentro de una precomp de la comp "main" — mirar solo
    // las capas de primer nivel hacia que cayera al fallback global (cancion equivocada).
    var inComp = _songInCompV(selComp, 0, true);
    if (inComp) return inComp;
    var n = _leadNum(selComp.name);
    if (n != null) {
      for (var k = 1; k <= app.project.numItems; k++) {
        var ft = app.project.item(k);
        if (_isVideoSong(ft) && _leadNum(ft.name) === n) return ft;
      }
    }
    // Ultimo recurso DENTRO de la comp seleccionada: cualquier audio, aunque no se
    // llame "…Song". Preferible a tocar la cancion de otro canal.
    var anyIn = _songInCompV(selComp, 0, false);
    if (anyIn) return anyIn;
  }
  for (var m = 1; m <= app.project.numItems; m++) {
    if (_isVideoSong(app.project.item(m))) return app.project.item(m);
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

// Verso single-channel: abre un dialogo para elegir una NUEVA cancion y reemplaza la
// footage "Song" del proyecto con ese archivo (o la importa si no existe). Devuelve la ruta.
function loadSingleSongFile() {
  try {
    _clearResult();   // volcado limpio: el panel sondea hasta que aparezca el nuevo
    Folder.current = Folder.desktop;
    var f = File.openDialog('Select the song audio file',
      _AUDIO_FILTER(), false);
    if (!f) return _writeResult({ ok: false, msg: 'Cancelled' });

    // Respetar la comp seleccionada en el panel de Proyecto (romper el orden por defecto).
    var selComp = _selComp();
    var selN = selComp ? _leadNum(selComp.name) : null;   // numero del canal seleccionado (o null)
    var song = _pickSongFootage(selComp);

    app.beginUndoGroup('Verso: Load song');
    if (song) {
      try { song.replace(f); }
      catch (e) { app.endUndoGroup(); return _writeResult({ ok: false, msg: 'No se pudo reemplazar: ' + e.toString() }); }
    } else {
      // No hay footage "Song": importar el archivo como footage nueva llamada "Song".
      try {
        var io = new ImportOptions(f);
        song = app.project.importFile(io);
        try { song.name = 'Song'; } catch (e2) {}
      } catch (e3) { app.endUndoGroup(); return _writeResult({ ok: false, msg: 'No se pudo importar: ' + e3.toString() }); }
    }

    // ── Como el Master, pero para este 1 canal ──
    // 1) Ajustar el rango de la comp a la NUEVA cancion + alinear el Outro.
    var rangeUpdated = 0;
    var gcomps = getGeneralComps();
    for (var g = 0; g < gcomps.length; g++) {
      var gc = gcomps[g];
      if (selN != null && _leadNum(gc.name) !== selN) continue;   // solo el canal seleccionado
      // extender la capa de audio a la duracion completa de la nueva cancion
      for (var al = 1; al <= gc.numLayers; al++) {
        var L = gc.layer(al);
        if (L.hasAudio && L.source instanceof FootageItem) {
          try { L.outPoint = L.startTime + L.source.duration; } catch (eX) {}
          break;
        }
      }
      if (adjustRangeComp(gc)) rangeUpdated++;   // work area = audio, mueve Outro al final
    }

    // 2) Eliminar las capas SRT que ya existian (en todas las comps).
    var removed = 0;
    for (var ci = 1; ci <= app.project.numItems; ci++) {
      var it2 = app.project.item(ci);
      if (!(it2 instanceof CompItem)) continue;
      if (selN != null && _leadNum(it2.name) !== selN) continue;   // solo el canal seleccionado
      for (var l2 = it2.numLayers; l2 >= 1; l2--) {
        var ly2 = it2.layer(l2);
        if (/SRT/i.test(ly2.name)) { try { ly2.remove(); removed++; } catch (eR) {} }
      }
    }

    app.endUndoGroup();

    var p = _footagePath(song);
    if (!p) return _writeResult({ ok: false, msg: 'La cancion no tiene archivo en disco' });
    return _writeResult({ ok: true, path: p, name: song.name, rangeUpdated: rangeUpdated, removed: removed });
  } catch (e) {
    try { app.endUndoGroup(); } catch (x) {}
    return _writeResult({ ok: false, msg: e.toString() });
  }
}

// ── Verso 2 SHORT helpers ──────────────────────────────────────────────────────
// La comp "Short" (la que se renderiza / lleva la thumbnail): preferir el nombre
// exacto; si no, la primera comp con "short" que NO sea lyrics ni TH.
function _shortComp() {
  var exact = _findCompByNameCI('Short');
  if (exact) return exact;
  for (var i = 1; i <= app.project.numItems; i++) {
    var it = app.project.item(i);
    if (it instanceof CompItem && !isTHComp(it)) {
      var n = it.name.toLowerCase();
      if (n.indexOf('short') !== -1 && n.indexOf('lyrics') === -1) return it;
    }
  }
  return null;
}
// La comp "Short Lyrics" (destino de la importacion de letras en modo Short).
function _shortLyricsComp() {
  var exact = _findCompByNameCI('Short Lyrics');
  if (exact) return exact;
  for (var i = 1; i <= app.project.numItems; i++) {
    var it = app.project.item(i);
    if (it instanceof CompItem) {
      var n = it.name.toLowerCase();
      if (n.indexOf('short') !== -1 && n.indexOf('lyrics') !== -1) return it;
    }
  }
  return null;
}
// La comp "Short TH" (miniatura propia del short, separada de "Short"). _shortComp()
// NUNCA la encuentra: como existe una comp exacta "Short", devuelve esa de inmediato y
// jamas mira "Short TH". Aqui buscamos especificamente una TH (isTHComp) con "short" en
// el nombre.
function _shortTHComp() {
  var exact = _findCompByNameCI('Short TH');
  if (exact) return exact;
  for (var i = 1; i <= app.project.numItems; i++) {
    var it = app.project.item(i);
    if (it instanceof CompItem && isTHComp(it) && /\bshort\b/i.test(it.name)) return it;
  }
  return null;
}
// La footage "Short Song": preferir el nombre exacto; si no, la primera footage
// cuyo nombre contiene "short" y "song".
function _findShortSongFootage() {
  var exact = _findFootageByNameCI('Short Song');
  if (exact) return exact;
  for (var i = 1; i <= app.project.numItems; i++) {
    var it = app.project.item(i);
    if (it instanceof FootageItem) {
      var n = it.name.toLowerCase();
      if (n.indexOf('short') !== -1 && n.indexOf('song') !== -1) return it;
    }
  }
  return null;
}

// Verso 2 — Master "Short": elige una NUEVA cancion y reemplaza la footage
// "Short Song" (o la importa si no existe). Ademas ajusta el rango de la comp
// "Short" a la nueva cancion y elimina sus capas SRT previas. Espejo de
// loadSingleSongFile pero apuntando al par Short Song / comp "Short".
// "2 por 1": la seccion de Short SIEMPRE actualiza tambien el lado de video con el MISMO
// archivo elegido (una sola vez se pide el archivo) — antes solo tocaba "Short Song"/"Short",
// dejando "Song"/el video largo sin actualizar cuando se trabajaba desde la seccion Short.
function loadShortSongFile() {
  try {
    _clearResult();   // volcado limpio: el panel sondea hasta que aparezca el nuevo
    Folder.current = Folder.desktop;
    var f = File.openDialog('Select the song audio file',
      _AUDIO_FILTER(), false);
    if (!f) return _writeResult({ ok: false, msg: 'Cancelled' });

    app.beginUndoGroup('Verso: Load song (Short + Video)');

    // ── Lado SHORT ──
    var song = _findShortSongFootage();
    if (song) {
      try { song.replace(f); }
      catch (e) { app.endUndoGroup(); return _writeResult({ ok: false, msg: 'No se pudo reemplazar (Short): ' + e.toString() }); }
    } else {
      try {
        var io = new ImportOptions(f);
        song = app.project.importFile(io);
        try { song.name = 'Short Song'; } catch (e2) {}
      } catch (e3) { app.endUndoGroup(); return _writeResult({ ok: false, msg: 'No se pudo importar (Short): ' + e3.toString() }); }
    }

    var shortComp = _shortComp();
    var rangeUpdated = 0;
    if (shortComp) {
      for (var al = 1; al <= shortComp.numLayers; al++) {
        var L = shortComp.layer(al);
        if (L.hasAudio && L.source instanceof FootageItem) {
          try { L.outPoint = L.startTime + L.source.duration; } catch (eX) {}
          break;
        }
      }
      if (adjustRangeComp(shortComp)) rangeUpdated++;
    }

    var removed = 0;
    var srtComps = [shortComp, _shortLyricsComp()];

    // ── Lado VIDEO (mismo archivo f) ──
    var videoSong = _pickSongFootage(null);
    if (videoSong) {
      try { videoSong.replace(f); } catch (eV) {}
    } else {
      try {
        var io2 = new ImportOptions(f);
        videoSong = app.project.importFile(io2);
        try { videoSong.name = 'Song'; } catch (e2b) {}
      } catch (e3b) {}
    }
    var gcomps = getGeneralComps();
    for (var g = 0; g < gcomps.length; g++) {
      var gc = gcomps[g];
      for (var alv = 1; alv <= gc.numLayers; alv++) {
        var Lv = gc.layer(alv);
        if (Lv.hasAudio && Lv.source instanceof FootageItem) {
          try { Lv.outPoint = Lv.startTime + Lv.source.duration; } catch (eXv) {}
          break;
        }
      }
      if (adjustRangeComp(gc)) rangeUpdated++;
      srtComps.push(gc);
    }
    var vLyrics = _anyCompBySuffix('lyrics');
    if (vLyrics && !/\bshort\b/i.test(vLyrics.name)) srtComps.push(vLyrics);

    // ── Eliminar SRT viejos en ambos lados ──
    for (var sc = 0; sc < srtComps.length; sc++) {
      var scomp = srtComps[sc];
      if (!scomp) continue;
      for (var l2 = scomp.numLayers; l2 >= 1; l2--) {
        var ly2 = scomp.layer(l2);
        if (/SRT/i.test(ly2.name)) { try { ly2.remove(); removed++; } catch (eR) {} }
      }
    }

    app.endUndoGroup();

    var p = _footagePath(song);
    if (!p) return _writeResult({ ok: false, msg: 'La cancion no tiene archivo en disco' });
    return _writeResult({ ok: true, path: p, name: song.name, rangeUpdated: rangeUpdated, removed: removed });
  } catch (e) {
    try { app.endUndoGroup(); } catch (x) {}
    return _writeResult({ ok: false, msg: e.toString() });
  }
}

// Verso 2: abre un dialogo para elegir un archivo .srt externo y devuelve su contenido.
// Abre el .srt E IMPORTA en UNA sola llamada. Antes el contenido viajaba a ExtendScript
// -> panel -> ExtendScript (JSON.stringify dos veces): los caracteres no-ASCII de las
// letras rompian el puente de CEP y evalScript devolvia vacio ("No response"). Aqui el
// texto NUNCA cruza el puente; solo van el nombre de la comp y las opciones (ASCII).
function importSrtFileToComp(lyrCompName, optionsJSON, isShort) {
  try {
    _clearResult();   // volcado limpio: el panel sondea hasta que aparezca el nuevo
    Folder.current = Folder.desktop;
    var f = File.openDialog('Select the .srt file', _SRT_FILTER(), false);
    if (!f) return _writeRaw('cancel:');
    f.encoding = 'UTF-8';
    if (!f.open('r')) return _writeRaw('err:No se pudo abrir el archivo');
    var content = f.read();
    f.close();
    if (!content) return _writeRaw('err:Archivo vacio');
    // "2 por 1": desde Short el .srt va a AMBAS (Lyrics + Short Lyrics); desde Video, solo Lyrics.
    if (isShort === true || isShort === 'true') return _writeRaw(importLyricsToBoth(lyrCompName, content, optionsJSON));
    return _writeRaw(importLyricsToComp(lyrCompName, content, optionsJSON));
  } catch (e) {
    return _writeRaw('err:' + e.toString());
  }
}
function readSrtFile() {
  try {
    Folder.current = Folder.desktop;
    var f = File.openDialog('Select the .srt file', _SRT_FILTER(), false);
    if (!f) return JSON.stringify({ ok: false, msg: 'Cancelled' });
    if (!f.open('r')) return JSON.stringify({ ok: false, msg: 'No se pudo abrir el archivo' });
    f.encoding = 'UTF-8';
    var content = f.read();
    f.close();
    if (!content) return JSON.stringify({ ok: false, msg: 'Archivo vacio' });
    return JSON.stringify({ ok: true, srt: content, name: f.name });
  } catch (e) {
    return JSON.stringify({ ok: false, msg: e.toString() });
  }
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

// Core compartido: construye las capas de letra (duplicando "Style Controler") en una comp.
// ══════════════════════════════════════════════════════════════════════════════
// Verso 2: STYLE FRAME — una sola capa de texto con source-text keyframes.
// El texto cambia (HOLD kf) en el inicio de cada subtitulo; la animacion (verde =
// entrada, rosa = salida) se coloca en cada "momento" alineada al cambio de texto:
//   - primer momento (primer texto): SOLO verde (entrada).
//   - momentos intermedios: rosa (salida del texto previo, terminando en el cambio)
//     + verde (entrada del nuevo texto, empezando en el cambio).
//   - ultimo momento (texto vacio al final): SOLO rosa (salida).
// Los grupos verde/rosa conservan su estructura/easing (se separan por el hueco mayor).
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

  // Centrado (igual que las otras capas) — solo para texto de punto, no para box text.
  if (doCenter && !isBoxFrame) {
    try {
      var tr = layer.property('ADBE Transform Group');
      var anchor = tr.property('ADBE Anchor Point'); while (anchor.numKeys > 0) anchor.removeKey(1);
      anchor.expression = 'var r = sourceRectAtTime(time, false);\n[r.left + r.width/2, r.top + r.height/2];';
      var pos = tr.property('ADBE Position'); while (pos.numKeys > 0) pos.removeKey(1);
      if (pos.expressionEnabled) pos.expression = '';
      pos.setValue([cx, cy]);
    } catch (e) {}
  }

  // PUNTO DE REFERENCIA = el source-text keyframe que el usuario dejo en el Style
  // Frame template. Toda su animacion (verde/rosa) esta colocada relativa a ese punto.
  // Replicamos EXACTAMENTE esa estructura: por cada subtitulo, el source text va en su
  // timestamp y la animacion se desplaza el mismo offset, conservando la alineacion.
  var anchor = null;
  try {
    var stRef = layer.property('ADBE Text Properties').property('ADBE Text Document');
    var rnk = 0; try { rnk = stRef.numKeys; } catch (e) {}
    if (rnk > 0) anchor = stRef.keyTime(1);   // el source-text kf del template
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
        // Punto de SALIDA del subtitulo j.
        var exitT;
        if (j + 1 < entries.length) {
          var nextStart = entries[j + 1].startSec;
          exitT = ((nextStart - entries[j].endSec) > GAP_CUT)
            ? ej                                                                 // hueco grande → fin del marcador
            : _snap(Math.min(comp.duration, Math.max(nextStart, sj + 1 / fr)));  // contiguo → transicion al siguiente
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

  // 3) Source-text keyframes (HOLD): el texto de cada subtitulo en su inicio, y
  //    un keyframe VACIO al final (cuando ya no hay mas letra).
  try {
    var st = layer.property('ADBE Text Properties').property('ADBE Text Document');
    // Capturar el documento del template UNA sola vez. Este doc conserva boxText,
    // boxTextSize y boxTextPos (el paragraph box). Lo REUTILIZAMOS en cada keyframe
    // cambiando solo el .text; asi el SRT siempre obedece el text box. Leer st.value en
    // cada iteracion es fragil: tras el primer setValueAtTime AE puede devolver texto de
    // punto y el box se pierde (el texto se sale del cuadro).
    var baseDoc = st.value;
    // Fuente del Style capturada UNA vez: se reafirma tras cada cambio de .text para que
    // ningun glifo quede con fuente sustituida. No se re-lee st.value (rompe el text box).
    var _bf = null; try { _bf = baseDoc.font; } catch (e) {}
    var snk = 0; try { snk = st.numKeys; } catch (e) {}
    for (var sk = snk; sk >= 1; sk--) { try { st.removeKey(sk); } catch (e) {} }
    for (var j2 = 0; j2 < entries.length; j2++) {
      var tj2 = _snap(Math.max(0, Math.min(entries[j2].startSec, comp.duration - 1 / fr)));
      baseDoc.text = entries[j2].text;
      try { if (_bf) baseDoc.font = _bf; } catch (e) {}
      try { st.setValueAtTime(tj2, baseDoc); } catch (e) {}
    }
    baseDoc.text = '';
    try { st.setValueAtTime(_snap(Math.min(comp.duration, lastEnd)), baseDoc); } catch (e) {}   // vacio al final
    var fnk = 0; try { fnk = st.numKeys; } catch (e) {}
    for (var fk = 1; fk <= fnk; fk++) { try { st.setInterpolationTypeAtKey(fk, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD); } catch (e) {} }
  } catch (e) {}

  return 1;
}

function _buildLyricLayers(comp, entries, fadeIn, fadeOut, styleName, doCenter, doExtend) {
  try { _SNAP_FD = comp.frameDuration; } catch (e) {}   // snap keyframes a frames del comp
  var lastEnd = 0;
  for (var q = 0; q < entries.length; q++) if (entries[q].endSec > lastEnd) lastEnd = entries[q].endSec;
  if (doExtend && (lastEnd + 0.5) > comp.duration) { try { comp.duration = lastEnd + 0.5; } catch (e) {} }

  var styleInfo = _findStyleInfo(comp);
  var styleLayer = styleInfo ? styleInfo.layer : null;
  var createdStyle = false;
  if (!styleLayer) { styleLayer = _createDefaultStyleLayer(comp, styleName); createdStyle = true; }

  // Verso 2: "Style Frame" → UNA sola capa con source-text keyframes (animacion por momento).
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
    // _lyricsCompByNum solo tiene sentido con un numero real — con null matcheaba por
    // coincidencia (null===null) la primera lyrics sin numero, que podia ser la Short.
    if (!comp && _leadNum(lyrCompName) != null) comp = _lyricsCompByNum(_leadNum(lyrCompName));
    if (!comp && opt.lyricsBySuffix) {
      // Verso 2: respetar la comp seleccionada en el panel de Proyecto — pero NUNCA la
      // "Short Lyrics". Esta funcion es SIEMPRE para el Lyrics normal (Short usa
      // importLyricsToShort/_shortLyricsComp por separado); si el fallback aterrizaba en
      // "Short Lyrics" (por seleccion o por ser la primera "…lyrics…" del panel), el SRT
      // nunca llegaba a la comp de video.
      var sc = _selComp();
      if (sc && !/\bshort\b/i.test(sc.name)) {
        if (sc.name.toLowerCase().indexOf('lyrics') !== -1) comp = sc;             // la lyrics seleccionada
        else { var sn = _leadNum(sc.name); if (sn != null) comp = _lyricsCompByNum(sn); }  // su lyrics por numero
      }
      if (!comp) {
        // fallback: la primera "…lyrics…" del panel que NO sea Short.
        for (var li = 1; li <= app.project.numItems; li++) {
          var lit = app.project.item(li);
          if (lit instanceof CompItem && lit.name.toLowerCase().indexOf('lyrics') !== -1 && !/\bshort\b/i.test(lit.name)) { comp = lit; break; }
        }
      }
    }
    if (!comp) {
      app.endUndoGroup();
      return 'err:Comp "' + lyrCompName + '" not found in the project.';
    }

    var entries = _parseSRT(srtContent);
    if (!entries.length) { app.endUndoGroup(); return 'err:No valid subtitles in the SRT.'; }

    var res = _buildLyricLayers(comp, entries, fadeIn, fadeOut, styleName, true, true);
    try { comp.openInViewer(); } catch (er) {}
    app.endUndoGroup();
    var msg = res.count + ' capas en "' + comp.name + '"';
    if (res.createdStyle) msg += ' (Style Controler creado)';
    return 'ok:' + msg;
  } catch (e) {
    try { app.endUndoGroup(); } catch (x) {}
    return 'err:' + e.message + (e.line ? ' (line ' + e.line + ')' : '');
  }
}

// Verso 2 — Import "Short": importa el SRT en la comp "Short Lyrics" (mismo builder
// que el import normal, asi respeta Style Frame / Style Layer). Espejo de
// importLyricsToComp pero resolviendo el destino con _shortLyricsComp().
function importLyricsToShort(srtContent, optionsJSON) {
  try {
    app.beginUndoGroup('Lyricator: Import lyrics (Short)');
    var opt = {};
    try { opt = JSON.parse(optionsJSON || '{}'); } catch (e) {}
    var fadeIn   = opt.fadeIn  !== undefined ? +opt.fadeIn  : 0.3;
    var fadeOut  = opt.fadeOut !== undefined ? +opt.fadeOut : 0.3;
    var styleName = opt.styleLayerName || 'Style Controler';

    var comp = _shortLyricsComp();
    if (!comp) { app.endUndoGroup(); return 'err:No "Short Lyrics" composition found in the project.'; }

    var entries = _parseSRT(srtContent);
    if (!entries.length) { app.endUndoGroup(); return 'err:No valid subtitles in the SRT.'; }

    var res = _buildLyricLayers(comp, entries, fadeIn, fadeOut, styleName, true, true);
    try { comp.openInViewer(); } catch (er) {}
    app.endUndoGroup();
    var msg = res.count + ' capas en "' + comp.name + '"';
    if (res.createdStyle) msg += ' (Style Controler creado)';
    return 'ok:' + msg;
  } catch (e) {
    try { app.endUndoGroup(); } catch (x) {}
    return 'err:' + e.message + (e.line ? ' (line ' + e.line + ')' : '');
  }
}

// "2 por 1": desde la seccion Short, el mismo SRT va a AMBAS — "Lyrics" (video) Y "Short
// Lyrics" — no solo a Short. Antes el import en modo Short dejaba el Lyrics normal intacto.
function importLyricsToBoth(lyrCompName, srtContent, optionsJSON) {
  var r1 = importLyricsToComp(lyrCompName, srtContent, optionsJSON);
  var r2 = importLyricsToShort(srtContent, optionsJSON);
  var okc = 0, parts = [];
  if (String(r1).indexOf('ok:') === 0) { okc++; parts.push(String(r1).slice(3)); } else parts.push('Lyrics: ' + String(r1).replace(/^err:/, ''));
  if (String(r2).indexOf('ok:') === 0) { okc++; parts.push(String(r2).slice(3)); } else parts.push('Short Lyrics: ' + String(r2).replace(/^err:/, ''));
  return okc ? ('ok:' + parts.join('  ·  ')) : ('err:' + parts.join('  ·  '));
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
function importSRTBatch() {
  try {
    _clearResult();   // volcado limpio: el panel sondea hasta que aparezca el nuevo
    var targets = _selectedLyricsComps();
    if (!targets.length) targets = _allLyricsComps();
    if (!targets.length) return _writeResult({ ok: false, msg: 'No Lyrics comps in the project' });

    Folder.current = Folder.desktop;
    var raw = File.openDialog('Select the SRT files (' + targets.length + ' Lyrics comp(s))', _SRT_FILTER(), true);
    if (!raw) return _writeResult({ ok: false, msg: 'Cancelado' });
    var files = (raw instanceof Array) ? raw : [raw];
    if (files.length === 0) return _writeResult({ ok: false, msg: 'Sin archivos' });

    var oneByOne = (files.length === 1);
    if (oneByOne) {
      var slots = targets.length;
      for (var s = 1; s < slots; s++) {
        try { Folder.current = files[files.length - 1].parent; } catch (e) {}
        var next = File.openDialog('SRT ' + (s + 1) + ' of ' + slots + '  —  Cancel to stop here', _SRT_FILTER(), false);
        if (!next) break;
        files.push(next);
      }
    } else {
      files.sort(function (a, b) { return (a.created || new Date(0)).valueOf() - (b.created || new Date(0)).valueOf(); });
    }

    app.beginUndoGroup('Lyricator: Import SRT batch');
    var count = Math.min(targets.length, files.length), applied = 0, totalLayers = 0, firstComp = null;
    for (var j = 0; j < count; j++) {
      var content = _readFile(files[j]);
      if (content === null) continue;
      var entries = _parseSRT(content);
      if (!entries.length) continue;
      var res = _buildLyricLayers(targets[j], entries, 0.3, 0.3, 'Style Controler', true, true);
      totalLayers += res.count; applied++;
      if (!firstComp) firstComp = targets[j];
    }
    app.endUndoGroup();
    // Abrir la comp donde se importo, para quedar parado ahi.
    try { if (firstComp) { firstComp.openInViewer(); app.project.activeItem; } } catch (eV) {}
    return _writeResult({ ok: true, applied: applied, total: count, layers: totalLayers });
  } catch (e) {
    try { app.endUndoGroup(); } catch (x) {}
    return _writeResult({ ok: false, msg: e.toString() });
  }
}

// Borra TODAS las capas con "SRT" en el nombre, en TODAS las comps del proyecto.
function clearAllLyricLayers() {
  try {
    app.beginUndoGroup('Lyricator: Clear ALL SRT layers');
    var removed = 0, comps = 0;
    for (var i = 1; i <= app.project.numItems; i++) {
      var it = app.project.item(i);
      if (!(it instanceof CompItem)) continue;
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
    // _thCompByNum solo tiene sentido si thCompName trae un numero real — con null
    // matcheaba por coincidencia (null===null) la primera TH sin numero del proyecto,
    // que no necesariamente es la correcta. Si no hay numero, ir directo al fallback
    // explicito de canal unico.
    if (!comp && _leadNum(thCompName) != null) comp = _thCompByNum(_leadNum(thCompName));
    if (!comp) comp = _anyTHComp();   // Verso single-channel: la unica comp TH
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
    if (!comp && _leadNum(thCompName) != null) comp = _thCompByNum(_leadNum(thCompName));
    if (!comp) comp = _anyTHComp();   // Verso single-channel: la unica comp TH
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

// Verso 2 — Short thumbnail: actualiza las capas de texto "Short Artist" / "Short Song"
// dentro de la comp "Short".
function updateShortThumbnail(artist, song) {
  try {
    var comp = _shortComp();
    if (!comp) return 'err:No "Short" composition found.';
    app.beginUndoGroup('Lyricator: Update short thumbnail');
    var setA = _setTextLayer(comp, 'Short Artist', artist);
    var setS = _setTextLayer(comp, 'Short Song', song);
    app.endUndoGroup();
    if (!setA && !setS) return 'err:No "Short Artist" / "Short Song" text layers in "' + comp.name + '".';
    return 'ok:' + comp.name;
  } catch (e) {
    try { app.endUndoGroup(); } catch (x) {}
    return 'err:' + e.message;
  }
}
// Actualiza "Short TH" (miniatura propia del short, si existe) con las capas "Artist" /
// "Song" — mismo nombre de capa que la TH de video, NO "Short Artist"/"Short Song".
// Opcional: si el proyecto no tiene "Short TH", simplemente no hay nada que hacer (no es error).
function updateShortTHComp(artist, song) {
  var comp = _shortTHComp();
  if (!comp) return 'skip:sin comp "Short TH"';
  try {
    app.beginUndoGroup('Lyricator: Update short TH');
    var setA = _setTextLayer(comp, 'Artist', artist);
    var setS = _setTextLayer(comp, 'Song', song);
    app.endUndoGroup();
    if (!setA && !setS) return 'err:No "Artist" / "Song" text layers in "' + comp.name + '".';
    return 'ok:' + comp.name;
  } catch (e) {
    try { app.endUndoGroup(); } catch (x) {}
    return 'err:' + e.message;
  }
}
// "2 por 1": desde la seccion Short, el boton de miniatura actualiza TODAS — la TH de video
// (Artist/Song con los datos de video), la comp "Short" (Short Artist/Short Song) Y "Short
// TH" si existe (Artist/Song, con los datos de short) — antes solo tocaba "Short" y la TH
// del video largo, dejando "Short TH" sin actualizar.
function updateThumbnailBoth(thCompName, videoArtist, videoSong, shortArtist, shortSong) {
  var r1 = updateThumbnailComp(thCompName, videoArtist, videoSong);
  var r2 = updateShortThumbnail(shortArtist, shortSong);
  var r3 = updateShortTHComp(shortArtist, shortSong);
  var okc = 0, parts = [];
  if (String(r1).indexOf('ok:') === 0) { okc++; parts.push(String(r1).slice(3)); } else parts.push('TH: ' + String(r1).replace(/^err:/, ''));
  if (String(r2).indexOf('ok:') === 0) { okc++; parts.push(String(r2).slice(3)); } else parts.push('Short: ' + String(r2).replace(/^err:/, ''));
  if (String(r3).indexOf('ok:') === 0) { okc++; parts.push(String(r3).slice(3)); }
  else if (String(r3).indexOf('skip:') !== 0) parts.push('Short TH: ' + String(r3).replace(/^err:/, ''));   // "skip" (no existe) no cuenta como fallo
  return okc ? ('ok:' + parts.join('  ·  ')) : ('err:' + parts.join('  ·  '));
}

// Verso 2 — genera una previa PNG del frame de la comp "Short".
function getShortThumbnailPreview() {
  try {
    var comp = _shortComp();
    if (!comp) return JSON.stringify({ ok: false, msg: 'Sin comp Short' });
    var out = new File(Folder.temp.fsName + '/lyricator_short_' + (new Date()).getTime() + '.png');
    try { comp.saveFrameToPng(comp.workAreaStart || 0, out); }
    catch (e) { return JSON.stringify({ ok: false, msg: 'saveFrameToPng no disponible' }); }
    if (!out.exists) return JSON.stringify({ ok: false, msg: 'No se genero la previa' });
    return JSON.stringify({ ok: true, path: out.fsName });
  } catch (e) {
    return JSON.stringify({ ok: false, msg: e.toString() });
  }
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
