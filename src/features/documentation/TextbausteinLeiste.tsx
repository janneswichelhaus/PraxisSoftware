import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Textlink } from '@/components/ui/Textlink';
import { mitRueckweg } from '@/lib/rueckweg';
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
 * `title`-Attribut zeigt den vollen Text. Hat jemand keine Bausteine, steht
 * dort der Weg, welche anzulegen - eine leere Leiste wäre ein Rätsel.
 *
 * Die Leiste ist eine benannte Gruppe (DOK-20); das sichtbare „Textbausteine:“
 * wiederholt den Namen nur für das Auge. Die Knöpfe sind kompakte
 * Kartenaktionen wie im Bausteinfeld darunter (DOK-13, UIK-14).
 */
export function TextbausteinLeiste({
  onEinfuegen,
}: {
  onEinfuegen: (text: string, titel: string) => void;
}) {
  const ort = useLocation();
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

  return (
    <div className="nicht-drucken mb-3">
      <div role="group" aria-label="Textbausteine" className="flex flex-wrap items-center gap-2">
        <span aria-hidden="true" className="text-ink-muted text-sm">
          Textbausteine:
        </span>

        {bausteine.length === 0 ? (
          <span className="text-ink-muted text-sm">noch keine angelegt</span>
        ) : (
          bausteine.map((baustein) => (
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
          ))
        )}

        {/* Die Bausteinseite ist eine Bereichsseite; ihr Rückweg führt hierher
            zurück, samt dem Rückweg dieser Seite (DOK-01). Der Pfeil ist
            Schmuck und wird nicht vorgelesen (WRT-08). */}
        <Textlink
          to={mitRueckweg('/praxis/textbausteine', `${ort.pathname}${ort.search}`)}
          alleinstehend
          // `gap-1`: Im `inline-flex` des Links fiele das Leerzeichen vor dem
          // Pfeil weg.
          className="gap-1 px-1 text-sm font-medium"
        >
          Bausteine verwalten <span aria-hidden="true">→</span>
        </Textlink>
      </div>
    </div>
  );
}
