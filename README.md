# AIDA64 SensorPanels

OLED-friendly [AIDA64](https://www.aida64.com/) SensorPanel layouts for a 4K second screen, and a designer to make your own.

- **Panel Designer**: a drag-and-drop editor in the browser.
  - Start from a blank panel or a theme (Modern Split, Classic OLED).
  - Drag gauges, rings, dials, graphs and tables onto the panel, then move, resize and restyle every part.
  - Load your PC's AIDA64 sensor list so you see the sensors your hardware actually has.
  - Export `.sensorpanel` or `.spzip`.
  - It also opens existing panels for editing, saves designs as files and shares them as links. Nothing is uploaded.
  - An Assistant changes the design from plain requests, using an AI you already have: any chat (copy and paste), your OpenRouter account, or Ollama on your PC.
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

## Assistant (designer)

The **Assistant** tab changes the design from plain requests, such as "add every fan under the cooling row" or "make a 1024×600 version with CPU and GPU temperatures". The site has no server: the model comes from you. Each request is one Undo step.

| Route | What you need | Cost | What leaves the page |
| --- | --- | --- | --- |
| Copy & paste | Any chat: ChatGPT, Claude, Microsoft Copilot, Gemini | Your chat plan | Only what you paste |
| OpenRouter | An [OpenRouter](https://openrouter.ai) account | Per request, shown after each one | Goes to OpenRouter and the model's provider |
| Ollama | [Ollama](https://ollama.com) on this PC | Free | Nothing; it stays on your PC |

**Copy & paste**
1. Type a request and press **Copy prompt**.
2. Paste the prompt into a chat, then paste the whole reply back into the box under it.
3. The designer shows what would change, with a preview. **Apply** changes the design.

**OpenRouter**
- Press **Sign in with OpenRouter**, or paste a key from openrouter.ai.
- The key is kept until the browser tab closes. **Remember on this device** keeps it longer, but other pages on the same github.io address could read it, so give that key a credit limit.
- The newest Claude Sonnet is picked unless you choose another model in the settings. A request usually sends 6,000–20,000 tokens.
- **Only use providers that don't store my prompts** asks OpenRouter to skip providers that keep data.

**Ollama**
1. Install Ollama and get a model that can use tools, for example `ollama pull qwen3:8b`.
2. Allow the site: add the user environment variable `OLLAMA_ORIGINS` with the page's address, e.g. `https://xurimx.github.io` (Start › *Edit environment variables for your account*). The designer shows the exact value and a `setx` command. Then quit Ollama from its tray icon and start it again.
3. Choose **Ollama** in the Assistant and press **Connect**. If the browser asks whether the page may reach apps on your device, choose **Allow**.

**What is sent**: your request, a summary of the design, and the sensor IDs and names the model looks up. Current readings go only when **Include readings** is ticked. The page connects to nothing until you press Send, Connect or Sign in, or open the model list.

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
python src/designer/check_designer.py               # designer: file formats, sensor lists, widgets, themes, editor, assistant, pages
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
