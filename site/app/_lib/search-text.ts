/** Comparison key for search boxes. Accents match the plain letter: jamón and jamon. */
export function foldSearchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}
