import { antwortText, type Antwort, type Antworten } from './antworten';
import { KoerperschemaBild } from './KoerperschemaFeld';
import { beschriftung } from './darstellung';
import type { ScoreDefinition } from './schema';

/**
 * Eine Erhebung zum Lesen: Frage und Antwort, beides wörtlich (FRB-002b).
 *
 * Keine Zusammenfassung, keine Deutung (ADR-006 Punkt 3 und 11). Was offen
 * blieb, steht als Liste der Nummern darunter — „nicht beantwortet" ist eine
 * Auskunft, und sie soll nicht in 30 leeren Zeilen untergehen.
 */
export function ErhebungAnsicht({
  definition,
  antworten,
  antwortAnzeige = antwortText,
}: {
  definition: ScoreDefinition;
  antworten: Antworten;
  /** Für das Körperschema, dessen Bereiche Namen brauchen. */
  antwortAnzeige?: typeof antwortText;
}) {
  const beantwortet = definition.items.filter((item) => antworten[item.id] !== undefined);
  const offen = definition.items.filter((item) => antworten[item.id] === undefined);

  return (
    <div className="flex flex-col gap-3">
      {beantwortet.length === 0 ? (
        <p className="text-ink-muted text-sm">Noch keine Frage beantwortet.</p>
      ) : (
        <dl className="flex flex-col gap-3">
          {beantwortet.map((item) => (
            <div key={item.id}>
              <dt className="text-ink-muted text-sm">{beschriftung(item)}</dt>
              <dd className="text-ink text-[0.9375rem] whitespace-pre-line">
                {antwortAnzeige(item, antworten[item.id])}
                {item.typ === 'koerperschema' ? (
                  <div className="mt-2">
                    <KoerperschemaBild bereiche={gewaehlteBereiche(antworten[item.id])} />
                  </div>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {offen.length > 0 ? (
        <p className="text-ink-muted text-sm">
          Nicht beantwortet:{' '}
          {[...new Set(offen.map((item) => (item.nummer ? String(item.nummer) : item.text)))].join(
            ', ',
          )}
        </p>
      ) : null}
    </div>
  );
}

function gewaehlteBereiche(antwort: Antwort | undefined): string[] {
  return antwort && 'bereiche' in antwort ? antwort.bereiche : [];
}
