import { useState } from 'react';
import { Punktbild } from '@/components/ui/Punktbild';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { formatDate } from '@/lib/datum';
import { beschriftung } from './darstellung';
import { ereignisartTexte, type Messreihe, type Verlaufsereignis } from './verlauf';

/**
 * Eine Messreihe als Bild: Punkte, keine Linie (FRB-002e, `IDEA-OUT-005`).
 * Das Bild selbst ist der gemeinsame Baustein `Punktbild` (OUT-001); hier
 * stehen Beschriftung, Skala und die Ereignisse der Akte.
 */
export function Messreihenbild({
  reihe,
  ereignisse,
  termine,
}: {
  reihe: Messreihe;
  ereignisse: readonly Verlaufsereignis[];
  /** Tage durchgeführter Termine. */
  termine: readonly string[];
}) {
  return (
    <Punktbild
      beschriftung={
        <>
          {beschriftung(reihe.item)}
          {/* Ein Wert ohne Richtung steht mit seiner Leseart da, ohne Wertung
              (Tegner: „höher = aktiver", ABN-014, BEF-101 Punkt 3). */}
          {reihe.instrument.scoring.leseart ? (
            <span className="text-ink-muted block font-normal">
              {reihe.instrument.scoring.leseart}
            </span>
          ) : null}
        </>
      }
      skala={reihe.item.skala ?? { min: 0, max: 10 }}
      punkte={reihe.punkte}
      markierungen={ereignisse.map((e) => ({
        datum: e.occurred_on,
        text: ereignisartTexte[e.kind],
      }))}
      termine={termine}
    />
  );
}

/** Die Legende der Markierungen — dieselbe Nummer wie im Bild. */
export function Ereignisliste({
  ereignisse,
  onEntfernen,
}: {
  ereignisse: readonly Verlaufsereignis[];
  /**
   * Entfernt ein Ereignis. Liefert es ein Versprechen, wartet die Rückfrage
   * darauf und zeigt einen Fehlschlag im offenen Kasten (BEF-01).
   */
  onEntfernen?: ((ereignis: Verlaufsereignis) => void | Promise<unknown>) | undefined;
}) {
  if (ereignisse.length === 0) {
    return <p className="text-ink-muted text-sm">Noch kein Ereignis vermerkt.</p>;
  }
  return (
    <ol className="flex flex-col gap-1 text-sm">
      {ereignisse.map((ereignis, i) => (
        <Ereigniszeile
          key={ereignis.id}
          nummer={i + 1}
          ereignis={ereignis}
          onEntfernen={onEntfernen}
        />
      ))}
    </ol>
  );
}

/**
 * Eine Zeile der Liste. „Entfernen" nimmt das Ereignis aus dem Verlauf; es
 * bleibt unter „Entfernte Ereignisse" nachvollziehbar (ABN-013) - erst
 * nach einer Rückfrage, die Art und Tag nennt, und gesperrt, solange es läuft
 * (BEF-01, ZST-14, ZST-20). Bis UXR-009 genügte ein Tipp, und ein zweiter
 * endete in „Das Ereignis wurde nicht gefunden."
 */
function Ereigniszeile({
  nummer,
  ereignis,
  onEntfernen,
}: {
  nummer: number;
  ereignis: Verlaufsereignis;
  onEntfernen: ((ereignis: Verlaufsereignis) => void | Promise<unknown>) | undefined;
}) {
  const [fehler, setFehler] = useState<string | undefined>(undefined);
  const art = ereignisartTexte[ereignis.kind];
  const tag = formatDate(ereignis.occurred_on);

  async function entfernen() {
    setFehler(undefined);
    try {
      await onEntfernen?.(ereignis);
    } catch (ursache) {
      // Der Kasten bleibt offen und nennt den Grund.
      setFehler(ursache instanceof Error ? ursache.message : undefined);
      throw ursache;
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-x-3">
      <span className="text-ink-muted w-6 shrink-0 tabular-nums">{nummer}</span>
      <span className="text-ink-muted w-24 shrink-0 tabular-nums">{tag}</span>
      <span className="text-ink min-w-0 flex-1">
        {art}
        {ereignis.note ? ` · ${ereignis.note}` : ''}
      </span>
      {onEntfernen ? (
        // Am Telefon in einer eigenen Zeile: Neben Nummer, Tag und Knopf
        // blieben dem Text sonst rund 80 px, sechs Zeilen je Ereignis.
        <div className="basis-full sm:basis-auto">
          <Rueckfrage
            ausloeser="Entfernen"
            ausloeserVariante="quiet"
            bezeichnung={`Ereignis ${nummer} entfernen`}
            bestaetigen="Ja, Ereignis entfernen"
            bestaetigenLaeuft="Wird entfernt …"
            fehler={fehler}
            onAbbrechen={() => setFehler(undefined)}
            onBestaetigen={entfernen}
          >
            „{art}“ vom {tag} wird aus dem Verlauf entfernt. Es bleibt unter „Entfernte Ereignisse“
            nachvollziehbar.
          </Rueckfrage>
        </div>
      ) : null}
    </li>
  );
}
