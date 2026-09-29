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
}: {
  onEinfuegen: (text: string, titel: string) => void;
}) {
  const { data, isPending, isError } = useQuery({
    queryKey: ['text-snippets'],
    queryFn: fetchTextSnippets,
    retry: false,
    // Bausteine ändern sich selten; jede Dokumentationsseite soll sie nicht
    // neu holen.
    staleTime: 5 * 60 * 1000,
  });

  // Ein Fehler hier darf die Dokumentation nicht blockieren: Bausteine sind
  // Komfort, der Freitext ist die Aufgabe.
  if (isPending || isError) return null;

  const bausteine: TextSnippet[] = data;
  if (bausteine.length === 0) return null;

  return (
    <div className="nicht-drucken mb-3">
      <div role="group" aria-label="Textbausteine" className="flex flex-wrap items-center gap-2">
        {bausteine.map((baustein) => (
          <Button
            key={baustein.id}
            type="button"
            variant="secondary"
            groesse="kompakt"
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
