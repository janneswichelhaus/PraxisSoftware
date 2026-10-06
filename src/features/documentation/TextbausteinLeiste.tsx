import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { fetchTextSnippets, type TextSnippet } from './textbausteine';

/**
 * Die Bausteinleiste über dem Freitext (UX-008).
 *
 * Ein Tap fügt den Baustein ans Ende des bereits Geschriebenen ein. Bewusst
 * kein Menü und kein Dialog: Der Weg soll kürzer sein als das Tippen, sonst
 * ist er sinnlos. Was dabei geschah, sagt die Seite unter dem Feld - dafür
 * bekommt sie neben dem Text auch den Titel des Bausteins (DOK-10).
 *
 * Praxisweite Bausteine stehen vorn (die Reihenfolge kommt vom Server), eigene
 * dahinter; der Titel des Knopfes ist der Titel des Bausteins, sein
 * `title`-Attribut zeigt den vollen Text. Ohne Bausteine steht die Leiste
 * nicht da.
 *
 * Die Leiste ist eine benannte Gruppe (DOK-20), ohne sichtbare Überschrift
 * und ohne „Bausteine verwalten“ (BEF-077): Die Knöpfe erklären sich selbst,
 * und gepflegt werden Bausteine unter Organisatorisches → Textbausteine. Die
 * Knöpfe sind kompakte Kartenaktionen wie im Bausteinfeld darunter (DOK-13,
 * UIK-14).
 */
export function TextbausteinLeiste({
  onEinfuegen,
  alsChips = false,
}: {
  onEinfuegen: (text: string, titel: string) => void;
  /**
   * Als Chips in der waagerecht laufenden Zeile der Schreibseite
   * (Design-Handoff 2026-10-01, Abschnitt 6a): ohne Umbruch, ohne Abstand
   * nach unten - die Zeile drumherum stellt die Seite.
   */
  alsChips?: boolean;
}) {
  const { data, isPending, isError } = useQuery({
    queryKey: ['text-snippets'],
    queryFn: fetchTextSnippets,
    retry: false,
    // Bausteine ändern sich selten; jede Dokumentationsseite soll sie nicht
    // neu holen.
    staleTime: 5 * 60 * 1000,
  });

  // Während des Ladens hält ein Platzhalter die Höhe einer Knopfreihe frei:
  // Sonst sprang das Textfeld darunter, sobald die Bausteine ankamen
  // (BEF-057). Ein Fehler hier darf die Dokumentation nicht blockieren:
  // Bausteine sind Komfort, der Freitext ist die Aufgabe.
  if (isPending) {
    return (
      <div
        aria-hidden="true"
        data-testid="bausteine-platzhalter"
        className={alsChips ? 'min-h-11 w-24 shrink-0' : 'nicht-drucken mb-3 min-h-11'}
      />
    );
  }
  if (isError) return null;

  const bausteine: TextSnippet[] = data;
  if (bausteine.length === 0) return null;

  if (alsChips) {
    return (
      <div role="group" aria-label="Textbausteine" className="flex shrink-0 items-center gap-2">
        {bausteine.map((baustein) => (
          <Button
            key={baustein.id}
            type="button"
            variant="secondary"
            groesse="kompakt"
            className="shrink-0 whitespace-nowrap"
            title={baustein.body}
            onClick={() => onEinfuegen(baustein.body, baustein.title)}
          >
            {baustein.title}
          </Button>
        ))}
      </div>
    );
  }

  return (
    <div className="nicht-drucken mb-3">
      {/* Am Handy eine Reihe, die waagerecht läuft (BEF-057 Option 2): Drei
          Bausteine in zwei bis drei Zeilen schoben das Feld unter den Falz.
          Ab 640 px umbrechend wie bisher. */}
      <div
        role="group"
        aria-label="Textbausteine"
        className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 py-0.5 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:py-0"
      >
        {bausteine.map((baustein) => (
          <Button
            key={baustein.id}
            type="button"
            variant="secondary"
            groesse="kompakt"
            className="max-sm:shrink-0 max-sm:whitespace-nowrap"
            title={baustein.body}
            onClick={() => onEinfuegen(baustein.body, baustein.title)}
          >
            {baustein.title}
          </Button>
        ))}
      </div>
    </div>
  );
}
