/**
 * Rufnummern als Wählziele.
 *
 * `tel:` verträgt keine Leerzeichen zuverlässig; die Anzeige bleibt die
 * eingegebene Schreibweise, gewählt wird die bereinigte Form. Ein führendes
 * Plus bleibt erhalten, alles andere außer Ziffern fällt weg.
 */
export function telHref(nummer: string): string {
  const bereinigt = nummer.trim().replace(/(?!^\+)[^0-9]/g, '');
  return `tel:${bereinigt}`;
}
