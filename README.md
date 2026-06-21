# SRT Editor — CEP Extension for After Effects

## Installation

### Step 1 — Enable unsigned extensions (one time)
Open terminal and run:

**Mac:**
```
defaults write com.adobe.CSXS.11 PlayerDebugMode 1
defaults write com.adobe.CSXS.10 PlayerDebugMode 1
defaults write com.adobe.CSXS.9  PlayerDebugMode 1
```

**Windows (run as Administrator):**
```
reg add HKCU\Software\Adobe\CSXS.11 /v PlayerDebugMode /t REG_SZ /d 1 /f
reg add HKCU\Software\Adobe\CSXS.10 /v PlayerDebugMode /t REG_SZ /d 1 /f
reg add HKCU\Software\Adobe\CSXS.9  /v PlayerDebugMode /t REG_SZ /d 1 /f
```

### Step 2 — Copy the extension folder
Copy the entire **SRTEditor** folder to:

**Mac:**
```
~/Library/Application Support/Adobe/CEP/extensions/
```

**Windows:**
```
C:\Users\<username>\AppData\Roaming\Adobe\CEP\extensions\
```

The final path should look like:
```
.../CEP/extensions/SRTEditor/CSXS/manifest.xml
.../CEP/extensions/SRTEditor/index.html
.../CEP/extensions/SRTEditor/jsx/host.jsx
```

### Step 3 — Open in After Effects
1. Restart After Effects
2. Go to **Window > Extensions > SRT Editor**
3. The panel will open and dock like any AE panel

## Features
- Load audio from disk
- Paste lyrics and auto-sync via LRCLIB
- Manual timestamps: Space = play/pause, Enter = stamp
- Resizable panels (drag dividers like AE)
- Zoom with Alt+Scroll, pan with middle-click drag
- Box-select multiple stamps, drag to move
- Ctrl+Z / Ctrl+Shift+Z undo/redo
- Export SRT — "Save via AE" uses After Effects native file dialog
- Blue playhead matching AE color scheme

### Main button: Export (web) / Import to Comp (inside AE)
The bottom control button adapts to where the panel runs:
- **On the web** it is **Export** — opens a dialog to copy or download the `.srt`.
- **Inside After Effects** it becomes **Import to Comp** (purple) and imports the
  lyrics straight into AE — no dialog. Detection uses `window.__adobe_cep__`, which
  only exists inside a CEP host, so the import button never shows on the web.

**Import to Comp** uses a text layer named **`Style Controler`**: it duplicates that
layer for each subtitle, so every line inherits its font, size, color and (if the
controler is a **box / paragraph text**) its text box, which keeps long lines from
spilling off the sides of the frame. All layers are centered and get an opacity
**fade in / out** expression. If no `Style Controler` exists, a default box-text one
is created and hidden.

Target composition, in priority order:
1. The composition **selected / active in the Project panel** — lyrics are built there.
2. Otherwise, a comp named like the active channel, if it exists.
3. For the **Nightclub Nostalgia** channel only, that comp is **created automatically**
   if it doesn't exist yet.

## AE Version Support
After Effects CC 2021 and later (CEP 9+)
Also works in Premiere Pro CC 2021+

## Notes
- Audio is loaded directly in the browser panel — no AE render required
- The "Save via AE" button uses ExtendScript to open AE's native save dialog
- Works offline (no internet needed except for Auto-sync via LRCLIB)
