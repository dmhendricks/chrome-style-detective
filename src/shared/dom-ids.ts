/*!
 * Overlay / highlight / toast DOM ids and modifier classes.
 *
 * Content scripts must agree on these strings so core, panel, and dom helpers
 * do not drift (and so host-page collisions stay namespaced).
 */

export const OVERLAY_ID = 'StyleDetectiveOverlay';
export const FROZEN_CLASS = 'StyleDetectiveOverlay--frozen';
export const DARK_CLASS = 'StyleDetectiveOverlay--dark';

export const HIGHLIGHT_ID = 'StyleDetectiveHighlight';

export const TOAST_ID = 'StyleDetectiveToast';
export const TOAST_SUCCESS_CLASS = 'StyleDetectiveToast--success';
