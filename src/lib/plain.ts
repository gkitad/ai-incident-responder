/**
 * Replaces long dashes (em and en) in model output with plain punctuation,
 * so nothing on the page uses them. Number ranges like 9–5 become 9-5.
 */
export function plain<T>(value: T): T {
  if (typeof value === "string") {
    return value
      .replace(/(\d)\s*[–—]\s*(\d)/g, "$1-$2")
      .replace(/\s*[–—]\s*/g, ", ") as T;
  }
  if (Array.isArray(value)) return value.map(plain) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)])) as T;
  }
  return value;
}
