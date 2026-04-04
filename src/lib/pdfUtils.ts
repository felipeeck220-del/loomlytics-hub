/**
 * Sanitize text for jsPDF rendering.
 * jsPDF's built-in fonts (helvetica, courier, times) only support
 * Windows-1252 / Latin-1 characters. Emoji and other Unicode characters
 * outside that range produce garbled output (e.g. "Ø=Üd").
 *
 * This function replaces common Unicode punctuation with ASCII equivalents
 * and strips unsupported characters while preserving accented Latin characters.
 */
export function sanitizePdfText(text: string): string {
  if (!text) return '';
  return text
    // Replace common Unicode punctuation with ASCII equivalents
    .replace(/\u2014/g, '-')   // em-dash —
    .replace(/\u2013/g, '-')   // en-dash –
    .replace(/\u2018/g, "'")   // left single quote '
    .replace(/\u2019/g, "'")   // right single quote '
    .replace(/\u201C/g, '"')   // left double quote "
    .replace(/\u201D/g, '"')   // right double quote "
    .replace(/\u2026/g, '...') // ellipsis …
    .replace(/\u00B7/g, '.')   // middle dot · (keep as period if needed)
    .replace(/\u2022/g, '-')   // bullet •
    // Remove characters outside Windows-1252 compatible range
    // Keep U+0000–U+00FF (Basic Latin + Latin-1 Supplement)
    .replace(/[^\u0000-\u00FF]/g, '')
    .trim();
}
