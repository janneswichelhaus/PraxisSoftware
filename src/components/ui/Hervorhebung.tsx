/**
 * Hebt in einem Suchtreffer hervor, was getippt wurde: der passende Teil in
 * 800, der Rest wie bisher (Auftrag Jannes vom 16.10.2026, „Suche, die
 * aufgeht“, ANN-567). Der Text bleibt derselbe; für Vorlesesoftware bleibt
 * es ein Text - kein `mark`, kein `strong`, die eine Betonung vorlesen würden.
 *
 * Gesucht wird ohne Rücksicht auf Groß- und Kleinschreibung, die erste
 * Fundstelle. Trifft die Suche den Text nicht wörtlich - etwa über ein
 * Stichwort der Funktion -, bleibt er unverändert.
 */
export function Hervorhebung({ text, suche }: { text: string; suche: string }) {
  const begriff = suche.trim();
  if (begriff.length === 0) return text;
  const stelle = text.toLocaleLowerCase('de-DE').indexOf(begriff.toLocaleLowerCase('de-DE'));
  if (stelle < 0 || text.length !== text.toLocaleLowerCase('de-DE').length) return text;
  return (
    <>
      {text.slice(0, stelle)}
      <span data-treffer="" className="font-extrabold">
        {text.slice(stelle, stelle + begriff.length)}
      </span>
      {text.slice(stelle + begriff.length)}
    </>
  );
}
