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
- New: Utility-first extras for frameworks like Tailwind CSS

## Installation

Until a release build is finished, the only way to run this extension is to clone the repo and run:

```bash
npm install
npm run build    # production build → dist/
```

Then open `chrome://extensions`, turn on **Developer mode** (top-right), click **Load Unpacked** and choose the `dist/` directory.

## Usage

Click the toolbar icon (or press `Alt+Shift+S` (Windows) or `Option+Shift+S` (macOS)) to enable or disable the viewer on the current page. While enabled, hover over any element to inspect it.

You can customize the toggle shortcut at `chrome://extensions/shortcuts`.

Keyboard shortcuts while the viewer is active:

- `F` to freeze or unfreeze the panel in place
- `C` to copy a simple CSS definition for the selected element to the clipboard
- `Shift+C` to copy the element's classes (space-separated)
- `+` / `-` to increase or decrease the panel font size (`0` / zero resets to default)
- `S` to open the settings page
- `Esc` to close the viewer

With **Utility-first extras** enabled in settings, a **Classes** row also appears on elements that have a `class` attribute (expanded by default; expand/collapse is saved and shared across tabs). Click a chip or **Copy all** to copy classes.
