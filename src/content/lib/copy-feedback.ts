/*!
 * Overlay toast feedback for copy success / failure.
 *
 * Wired once by the overlay controller; used by class chips and frozen
 * property-value clicks.
 */

export type CopyNotifier = (message: string, tone?: 'default' | 'success') => void;

let copyNotifier: CopyNotifier | null = null;

/** Wire overlay toast feedback for all copy actions. */
export function setCopyNotifier(notifier: CopyNotifier | null): void {
    copyNotifier = notifier;
}

/** Show copy feedback when a notifier is wired. */
export function notifyCopy(
    message: string,
    tone: 'default' | 'success' = 'success',
): void {
    copyNotifier?.(message, tone);
}
