/**
 * Copy text to the clipboard, with a fallback.
 *
 * Why the fallback: `navigator.clipboard` only exists in a secure context
 * (HTTPS or localhost). On any plain-HTTP origin it is simply `undefined`, so
 * `navigator.clipboard?.writeText(...)` silently does nothing and the button
 * looks broken with no error. The textarea + execCommand path works in those
 * contexts and on older mobile browsers, so tap-to-copy never becomes a no-op.
 */

export type CopyResult = "copied" | "failed";

export async function copyText(text: string): Promise<CopyResult> {
  if (!text) return "failed";

  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return "copied";
    } catch {
      // Permission denied or blocked — fall through to the legacy path.
    }
  }

  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "0";
    ta.style.opacity = "0";
    document.body.appendChild(ta);

    // iOS Safari ignores copy unless the field is selected.
    ta.focus();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok ? "copied" : "failed";
  } catch {
    return "failed";
  }
}