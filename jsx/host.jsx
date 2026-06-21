// SRT Editor — ExtendScript host for After Effects
// Called from CEP panel via CSInterface.evalScript()
// CEP sets $.fileName to the .jsx path — we use that to locate sibling files.

// ─── SAVE TO DISK ─────────────────────────────────────────────────────────────
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
    entries.push({ startSec: ss, endSec: es, text: lines.slice(2).join('\n') });
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

// Busca la capa de texto "Style Controler" (tolerante a grafia/mayusculas).
function _findStyleLayer(comp, name) {
  var want = (name || 'Style Controler').replace(/^\s+|\s+$/g, '').toLowerCase();
  var fallback = null;
  for (var i = 1; i <= comp.numLayers; i++) {
    var l = comp.layer(i);
    if (!(l instanceof TextLayer)) continue;
    var n = l.name.replace(/^\s+|\s+$/g, '').toLowerCase();
    if (n === want || n === 'style controller') return l;
    if (n.indexOf('style') !== -1 && n.indexOf('control') !== -1) fallback = fallback || l;
  }
  return fallback;
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
    newDoc.text = text;
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

// Crea un keyframe en newT restaurando TODA la info leida con _readKey (preserva easing).
function _writeKey(prop, newT, kd) {
  var idx = -1;
  try { idx = prop.addKey(newT); } catch(e) {}
  if (idx < 1) return;
  try { prop.setValueAtKey(idx, kd.v); } catch(e) {}
  try { if (kd.inInterp !== undefined && kd.outInterp !== undefined)
          prop.setInterpolationTypeAtKey(idx, kd.inInterp, kd.outInterp); } catch(e) {}
  try { if (kd.inSpat != null && kd.outSpat != null)
          prop.setSpatialTangentsAtKey(idx, kd.inSpat, kd.outSpat); } catch(e) {}
  try { if (kd.sCont != null) prop.setSpatialContinuousAtKey(idx, kd.sCont); } catch(e) {}
  try { if (kd.sAuto != null) prop.setSpatialAutoBezierAtKey(idx, kd.sAuto); } catch(e) {}
  try { if (kd.inEase != null && kd.outEase != null)
          prop.setTemporalEaseAtKey(idx, kd.inEase, kd.outEase); } catch(e) {}
  try { if (kd.tCont != null) prop.setTemporalContinuousAtKey(idx, kd.tCont); } catch(e) {}
  try { if (kd.tAuto != null) prop.setTemporalAutoBezierAtKey(idx, kd.tAuto); } catch(e) {}
  try { if (kd.roving != null) prop.setRovingAtKey(idx, kd.roving); } catch(e) {}
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

// Todos los footage "Song" en orden de panel.
function getSongItems() {
  var items = [];
  for (var i = 1; i <= app.project.numItems; i++) {
    var item = app.project.item(i);
    if (item instanceof FootageItem && item.name.toLowerCase().indexOf('song') !== -1) {
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
    if (src instanceof FootageItem && src.name.toLowerCase().indexOf('song') !== -1) return src;
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
    var selectedComps = getSelectedGeneralCompsByPanelOrder();
    var limitToSelected = selectedComps.length > 0;

    Folder.current = Folder.desktop;
    var raw = File.openDialog(
      'Select the audio files' + (limitToSelected ? ' (' + selectedComps.length + ' selected comp(s))' : ''),
      'Audio:*.mp3,*.wav,*.aac,*.aif,*.aiff,*.ogg,*.m4a,*.flac,*.wma,*.caf', true);
    if (!raw) return JSON.stringify({ ok: false, step: 'folder', msg: 'Cancelled' });

    var files = (raw instanceof Array) ? raw : [raw];
    if (files.length === 0) return JSON.stringify({ ok: false, step: 'folder', msg: 'No files selected' });

    var oneByOne = (files.length === 1);
    if (oneByOne) {
      var totalSlots = limitToSelected ? selectedComps.length : getSongItems().length;
      for (var s = 1; s < totalSlots; s++) {
        try { Folder.current = files[files.length - 1].parent; } catch (e) {}
        var next = File.openDialog('Audio ' + (s + 1) + ' of ' + totalSlots + '  —  Cancel to stop here',
          'Audio:*.mp3,*.wav,*.aac,*.aif,*.aiff,*.ogg,*.m4a,*.flac,*.wma,*.caf', false);
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

    if (replaced === 0) { try { app.endUndoGroup(); } catch (ue) {} return JSON.stringify({ ok: false, step: 'replace', msg: 'No audio could be replaced' }); }

    var lyricsComps = limitToSelected ? getRelatedLyricsComps(selectedComps) : _allLyricsComps();
    var lyricsCleaned = 0;
    for (var lc = 0; lc < lyricsComps.length; lc++) if (cleanLyricComp(lyricsComps[lc])) lyricsCleaned++;

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
    return JSON.stringify({ ok: true, mode: limitToSelected ? 'parcial' : 'completo',
      replaced: replaced, total: count, lyricsTotal: lyricsComps.length, lyricsCleaned: lyricsCleaned,
      rangeTotal: rangeComps.length, rangeUpdated: rangeUpdated, rangeSkipped: rangeSkipped,
      songs: songResults });
  } catch (e) {
    try { app.endUndoGroup(); } catch (ue) {}
    return JSON.stringify({ ok: false, step: 'exception', msg: e.toString() });
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

function doRenderOrQueue(sendToAME) {
  try {
    var downloads = new Folder('~/Downloads');
    if (downloads.exists) Folder.current = downloads;
    var outputFolder = Folder.selectDialog('Select the output folder for the render');
    if (!outputFolder) return JSON.stringify({ ok: false, msg: 'Cancelled' });
    if (!outputFolder.exists) outputFolder.create();

    var selected = getAllSelectedCompsByPanelOrder();
    var thComps = [], mainComps = [];
    if (selected.length > 0) {
      for (var i = 0; i < selected.length; i++) { if (isTHComp(selected[i])) thComps.push(selected[i]); else mainComps.push(selected[i]); }
    } else {
      for (var i2 = 1; i2 <= app.project.numItems; i2++) {
        var item = app.project.item(i2);
        if (!(item instanceof CompItem)) continue;
        if (isTHComp(item)) thComps.push(item);
        else if (item.label === 9 || item.label === 11) mainComps.push(item);
      }
    }
    if (thComps.length === 0 && mainComps.length === 0)
      return JSON.stringify({ ok: false, msg: 'No compositions detected.\nSelect comps in the panel\nor use a red (TH) / orange (main) label.' });

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
    if (added === 0) return JSON.stringify({ ok: false, msg: 'Could not add any comp to the queue' });
    if (sendToAME) { try { rq.queueInAME(false); } catch (e) { try { app.executeCommand(3767); } catch (e2) {} } }
    return JSON.stringify({ ok: true, added: added, thCount: thComps.length, mainCount: mainComps.length, mode: sendToAME ? 'AME' : 'AE', tmplWarning: tmplWarning, jpegTpl: usedJpeg });
  } catch (e) {
    return JSON.stringify({ ok: false, msg: e.toString() });
  }
}

function renderRun() { return doRenderOrQueue(false); }
function queueRun()  { return doRenderOrQueue(true);  }

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

// Core compartido: construye las capas de letra (duplicando "Style Controler") en una comp.
function _buildLyricLayers(comp, entries, fadeIn, fadeOut, styleName, doCenter, doExtend) {
  var lastEnd = 0;
  for (var q = 0; q < entries.length; q++) if (entries[q].endSec > lastEnd) lastEnd = entries[q].endSec;
  if (doExtend && (lastEnd + 0.5) > comp.duration) { try { comp.duration = lastEnd + 0.5; } catch (e) {} }

  var styleLayer = _findStyleLayer(comp, styleName);
  var createdStyle = false;
  if (!styleLayer) { styleLayer = _createDefaultStyleLayer(comp, styleName); createdStyle = true; }

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
    var start = Math.max(0, Math.min(e.startSec, comp.duration - 1 / fr));
    var end = Math.min(comp.duration, Math.max(e.endSec, start + 1 / fr));
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
    if (!comp) comp = _lyricsCompByNum(_leadNum(lyrCompName));
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
function importSRTBatch() {
  try {
    var targets = _selectedLyricsComps();
    if (!targets.length) targets = _allLyricsComps();
    if (!targets.length) return JSON.stringify({ ok: false, msg: 'No Lyrics comps in the project' });

    Folder.current = Folder.desktop;
    var raw = File.openDialog('Select the SRT files (' + targets.length + ' Lyrics comp(s))', 'SRT:*.srt,All files:*', true);
    if (!raw) return JSON.stringify({ ok: false, msg: 'Cancelado' });
    var files = (raw instanceof Array) ? raw : [raw];
    if (files.length === 0) return JSON.stringify({ ok: false, msg: 'Sin archivos' });

    var oneByOne = (files.length === 1);
    if (oneByOne) {
      var slots = targets.length;
      for (var s = 1; s < slots; s++) {
        try { Folder.current = files[files.length - 1].parent; } catch (e) {}
        var next = File.openDialog('SRT ' + (s + 1) + ' of ' + slots + '  —  Cancel to stop here', 'SRT:*.srt,All files:*', false);
        if (!next) break;
        files.push(next);
      }
    } else {
      files.sort(function (a, b) { return (a.created || new Date(0)).valueOf() - (b.created || new Date(0)).valueOf(); });
    }

    app.beginUndoGroup('Lyricator: Import SRT batch');
    var count = Math.min(targets.length, files.length), applied = 0, totalLayers = 0;
    for (var j = 0; j < count; j++) {
      var content = _readFile(files[j]);
      if (content === null) continue;
      var entries = _parseSRT(content);
      if (!entries.length) continue;
      var res = _buildLyricLayers(targets[j], entries, 0.3, 0.3, 'Style Controler', true, true);
      totalLayers += res.count; applied++;
    }
    app.endUndoGroup();
    return JSON.stringify({ ok: true, applied: applied, total: count, layers: totalLayers });
  } catch (e) {
    try { app.endUndoGroup(); } catch (x) {}
    return JSON.stringify({ ok: false, msg: e.toString() });
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
    if (!comp) comp = _thCompByNum(_leadNum(thCompName));
    if (!comp) comp = _anyTHComp();   // Verso single-channel: la unica comp TH
    if (!comp) return 'err:TH comp "' + thCompName + '" not found.';
    app.beginUndoGroup('Lyricator: Update thumbnail');
    var setA = _setTextLayer(comp, 'Artist', artist);
    var setS = _setTextLayer(comp, 'Song', song);
    app.endUndoGroup();
    if (!setA && !setS) return 'err:No "Artist" / "Song" layers found in "' + comp.name + '".';
    return 'ok:' + comp.name;
  } catch (e) {
    try { app.endUndoGroup(); } catch (x) {}
    return 'err:' + e.message;
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
    if (!comp) comp = _thCompByNum(_leadNum(thCompName));
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
