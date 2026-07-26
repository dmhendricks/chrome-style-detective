# Style Detective Chrome Extension

A modern rewrite of the popular [CSS Viewer](https://github.com/miled/cssviewer) extension. Hover over any element on a page to inspect its computed styles in a floating panel.

![Style Detective](store/screenshot-1280x800-01.png)

Features:

- Hover over any element to view its CSS properties in a floating panel
- Freeze the panel in place to inspect it
- Copy an element's style to clipboard, or freeze the panel to copy individual property values
- Keyboard shortcut to toggle the viewer (`Alt+Shift+S`; macOS: `Option+Shift+S`)
- New: WCAG contrast ratio for color vs background-color
- New: Ability to increase/decrease font size
- New: Dark mode support
- New: Iframe support
- New: Classes row with click-to-copy chips

## Installation

Clone the repo and build:

```bash
npm install
npm run build    # production build → dist/
```

Then open `chrome://extensions`, turn on **Developer mode** (top-right), click **Load Unpacked** and choose the `dist/` directory.

Published builds (when available) can also be loaded from a release zip the same way.

## Usage

Click the toolbar icon (or press `Alt+Shift+S` (Windows) or `Option+Shift+S` (macOS)) to enable or disable the viewer on the current page. While enabled, hover over any element to inspect it.

You can customize the toggle shortcut at `chrome://extensions/shortcuts`.

Keyboard shortcuts while the viewer is active:

- `F` to freeze or unfreeze the panel in place
- `C` to copy a simple CSS definition for the selected element to the clipboard
- `Shift+C` to copy the element's classes (space-separated)
- `L` to show or hide the Classes row
- `+` / `-` to increase or decrease the panel font size (`0` / zero resets to default)
- `S` to open the settings page
- `Esc` to close the viewer

On elements with a `class` attribute, a **Classes** row appears below the header with click-to-copy chips and **Copy All** (long lists cap at a configurable number of wrap lines — default 3 — with `+N more`). The header shows the tag and `#id` only. Toggle the row anytime with **`L`** or **Show CSS Classes** in settings (`Shift+C` still copies classes).
