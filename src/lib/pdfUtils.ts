/**
 * Sanitize text for jsPDF rendering.
 * jsPDF's built-in fonts (helvetica, courier, times) only support
 * Windows-1252 / Latin-1 characters. Emoji and other Unicode characters
 * outside that range produce garbled output (e.g. "Ø=Üd").
 *
 * This function strips unsupported characters while preserving
 * accented Latin characters (é, ã, ç, etc.) and common symbols.
 */
export function sanitizePdfText(text: string): string {
  if (!text) return '';
  // Remove characters outside the Basic Latin + Latin-1 Supplement range (U+0000–U+00FF)
  // This keeps standard ASCII, accented chars (àáâãäåèéêëìíîïòóôõöùúûüýÿñç etc.), and common symbols (©, ®, ±, etc.)
  // but removes emoji, CJK, and other multi-byte Unicode characters that jsPDF can't render.
  return text.replace(/[^\u0000-\u00FF]/g, '').trim();
}
