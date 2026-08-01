# Style Detective

A modern rewrite of the popular [CSS Viewer](https://github.com/miled/cssviewer) extension for Chromium-based browsers. Hover over any element on a page to inspect its computed styles in a floating panel.

![Style Detective](store/screenshot-1280x800-01.png)

#### Features:

- Hover over any element to view its CSS properties in a floating panel
- Freeze the panel in place to inspect it
- Copy an element's style to clipboard, or freeze the panel to copy individual property values
- Keyboard shortcut to toggle the viewer (`Alt+Shift+S`; macOS: `Option+Shift+S`)
- New: WCAG contrast ratio for color vs background-color
- New: Ability to increase/decrease font size
- New: Dark mode support
- New: Iframe support
- New: Classes section with click-to-copy chips or "Copy All"

## Installation

The easiest way to install this extension is from the [Chrome Web Store](https://chromewebstore.google.com/detail/style-detective/fbfplfafboelbaogjidoamdjjcckemib).

## Development

Requires Node 20+. Clone the repository, then run:

```bash
npm install
npm run dev      # Watches for changes, rebuilds the extension
npm run lint
npm run test
```

Then open `chrome://extensions`, turn on **Developer mode** (top-right), click **Load Unpacked** and choose the `dist/` directory.

## Usage

Click the toolbar icon (or press `Alt+Shift+S` (Windows) or `Option+Shift+S` (macOS)) to enable or disable the viewer on the current page. While enabled, hover over any element to inspect it.

You can customize the toggle shortcut at `chrome://extensions/shortcuts`.

#### Keyboard Shortcuts

- `F` to freeze or unfreeze the panel in place
- `C` to copy a simple CSS definition for the selected element to the clipboard
- `Shift+C` to copy the element's classes (space-separated)
- `J` to copy the same properties as JSON (`{ selector, properties }`)
- `L` to show or hide the Classes row
- `+` / `-` to increase or decrease the panel font size (`0` / zero resets to default)
- `S` to open the settings page
- `Esc` to close the viewer

On elements with a `class` attribute, a **Classes** row appears below the header with click-to-copy chips and **Copy All** (long lists cap at a configurable number of wrap lines — default 3 — with `+N more`). The header shows the tag and `#id` only. Toggle the row anytime with **`L`** or **Show CSS Classes** in settings (`Shift+C` still copies classes).

## What the Panel Shows

Values are the element’s **current computed styles**—what the browser is rendering right now—not authored CSS or cascade sources.

That includes interaction state: hovering a link shows its `:hover` color (and any other hover styles), which matches what you see under the cursor. Press **`F`** to freeze while hovered if you want to keep that snapshot and move the mouse away.

Copied CSS (`C`) uses the same live computed values as the panel.
