// Concatena clases ignorando falsy. Útil para combinar Tailwind condicionalmente.
export function cn(
  ...classes: Array<string | false | null | undefined>
): string {
  return classes.filter(Boolean).join(" ");
}
