import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { fetchTextSnippets, type TextSnippet } from './textbausteine';

/**
 * Die Bausteinleiste über dem Freitext (UX-008).
 *
 * Ein Tap fügt den Baustein ans Ende des bereits Geschriebenen ein. Bewusst
 * kein Menü und kein Dialog: Der Weg soll kürzer sein als das Tippen, sonst
 * ist er sinnlos.
 *
 * Praxisweite Bausteine stehen vorn (die Reihenfolge kommt vom Server), eigene
 * dahinter; der Titel des Knopfes ist der Titel des Bausteins, sein
 * `title`-Attribut zeigt den vollen Text. Hat jemand keine Bausteine, steht
 * dort der Weg, welche anzulegen - eine leere Leiste wäre ein Rätsel.
 */
export function TextbausteinLeiste({ onEinfuegen }: { onEinfuegen: (text: string) => void }) {
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
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-ink-muted text-sm">Textbausteine:</span>

        {bausteine.length === 0 ? (
          <span className="text-ink-subtle text-sm">noch keine angelegt</span>
        ) : (
          bausteine.map((baustein) => (
            <button
              key={baustein.id}
              type="button"
              title={baustein.body}
              onClick={() => onEinfuegen(baustein.body)}
              className="border-line-strong bg-surface text-ink hover:bg-surface-sunken inline-flex min-h-11 items-center rounded-lg border px-3 text-sm font-medium transition-colors"
            >
              {baustein.title}
            </button>
          ))
        )}

        <Link
          to="/praxis/textbausteine"
          className="text-accent hover:text-accent-hover inline-flex min-h-11 items-center px-1 text-sm font-medium"
        >
          Bausteine verwalten →
        </Link>
      </div>
    </div>
  );
}
