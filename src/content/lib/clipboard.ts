/*!
 * Style Detective — clipboard helpers.
 */

/** Legacy copy path for pages where the Clipboard API is unavailable. */
function copyTextFallback(text: string): void {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '0';
    textarea.style.left = '0';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    if (!ok) throw new Error('execCommand copy failed');
}

/** Copy plain text to the clipboard, with a fallback when the API is blocked. */
export async function copyTextToClipboard(text: string): Promise<void> {
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
        } else {
            copyTextFallback(text);
        }
    } catch {
        copyTextFallback(text);
    }
}
