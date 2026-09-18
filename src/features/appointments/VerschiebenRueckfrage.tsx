import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/Button';

/**
 * Was die Rückfrage beim Verschieben zeigt (CAL-023).
 *
 * Alte und neue Zeit im Klartext; die behandelnde Person nur, wenn sie
 * wechselt — sonst wäre sie an jeder Verschiebung dieselbe Auskunft.
 */
export interface VerschiebenFrage {
  alteZeit: string;
  neueZeit: string;
  personWechsel: { von: string; nach: string } | null;
  /**
   * Die neue Zeit liegt außerhalb der hinterlegten Arbeitszeit.
   *
   * Steht in **derselben** Rückfrage, nicht in einer zweiten dahinter. Die
   * Auskunft ist ein Hinweis aus den geladenen Arbeitszeiten; ob der Termin
   * wirklich außerhalb liegt, entscheidet der Server (CAL-005).
   */
  ausserhalb: boolean;
}

/**
 * Rückfrage nach dem Loslassen einer gezogenen Kachel (CAL-023).
 *
 * Das Loslassen schreibt nicht mehr: Eine Geste ist schnell versehentlich
 * gemacht, und am Finger erst recht. Die Rückfrage kommt **immer** — auch wenn
 * die Zielzeit frei ist. Bis zur Bestätigung bleibt die Kachel, wo sie war;
 * die Rückgängig-Leiste danach fängt die versehentliche Bestätigung (UX-010).
 *
 * Kein modaler Dialog, wie die übrigen Rückfragen (UI-000): Der Kasten nimmt
 * der Seite nichts weg. Der Fokus wandert beim Öffnen auf die bestätigende
 * Schaltfläche — das holt den Kasten zugleich in den sichtbaren Bereich, wenn
 * das Gitter darunter weit gescrollt war —, und Escape bricht ab.
 */
export function VerschiebenRueckfrage({
  frage,
  laeuft,
  onBestaetigen,
  onAbbrechen,
}: {
  frage: VerschiebenFrage;
  laeuft: boolean;
  onBestaetigen: () => void;
  onAbbrechen: () => void;
}) {
  const bestaetigenRef = useRef<HTMLButtonElement>(null);

  // Bei jeder neuen Frage, auch wenn dieselbe Rückfrage mit dem Hinweis auf
  // die Arbeitszeit wiederkommt.
  useEffect(() => {
    bestaetigenRef.current?.focus();
  }, [frage]);

  return (
    <div
      role="group"
      aria-label="Termin verschieben?"
      className="border-line-strong bg-surface-sunken rounded-card mt-4 border p-4"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !laeuft) onAbbrechen();
      }}
    >
      <p className="text-ink text-sm font-medium">Termin verschieben?</p>
      <dl className="text-ink mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-ink-muted">Bisher</dt>
        <dd className="tabular-nums">{frage.alteZeit}</dd>
        <dt className="text-ink-muted">Neu</dt>
        <dd className="font-medium tabular-nums">{frage.neueZeit}</dd>
        {frage.personWechsel ? (
          <>
            <dt className="text-ink-muted">Behandelnde Person</dt>
            <dd>
              {frage.personWechsel.von} → <strong>{frage.personWechsel.nach}</strong>
            </dd>
          </>
        ) : null}
      </dl>
      {frage.ausserhalb ? (
        <p className="text-ink mt-3 text-sm">
          <span aria-hidden="true">! </span>
          Die neue Zeit liegt außerhalb der hinterlegten Arbeitszeit.
        </p>
      ) : null}
      <p className="text-ink-subtle mt-2 text-xs">Der Termin wurde noch nicht verschoben.</p>
      <div className="mt-3 flex flex-wrap gap-3">
        <Button ref={bestaetigenRef} type="button" disabled={laeuft} onClick={onBestaetigen}>
          {laeuft ? 'Wird verschoben …' : frage.ausserhalb ? 'Trotzdem verschieben' : 'Verschieben'}
        </Button>
        <Button type="button" variant="quiet" disabled={laeuft} onClick={onAbbrechen}>
          Abbrechen
        </Button>
      </div>
    </div>
  );
}
