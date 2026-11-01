import { useId, useState, type CSSProperties } from 'react';
import { Button } from '@/components/ui/Button';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import type { ScoreDefinition } from './schema';
import { ankerVon, stufenVon, type SkalenAmTermin } from './skalenAmTermin';

/**
 * Die Skalen als Streifen unter der Chipzeile, wie „+ Befund“ (ANN-823). Der Wert steht nach
 * „Übernehmen“ in der Erhebung; die Zeile im Eintrag ist nur seine Abschrift.
 */
export function SkalenStreifen({
  offen,
  skalen,
  gesperrt,
  verbunden,
  meldung,
  onUebernehmen,
}: {
  offen: boolean;
  skalen: SkalenAmTermin;
  gesperrt: boolean;
  verbunden: boolean;
  /** Steht ein Vorschlag noch aus, sagt die Seite es hier (wie bei den Bausteinen). */
  meldung: string | undefined;
  onUebernehmen: (text: string) => void;
}) {
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | undefined>(undefined);
  const gewaehlt = skalen.text !== '';

  async function uebernehmen() {
    setLaeuft(true);
    setFehler(undefined);
    try {
      onUebernehmen(await skalen.uebernehmen());
    } catch (error) {
      setFehler(
        error instanceof Error ? error.message : 'Die Skalen konnten nicht gespeichert werden.',
      );
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <div
      id="skalen-streifen"
      hidden={!offen}
      className="nicht-drucken bg-canvas border-line border-b"
    >
      <fieldset
        disabled={gesperrt || laeuft}
        aria-label="Skalen"
        className="m-0 flex min-w-0 flex-col gap-4 border-0 px-4 py-3"
      >
        {skalen.skalen.map((definition) => (
          <Skala
            key={definition.meta.id}
            definition={definition}
            kennung={skalen.wahl[definition.meta.id]}
            onWahl={(kennung) => skalen.setzen(definition.meta.id, kennung)}
          />
        ))}

        {gewaehlt ? (
          <div className="flex flex-col gap-3">
            <p className="border-line-strong text-ink border-l-2 py-0.5 pl-3 text-sm whitespace-pre-wrap">
              {skalen.text}
            </p>
            {meldung ? <Statusmeldung ton="fehler">{meldung}</Statusmeldung> : null}
            {fehler ? <Statusmeldung ton="fehler">{fehler}</Statusmeldung> : null}
            {verbunden ? null : (
              <Statusmeldung ton="warnung">
                Ohne Verbindung lassen sich die Skalen nicht speichern.
              </Statusmeldung>
            )}
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="primary"
                groesse="kompakt"
                disabled={!verbunden}
                onClick={() => void uebernehmen()}
              >
                {laeuft ? 'Speichert …' : 'Übernehmen'}
              </Button>
              <Button type="button" variant="quiet" groesse="kompakt" onClick={skalen.verwerfen}>
                Verwerfen
              </Button>
            </div>
          </div>
        ) : null}
      </fieldset>
    </div>
  );
}

function Skala({
  definition,
  kennung,
  onWahl,
}: {
  definition: ScoreDefinition;
  kennung: string | undefined;
  onWahl: (kennung: string | undefined) => void;
}) {
  const name = useId();
  const titelId = useId();
  const item = definition.items[0];
  if (!item) return null;
  const stufen = stufenVon(item);
  const anker = ankerVon(item);
  const gewaehlt = stufen.find((s) => s.kennung === kennung);
  // Bis sieben Stufen in einer Reihe; die elf der NRS am Telefon in zwei.
  const spaltenAmHandy = stufen.length > 7 ? Math.ceil(stufen.length / 2) : stufen.length;

  return (
    <fieldset aria-labelledby={titelId} className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
      <legend id={titelId} className="text-ink text-sm font-medium">
        {item.text}
      </legend>
      <div
        className="grid max-w-md grid-cols-[repeat(var(--skala-spalten),minmax(2.75rem,1fr))] gap-1 sm:max-w-none sm:grid-flow-col sm:grid-cols-none sm:gap-0.5"
        style={{ '--skala-spalten': spaltenAmHandy } as CSSProperties}
      >
        {stufen.map((stufe) => (
          <label
            key={stufe.kennung}
            className="has-[:checked]:bg-accent has-[:checked]:border-accent has-[:checked]:text-surface border-line-strong text-ink rounded-field has-[:focus-visible]:outline-accent flex min-h-11 cursor-pointer items-center justify-center border text-sm tabular-nums has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 sm:min-w-11"
          >
            <input
              type="radio"
              name={name}
              className="sr-only"
              aria-label={stufe.bedeutung === stufe.text ? undefined : stufe.bedeutung}
              checked={kennung === stufe.kennung}
              // Ein zweiter Tipp auf dieselbe Stufe nimmt sie zurück.
              onClick={() => (kennung === stufe.kennung ? onWahl(undefined) : undefined)}
              onChange={() => onWahl(stufe.kennung)}
            />
            {stufe.text}
          </label>
        ))}
      </div>
      {anker ? (
        <div className="text-ink-muted flex max-w-md justify-between gap-4 text-xs sm:max-w-none">
          <span>{anker.min}</span>
          <span className="text-right">{anker.max}</span>
        </div>
      ) : null}
      <p aria-live="polite" className="text-ink-muted min-h-5 text-sm">
        {gewaehlt ? `gewählt: ${gewaehlt.bedeutung}` : ''}
      </p>
    </fieldset>
  );
}
