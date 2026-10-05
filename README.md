# AIDA64 SensorPanels

OLED-friendly [AIDA64](https://www.aida64.com/) SensorPanel layouts for a 4K second screen, and a designer to make your own.

- **Panel Designer**: a drag-and-drop editor in the browser.
  - Start from a blank panel or a theme (Modern Split, Classic OLED).
  - Drag gauges, rings, dials, graphs and tables onto the panel, then move, resize and restyle every part.
  - Load your PC's AIDA64 sensor list so you see the sensors your hardware actually has.
  - Export `.sensorpanel` or `.spzip`.
  - It also opens existing panels for editing, saves designs as files and shares them as links. Nothing is uploaded.
- **Modern Split builder**: summary on the left, every core, drive and fan on the right. Change sensors, colours, resolution and Windows scale in the browser, watch a live preview, and export a `.sensorpanel` file.
- **Classic OLED**: analog instrument dials, 3840 × 2160. The ready-made file is in `panels/`.
- **Sensor reference**: every reading AIDA64 can put on a panel, searchable.

The site is served by GitHub Pages from the repository root.

## Use a panel

1. Export a file from the designer or the builder, or download `panels/Classic_OLED_3840x2160.sensorpanel`.
2. In AIDA64, open **File › Preferences › Hardware Monitoring › SensorPanel** and tick **Show SensorPanel**.
3. Right-click the panel, open **SensorPanel Manager**, choose **Import** and pick the file.

Frame rate needs RivaTuner Statistics Server running. Memory temperatures need **Preferences › Stability › DIMM thermal sensor support** and an AIDA64 restart.

## Your PC's sensor list (designer)

AIDA64 can publish its readings for other programs. The designer reads that list (sensor IDs, labels and current values) to offer only your PC's sensors and to fit themes to your hardware.

1. Start AIDA64 and keep it running. AIDA64 removes the values when it closes.
2. Open **⋮ (or File) › Preferences › Hardware Monitoring › External Applications**. Tick **Enable writing sensor values to Registry**, click **Select All**, then **OK**. Clocks, loads, drives and network are unticked by default.
3. Press Win+R and run `cmd /c reg query HKCU\Software\FinalWire\AIDA64\SensorValues | clip`, then press Ctrl+V in the designer.

You can also save a `.reg` file with `reg export` and drop it on the page, or read AIDA64's shared memory with PowerShell. The designer shows both commands with copy buttons.

dxdiag isn't used: it has no sensor readings and none of AIDA64's sensor IDs.

## Build

Needs Python 3 and Pillow (`pip install pillow`). If Python isn't on your PATH, run the same commands through [uv](https://docs.astral.sh/uv/), e.g. `uv run --with pillow python build_site.py`.

```
python build_site.py          # rebuild designer/, builder/, classic/, sensors/ and panels/ from src/
python build_site.py --all    # also re-render the Classic OLED images
```

The checks need Playwright. They use Playwright's Chromium, or a local Microsoft Edge if Chromium isn't installed.

```
pip install playwright
python -m playwright install chromium               # optional when Edge is installed
python src/builder/check_export.py --all            # export the builder's configs and check the files
python src/designer/check_designer.py               # designer: file formats, sensor lists, widgets, themes, editor, pages
```

## Layout

| Path | What it is |
| --- | --- |
| `index.html` | Landing page |
| `designer/`, `builder/`, `classic/`, `sensors/`, `panels/` | Generated site files (commit them) |
| `src/designer/` | Panel Designer source, build script, tests and fixtures |
| `src/builder/` | Builder source and build script |
| `src/shared/` | Code shared by the pages: file writer and reader, ZIP, renderer, font metrics |
| `src/classic/` | Classic OLED generator and preview page |
| `src/sensors/` | Sensor reference and the shared sensor catalogue |
| `src/tools/` | Font metrics, AIDA64 calibration panels, designer thumbnail |
| `src/fonts/` | Selawik and Barlow Semi Condensed, with licences |

## Licences

Fonts: Selawik © Microsoft and Barlow Semi Condensed © The Barlow Project Authors, both under the SIL Open Font License 1.1 (see `src/fonts`).

Not affiliated with FinalWire. AIDA64 is a trademark of FinalWire Ltd.
