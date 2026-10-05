# AIDA64 SensorPanels

OLED-friendly [AIDA64](https://www.aida64.com/) SensorPanel layouts for a 4K second screen.

- **Modern Split builder**: summary on the left, every core, drive and fan on the right. Change sensors, colours, resolution and Windows scale in the browser, watch a live preview, and export a `.sensorpanel` file.
- **Classic OLED**: analog instrument dials, 3840 × 2160. Ready-made file in `panels/`.
- **Sensor reference**: every reading AIDA64 can put on a panel, searchable.

The site is served by GitHub Pages from the repository root.

## Use a panel

1. Export a file from the builder, or download `panels/Classic_OLED_3840x2160.sensorpanel`.
2. In AIDA64, open **File › Preferences › Hardware Monitoring › SensorPanel** and tick **Show SensorPanel**.
3. Right-click the panel, open **SensorPanel Manager**, choose **Import** and pick the file.

Frame rate needs RivaTuner Statistics Server running. Memory temperatures need **Preferences › Stability › DIMM thermal sensor support** and an AIDA64 restart.

## Build

Needs Python 3 and Pillow (`pip install pillow`).

```
python build_site.py          # rebuild builder/, classic/, sensors/ and panels/ from src/
python build_site.py --all    # also re-render the Classic OLED images
```

Optional export check (needs Playwright):

```
pip install playwright
python -m playwright install chromium
python src/builder/check_export.py
```

## Layout

| Path | What it is |
| --- | --- |
| `index.html` | Landing page |
| `builder/`, `classic/`, `sensors/`, `panels/` | Generated site files (commit them) |
| `src/builder/` | Builder source and build script |
| `src/classic/` | Classic OLED generator and preview page |
| `src/sensors/` | Sensor reference source |
| `src/fonts/` | Selawik and Barlow Semi Condensed, with licences |

## Licences

Fonts: Selawik © Microsoft and Barlow Semi Condensed © The Barlow Project Authors, both under the SIL Open Font License 1.1 (see `src/fonts`).

Not affiliated with FinalWire. AIDA64 is a trademark of FinalWire Ltd.
