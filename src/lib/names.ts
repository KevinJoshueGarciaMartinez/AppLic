export function normalizeNamePart(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function joinNameParts(...parts: Array<string | null | undefined>) {
  return parts
    .map((part) => normalizeNamePart(part))
    .filter(Boolean)
    .join(" ");
}
