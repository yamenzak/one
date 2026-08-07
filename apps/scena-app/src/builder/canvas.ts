/**
 * THE SLIDE CANVAS — what an unstyled screen looks like.
 *
 * ⚠️ This is CONTENT, not chrome, which is why it is a literal and not a token.
 * It is the backdrop a widget is composed against in the builder and the
 * variant picker, and it stands for a television with nothing on it. Routing it
 * through `--card` or `--surface-2` would make the canvas change colour with
 * the operator's theme while the actual screen in the lobby did not — so the
 * builder would stop being WYSIWYG in the one place that matters most.
 *
 * It was spelled out twice, in two files, byte-identically. One definition
 * means a change to the canvas is a change to both previews.
 */
export const SLIDE_CANVAS = "linear-gradient(135deg, oklch(0.28 0.03 300), oklch(0.19 0.02 300))";
