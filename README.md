# Style Detective Chrome Extension

A modern rewrite of the popular [CSS Viewer](https://github.com/miled/cssviewer) extension. Hover any element on a page to inspect its computed styles in a floating panel.

![Style Detective](store/demo.webp)

Features:

- Hover any element to view its CSS properties in a floating panel
- Freeze the panel in place to inspect it
- Copy an element's style to clipboard, or freeze the panel to copy individual property values
- Keyboard shortcut to toggle the viewer (`Alt+Shift+S`; macOS: `Option+Shift+S`)
- New: WCAG contrast ratio for color vs background-color
- New: Ability to increase/decrease font size
- New: Dark mode support
- New: Iframe support

## Installation

Until a release build is finished, the only way to run this extension is to clone the repo and run:

```bash
npm install
npm run build    # production build → dist/
```

Then open `chrome://extensions`, turn on **Developer mode** (top-right), click **Load Unpacked** and choose the `dist/` directory.

## Usage

Click the toolbar icon (or press `Alt+Shift+S` on Windows/Linux/ChromeOS, `Option+Shift+S` on macOS) to enable or disable the viewer on the current page. While enabled, hover any element to inspect it.

You can customize the toggle shortcut at `chrome://extensions/shortcuts`.

Keyboard shortcuts while the viewer is active:

- `F` to freeze or unfreeze the panel in place
- `C` to copy a simple CSS definition for the selected element to the clipboard
- `+` / `-` to increase or decrease the panel font size
- `0` to reset the panel font size
- `M` to Toggle light/dark mode for overlay panel
- `H` to display the help page
- `Esc` to close the viewer

## Known Issues

- The viewer will not activate on tabs that were already open before installation or update, nor on the Chrome Web Store itself. Reload the tab so the content script can attach, then try again.
- Styling may occasionally conflict with the web site's CSS
