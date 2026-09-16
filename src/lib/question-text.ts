/** Converts the limited HTML carried by external question text into safe plain text for the quiz UI. */
export function normalizeQuestionText(value: string | null): string | null {
  if (value === null) return null;
  const named: Record<string, string> = { amp: "&", emsp: "  ", gt: ">", lt: "<", nbsp: " ", quot: "\"", apos: "'" };
  const decode = (text: string) => text.replace(/&(#x[0-9a-f]+|#\d+|amp|emsp|nbsp|gt|lt|quot|apos);/gi, (entity, token: string) => {
    const key = token.toLowerCase();
    if (key in named) return named[key];
    const code = key.startsWith("#x") ? Number.parseInt(key.slice(2), 16) : Number.parseInt(key.slice(1), 10);
    return Number.isInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
  });
  return decode(value)
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/\s*p\s*>/gi, "\n\n")
    .replace(/<\s*p(?:\s[^>]*)?>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|amp|emsp|nbsp|gt|lt|quot|apos);/gi, (entity, token: string) => decode(entity))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function toMediaPublicPath(relativePath: string): string {
  if (!relativePath || relativePath.split(/[\\/]/).some((part) => !part || part === "." || part === "..")) throw new Error("Invalid media path");
  return `/media/${relativePath.split(/[\\/]/).map(encodeURIComponent).join("/")}`;
}
