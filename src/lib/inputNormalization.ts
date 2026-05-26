export function normalizeUppercaseNoAccents(value: string): string {
  return value
    .replace(/Ñ/g, "__ENYE_UPPER__")
    .replace(/ñ/g, "__ENYE_LOWER__")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/__ENYE_UPPER__/g, "Ñ")
    .replace(/__ENYE_LOWER__/g, "ñ")
    .toUpperCase();
}

export function normalizeForSearch(value: string | null | undefined): string {
  return normalizeUppercaseNoAccents(value ?? "").trim();
}
