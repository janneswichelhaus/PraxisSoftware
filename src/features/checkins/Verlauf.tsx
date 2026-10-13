import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Punktbild } from '@/components/ui/Punktbild';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Select } from '@/components/ui/Select';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Zwischentitel } from '@/components/ui/Zwischentitel';
import {
  EINGABETEXTE,
  useTextverlustschutz,
  type Verlustschutztexte,
} from '@/features/documentation/Textverlustschutz';
import { formatDate } from '@/lib/datum';
import { wertText } from '@/lib/erfassungsgroessen';
import {
  EREIGNISARTEN,
  EREIGNIS_NOTIZ_MAX,
  ereignisartTexte,
  type Ereignisart,
} from '@/lib/verlaufsereignisse';
import { bildreihen } from '@/lib/verlaufsbild';
import {
  checkinsKey,
  trainingsereignisEntfernen,
  trainingsereignisVermerken,
  type CheckinDaten,
  type Verhaeltnisart,
} from './api';
import type { Verlaufsmarkierung } from './markierungen';

/**
 * Das Verlaufsbild in „Zwischen den Terminen“ (OUT-001, IDEA-OUT-005): je
 * Größe ein Punktbild, daneben, was einen Wert erklären könnte – vermerkte
 * Ereignisse, Planwechsel und durchgeführte Termine.
 *
 * Die Praxissicht ist die dichte (IDEA-OUT-008): Rohwerte, Skala, Zahlen. Was
 * nicht entsteht (ADR-006 Punkt 11, `verbot-verlaufsbewertung`): keine Linie,
 * kein Trend, keine Farbe nach Höhe, keine Schwelle, kein Satz über die
 * Bedeutung. Ob ein Ereignis einen Wert erklärt, sagt die Anwendung nicht.
 */

/**
 * Die Bilder einer Gruppe (Check-ins oder nach den Einheiten) mit derselben
 * Zeitachse, damit Punkte und Markierungen übereinander stehen.
 */
export function Verlaufsbilder({
  erfassungen,
  markierungen,
  termine,
}: {
  erfassungen: readonly { datum: string; werte: Record<string, number> }[];
  markierungen: readonly Verlaufsmarkierung[];
  termine: readonly string[];
}) {
  const reihen = bildreihen(erfassungen);
  if (reihen.length === 0) return null;
  const achse = [...erfassungen.map((e) => e.datum), ...markierungen.map((m) => m.datum)];
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {reihen.map((reihe) => (
        <Punktbild
          key={reihe.groesse.key}
          beschriftung={
            <>
              {reihe.groesse.kurz}
              {reihe.groesse.enden ? (
                <span className="text-ink-muted block font-normal">
                  {reihe.groesse.min} {reihe.groesse.enden[0]} · {reihe.groesse.max}{' '}
                  {reihe.groesse.enden[1]}
                </span>
              ) : null}
            </>
          }
          skala={{ min: reihe.groesse.min, max: reihe.groesse.max }}
          punkte={reihe.punkte}
          markierungen={markierungen}
          termine={termine}
          wertText={(w) => wertText(reihe.groesse, w)}
          zeitraumDaten={achse}
        />
      ))}
    </div>
  );
}

/**
 * Die Liste der Markierungen mit derselben Nummer wie im Bild. Im Training
 * vermerkt und entfernt die Betreuung hier (ANN-364); in der Behandlung
 * stehen die Ereignisse der Akte, gesetzt im Befund.
 */
export function Verlaufsereignisse({
  art,
  verhaeltnisId,
  daten,
  markierungen,
}: {
  art: Verhaeltnisart;
  verhaeltnisId: string;
  daten: CheckinDaten;
  markierungen: readonly Verlaufsmarkierung[];
}) {
  const entfernbar = art === 'training' && daten.can_write;
  return (
    <div className="flex flex-col gap-2">
      <Zwischentitel>Ereignisse im Verlauf</Zwischentitel>
      {markierungen.length === 0 ? (
        <p className="text-ink-muted text-sm">Noch kein Ereignis, kein Planwechsel.</p>
      ) : (
        <ol className="flex flex-col gap-1 text-sm">
          {markierungen.map((m, i) => (
            <Markierungszeile
              key={`${m.datum}-${i}`}
              nummer={i + 1}
              markierung={m}
              art={art}
              verhaeltnisId={verhaeltnisId}
              entfernbar={entfernbar && m.ereignis !== undefined}
            />
          ))}
        </ol>
      )}
      {daten.appointment_days.length > 0 ? (
        <p className="text-ink-muted text-sm">Striche an der Zeitachse: durchgeführte Termine.</p>
      ) : null}
      {art === 'treatment' ? (
        <p className="text-ink-muted text-sm">
          Ereignisse wie Operation oder Erkrankung vermerkt die Praxis im Befund unter „Verlauf“.
        </p>
      ) : daten.events_writable ? (
        <EreignisVermerken verhaeltnisId={verhaeltnisId} heute={daten.today} />
      ) : daten.can_write && daten.relationship_open && daten.health_consent === false ? (
        <p className="text-ink-muted text-sm">
          Ereignisse wie Operation oder Erkrankung sind Gesundheitsangaben. Vermerkt werden sie erst
          mit der Einwilligung zu Gesundheitsangaben im Training.
        </p>
      ) : null}
    </div>
  );
}

function Markierungszeile({
  nummer,
  markierung,
  art,
  verhaeltnisId,
  entfernbar,
}: {
  nummer: number;
  markierung: Verlaufsmarkierung;
  art: Verhaeltnisart;
  verhaeltnisId: string;
  entfernbar: boolean;
}) {
  const queryClient = useQueryClient();
  const [fehler, setFehler] = useState<string | undefined>(undefined);
  const tag = formatDate(markierung.datum);

  async function entfernen() {
    setFehler(undefined);
    try {
      await trainingsereignisEntfernen(markierung.ereignis!.id);
      await queryClient.invalidateQueries({ queryKey: checkinsKey(art, verhaeltnisId) });
    } catch (ursache) {
      setFehler(ursache instanceof Error ? ursache.message : undefined);
      throw ursache;
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-x-3">
      <span className="text-ink-muted w-6 shrink-0 tabular-nums">{nummer}</span>
      <span className="text-ink-muted w-24 shrink-0 tabular-nums">{tag}</span>
      <span className="text-ink min-w-0 flex-1">{markierung.lang}</span>
      {entfernbar ? (
        <div className="basis-full sm:basis-auto">
          <Rueckfrage
            ausloeser="Entfernen"
            ausloeserVariante="quiet"
            ausloeserGroesse="kompakt"
            bezeichnung={`Ereignis ${nummer} entfernen`}
            bestaetigen="Ja, Ereignis entfernen"
            bestaetigenLaeuft="Wird entfernt …"
            fehler={fehler}
            onAbbrechen={() => setFehler(undefined)}
            onBestaetigen={entfernen}
          >
            „{markierung.text}“ vom {tag} wird aus dem Verlauf genommen. Wer es vermerkt und wer es
            entfernt hat, bleibt gespeichert.
          </Rueckfrage>
        </div>
      ) : null}
    </li>
  );
}

const EREIGNISTEXTE: Verlustschutztexte = {
  ...EINGABETEXTE,
  bezeichnung: 'Ungespeichertes Ereignis',
};

/** Ohne Vorauswahl der Art – wie im Befund (BEF-14). */
function EreignisVermerken({ verhaeltnisId, heute }: { verhaeltnisId: string; heute: string }) {
  const queryClient = useQueryClient();
  const [datum, setDatum] = useState(heute);
  const [art, setArt] = useState<Ereignisart | ''>('');
  const [notiz, setNotiz] = useState('');
  const [fehler, setFehler] = useState<{ datum?: string | undefined; art?: string | undefined }>(
    {},
  );
  const ungespeichert = art !== '' || notiz.trim() !== '' || datum !== heute;
  const { schutz } = useTextverlustschutz({ ungespeichert, texte: EREIGNISTEXTE });

  const vermerken = useMutation({
    mutationFn: (gewaehlt: Ereignisart) =>
      trainingsereignisVermerken({ verhaeltnisId, datum, art: gewaehlt, notiz }),
    onSuccess: async () => {
      setDatum(heute);
      setArt('');
      setNotiz('');
      await queryClient.invalidateQueries({ queryKey: checkinsKey('training', verhaeltnisId) });
    },
  });

  function absenden(event: FormEvent) {
    event.preventDefault();
    if (vermerken.isPending) return;
    const neu = {
      ...(datum === '' ? { datum: 'Bitte den Tag angeben.' } : {}),
      ...(art === '' ? { art: 'Bitte die Art wählen.' } : {}),
    };
    setFehler(neu);
    if (art === '' || datum === '') return;
    vermerken.mutate(art);
  }

  return (
    <form
      onSubmit={absenden}
      noValidate
      aria-label="Ereignis vermerken"
      className="max-w-formular mt-2 flex flex-col gap-3"
    >
      <Zwischentitel ebene={4}>Ereignis vermerken</Zwischentitel>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Tag"
          type="date"
          value={datum}
          required
          error={fehler.datum}
          onChange={(e) => {
            setDatum(e.target.value);
            setFehler((bisher) => ({ ...bisher, datum: undefined }));
          }}
        />
        <Select
          label="Art"
          value={art}
          required
          error={fehler.art}
          onChange={(e) => {
            setArt(e.target.value as Ereignisart | '');
            setFehler((bisher) => ({ ...bisher, art: undefined }));
          }}
        >
          <option value="">Bitte wählen</option>
          {EREIGNISARTEN.map((a) => (
            <option key={a} value={a}>
              {ereignisartTexte[a]}
            </option>
          ))}
        </Select>
      </div>
      <Field
        label="Notiz (optional)"
        hint="Kurz, etwa „zwei Wochen Urlaub“ oder „Erkältung“."
        maxLength={EREIGNIS_NOTIZ_MAX}
        value={notiz}
        onChange={(e) => setNotiz(e.target.value)}
      />
      {vermerken.isError ? (
        <Statusmeldung ton="fehler">{vermerken.error.message}</Statusmeldung>
      ) : null}
      {schutz}
      <div>
        <Button type="submit" variant="secondary" groesse="kompakt" disabled={vermerken.isPending}>
          {vermerken.isPending ? 'Wird vermerkt …' : 'Vermerken'}
        </Button>
      </div>
    </form>
  );
}
