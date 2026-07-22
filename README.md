# CSS Quick Viewer

A simple CSS property viewer for Google Chrome. Hover any element on a page to inspect its computed styles in a floating panel. Forked from [miled/cssviewer](https://github.com/miled/cssviewer) and modernized.

![CSS Quick Viewer](img/option-demo.gif)

Features:

- Hover any element to view its CSS properties in a floating panel
- Right-click an element for quick access to `element`, `id`, `className`, `style`, `cssText`, and computed style in the console
- Freeze the panel in place to inspect it, or generate a simple CSS definition for the selected element
- Keyboard shortcut to toggle the viewer (`Ctrl+Shift+S` / `Cmd+Shift+S`)

## Installation

The easiest way to install the extension is from the [Chrome Web Store](https://chrome.google.com/webstore/detail/cssviewer/ggfgijbpiheegefliciemofobhmofgce).

## Usage

Click the toolbar icon (or press `Ctrl+Shift+S` on Windows/Linux/ChromeOS, `Cmd+Shift+S` on macOS) to enable or disable the viewer on the current page. While enabled, hover any element to inspect it.

Keyboard shortcuts while the viewer is active:

- `F` to freeze or unfreeze the panel in place
- `C` to show a simple CSS definition for the selected element
- `Esc` to close the viewer

## Known Issues

- The viewer will not activate on tabs that were already open before installation, nor on the Chrome Web Store itself. Reload the tab after installing.
- Styling may occasionally conflict with the host page's CSS.

## Changelog

- **1.8.0** — 07/2026 — Ported to Manifest V3 for compatibility with current versions of Chrome. Includes a previously unreleased fix for a header text overlap issue.
- **1.7** — 04/2017 — Added keyboard shortcuts and enabled the viewer for local files.
- **1.6** — 11/2014 — Added "Inspect Element" to the context menu and CSS definition generation. Fixed auto-positioning issues and a Chrome 38 regression.
- **1.5** — 10/2015 — Fixed an issue with Chrome 38.0.2125.101.
- **1.4** — 02/2013 — Released as an open source project.
- **1.3** — 08/2011 — Added support for some CSS3 properties under the "Effects" category.
- **1.2** — 07/2011 — Minor bug fixes.
- **1.1** — 03/2010 — Initial version.
