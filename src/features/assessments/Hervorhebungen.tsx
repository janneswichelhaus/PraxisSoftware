import { Disclosure } from '@/components/ui/Card';
import { formatDate } from '@/lib/datum';
import type { Antworten } from './antworten';
import { hervorhebungen } from './hervorhebung';
import type { ScoreDefinition } from './schema';

/**
 * Hervorgehobene Angaben einer Erhebung (FRB-002c, §7.1, ANN-104).
 *
 * Sichtbar gemacht wird die Angabe selbst, mit Frage und Datum — die Quelle,
 * auf die sie eindeutig zurückführt (ADR-006 Punkt 3). Daneben steht die Regel,
 * nach der sie hervorgehoben ist. Was sie bedeutet und was daraus folgt,
 * steht hier nicht: Die Entscheidung trifft die Therapeut:in.
 *
 * Die Gestaltung ist bewusst ein Rahmen und keine Ampel: kein Rot, kein
 * Symbol, keine Zahl, die Treffer zählt (ADR-006 Punkt 11 — auch Farbe und
 * Symbol sind eine Aussage).
 */
export function Hervorhebungen({
  definition,
  antworten,
  datum,
}: {
  definition: ScoreDefinition;
  antworten: Antworten;
  datum: string;
}) {
  const treffer = hervorhebungen(definition, antworten);
  const offen = [
    ...new Set(
      definition.hervorhebungen.flatMap((regel) => {
        const item = definition.items.find((i) => i.id === regel.item);
        return item && antworten[item.id] === undefined && item.nummer ? [item.nummer] : [];
      }),
    ),
  ];
  if (definition.hervorhebungen.length === 0) return null;

  return (
    <div className="border-line-strong rounded-field mt-3 border p-3">
      <h4 className="text-ink text-sm font-semibold">Hervorgehobene Angaben</h4>
      {treffer.length === 0 ? (
        // Eine Feststellung über das Angekreuzte, keine Entwarnung - und was
        // offen blieb, steht dabei (Zweitreview FRB-EPIC-002, Befund 2).
        <p className="text-ink-muted mt-1 text-sm">
          Nach den Regeln unten ist nichts angekreuzt.
          {offen.length > 0 ? ` Nicht beantwortet: Frage ${offen.join(', ')}.` : ''}
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {treffer.map(({ regel, item, angaben }) => (
            <li key={regel.id}>
              <p className="text-ink text-[0.9375rem]">
                <span className="text-ink-muted">
                  Frage {item.nummer}, Angabe vom {formatDate(datum)}:{' '}
                </span>
                {angaben.join(', ')}
              </p>
            </li>
          ))}
        </ul>
      )}
      <Disclosure summary="Nach welchen Regeln hervorgehoben wird">
        <ul className="flex flex-col gap-2 text-sm">
          {definition.hervorhebungen.map((regel) => (
            <li key={regel.id}>
              <p className="text-ink">{regel.regel}</p>
              <p className="text-ink-muted">Quelle: {regel.quelle}</p>
            </li>
          ))}
        </ul>
        <p className="text-ink-muted mt-2 text-sm">
          Hervorgehoben wird nur, was angekreuzt ist — unverändert. Eine Bewertung entsteht nicht
          (PROJECT_PRINCIPLES.md §7.1).
        </p>
      </Disclosure>
    </div>
  );
}
