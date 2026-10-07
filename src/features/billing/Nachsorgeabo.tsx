import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { ErrorState } from '@/components/ui/Feedback';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { formatDate } from '@/lib/datum';
import { formatEuro } from '@/lib/geld';
import {
  cancelNachsorge,
  createNachsorge,
  deleteNachsorge,
  fetchNachsorge,
  nachsorgeSchluessel,
  type Nachsorgeabo as Abo,
  type Nachsorgesicht,
} from './nachsorge-api';

/**
 * Das Nachsorge-Abo in der Akte (ANG-EPIC-001, PROJECT_PRINCIPLES.md 4.6 und
 * 19, ADR-009 Punkt 21).
 *
 * Nach der Behandlung geht es monatlich kündbar weiter. Angelegt wird das Abo
 * in der Praxis, nach dem Abschlussgespräch; vorher muss die Versorgung
 * abgeschlossen sein (ANN-268). Sichtbar und bedienbar für owner und office;
 * die Seite blendet den Abschnitt für alle anderen aus, verbindlich prüft der
 * Server (ADR-004).
 */
export function Nachsorgeabo({ patientId }: { patientId: string }) {
  const sicht = useQuery({
    queryKey: nachsorgeSchluessel(patientId),
    queryFn: () => fetchNachsorge(patientId),
    retry: false,
  });

  if (sicht.isPending) return null;
  if (sicht.isError) {
    return (
      <ErrorState
        title="Das Nachsorge-Abo konnte nicht geladen werden."
        description="Bitte die Verbindung prüfen und erneut versuchen."
        onErneut={() => sicht.refetch()}
      />
    );
  }
  if (!sicht.data) return null;

  const laufend = sicht.data.subscriptions.find((abo) => abo.ends_on === null);
  return (
    <div className="border-line mt-3 border-t pt-3" aria-label="Nachsorge-Abo" role="group">
      <p className="text-ink text-liste font-medium">Nachsorge-Abo</p>
      {sicht.data.subscriptions.length === 0 ? (
        <p className="text-ink-muted text-sm">Kein Abo.</p>
      ) : (
        <ul className="divide-line mt-1 divide-y">
          {sicht.data.subscriptions.map((abo) => (
            <AboZeile key={abo.id} abo={abo} patientId={patientId} />
          ))}
        </ul>
      )}
      {laufend ? null : <Anlegen patientId={patientId} sicht={sicht.data} />}
    </div>
  );
}

/** Wer gekündigt hat, in einem Satz. */
function kuendigungVon(abo: Abo): string {
  if (abo.cancelled_via === 'practice') return 'von der Praxis eingetragen';
  if (abo.cancelled_access_kind === 'legal_representative' && abo.cancelled_representative_name)
    return `über die Plattform von ${abo.cancelled_representative_name} (rechtliche Vertretung)`;
  return 'über die Plattform von der Person selbst';
}

function AboZeile({ abo, patientId }: { abo: Abo; patientId: string }) {
  return (
    <li className="flex flex-col gap-1 py-2">
      <p className="text-ink text-sm">
        {abo.ends_on === null
          ? `Läuft seit ${formatDate(abo.starts_on)}`
          : abo.ends_on < abo.starts_on
            ? `Vor dem Beginn am ${formatDate(abo.starts_on)} gekündigt`
            : `${formatDate(abo.starts_on)} bis ${formatDate(abo.ends_on)}`}
        {abo.created_by_name ? (
          <span className="text-ink-muted"> · angelegt von {abo.created_by_name}</span>
        ) : null}
      </p>
      {abo.ends_on === null && abo.next_month_start ? (
        <p className="text-ink-muted text-sm">
          Nächster Abo-Monat ab {formatDate(abo.next_month_start)}
          {abo.next_month_price_cents !== null
            ? `, ${formatEuro(abo.next_month_price_cents)}`
            : ' – die Preisliste nennt dafür keinen Preis'}
        </p>
      ) : null}
      {abo.cancelled_on ? (
        <p className="text-ink-muted text-sm">
          Gekündigt am {formatDate(abo.cancelled_on)}, {kuendigungVon(abo)}
        </p>
      ) : null}
      {/* Eine Fehlanlage geht nur ohne erfassten Monat; danach endet das
          Abo nur durch Kündigung (ANG-002). */}
      {abo.ends_on === null ? (
        <div className="mt-1 flex flex-wrap gap-2">
          {abo.current_month_end ? (
            <Kuendigen id={abo.id} patientId={patientId} ende={abo.current_month_end} />
          ) : null}
          {abo.recorded_months === 0 ? (
            <Entfernen id={abo.id} patientId={patientId} beginn={abo.starts_on} />
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/**
 * Eine Kündigung eintragen, die per Telefon oder Brief kam (ANG-003). Sie
 * wirkt zum Ende des laufenden Abo-Monats (ANN-270); die Rückfrage nennt das
 * Datum, bevor sie entsteht.
 */
function Kuendigen({ id, patientId, ende }: { id: string; patientId: string; ende: string }) {
  const queryClient = useQueryClient();
  const kuendigen = useMutation({
    mutationFn: () => cancelNachsorge(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: nachsorgeSchluessel(patientId) }),
  });
  return (
    <Rueckfrage
      ausloeser="Kündigung eintragen"
      ausloeserVariante="secondary"
      ausloeserGroesse="kompakt"
      bestaetigen="Kündigung eintragen"
      bestaetigenLaeuft="Wird eingetragen …"
      fehler={kuendigen.isError ? kuendigen.error.message : undefined}
      onBestaetigen={() => kuendigen.mutateAsync()}
      onAbbrechen={() => kuendigen.reset()}
    >
      Die Kündigung gilt als heute eingegangen. Das Abo endet am {formatDate(ende)}, dem Ende des
      laufenden Abo-Monats.
    </Rueckfrage>
  );
}

function Entfernen({ id, patientId, beginn }: { id: string; patientId: string; beginn: string }) {
  const queryClient = useQueryClient();
  const entfernen = useMutation({
    mutationFn: () => deleteNachsorge(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: nachsorgeSchluessel(patientId) }),
  });
  return (
    <Rueckfrage
      ausloeser="Irrtümlich angelegt"
      ausloeserVariante="quiet"
      ausloeserGroesse="kompakt"
      bezeichnung={`Abo ab ${formatDate(beginn)} entfernen`}
      bestaetigen="Ja, entfernen"
      bestaetigenLaeuft="Wird entfernt …"
      fehler={entfernen.isError ? entfernen.error.message : undefined}
      onBestaetigen={() => entfernen.mutateAsync()}
      onAbbrechen={() => entfernen.reset()}
    >
      Das Abo ab {formatDate(beginn)} wird entfernt, als hätte es es nie gegeben. Das geht nur,
      solange noch kein Abo-Monat erfasst ist.
    </Rueckfrage>
  );
}

function Anlegen({ patientId, sicht }: { patientId: string; sicht: Nachsorgesicht }) {
  const queryClient = useQueryClient();
  const vorgabe =
    sicht.earliest_start && sicht.earliest_start > sicht.today ? sicht.earliest_start : sicht.today;
  const [offen, setOffen] = useState(false);
  const [beginn, setBeginn] = useState(vorgabe);
  const [geprueft, setGeprueft] = useState(false);
  const [gespeichert, setGespeichert] = useState(false);

  const speichern = useMutation({
    mutationFn: () => createNachsorge(patientId, beginn),
    onSuccess: async () => {
      setOffen(false);
      setGeprueft(false);
      setGespeichert(true);
      await queryClient.invalidateQueries({ queryKey: nachsorgeSchluessel(patientId) });
    },
  });

  // ANN-268: vor dem Abschluss der Versorgung gibt es kein Abo. Der Satz sagt,
  // was zu tun ist, statt einen Knopf anzubieten, der abgewiesen würde.
  if (!sicht.earliest_start) {
    return (
      <p className="text-ink-muted mt-1 text-sm">
        Ein Abo beginnt nach der Behandlung – erst die Versorgung abschließen.
      </p>
    );
  }

  if (!offen) {
    return (
      <div className="mt-2 flex flex-col gap-3">
        {gespeichert ? <Statusmeldung ton="erfolg">Abo angelegt.</Statusmeldung> : null}
        <div>
          <Button
            type="button"
            variant="secondary"
            groesse="kompakt"
            onClick={() => {
              setGespeichert(false);
              setBeginn(vorgabe);
              setOffen(true);
            }}
          >
            Abo anlegen
          </Button>
        </div>
      </div>
    );
  }

  const fehler =
    geprueft && beginn === ''
      ? 'Bitte angeben, ab wann das Abo läuft.'
      : geprueft && beginn < sicht.earliest_start
        ? `Frühestens ab ${formatDate(sicht.earliest_start)}, dem Abschluss der Versorgung.`
        : undefined;

  return (
    <form
      className="mt-2 flex flex-col gap-4"
      aria-label="Nachsorge-Abo anlegen"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        setGeprueft(true);
        if (beginn === '' || beginn < (sicht.earliest_start ?? '')) return;
        speichern.mutate();
      }}
    >
      <div className="sm:w-44">
        <Field
          label="Beginn"
          type="date"
          value={beginn}
          min={sicht.earliest_start}
          error={fehler}
          onChange={(event) => setBeginn(event.target.value)}
        />
      </div>
      <p className="text-ink-muted max-w-prose text-sm">
        Monatlich kündbar zum Ende des laufenden Abo-Monats. Jeder Abo-Monat wird zu seinem Beginn
        berechnet.
      </p>
      {speichern.isError ? (
        <Statusmeldung ton="fehler">{speichern.error.message}</Statusmeldung>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={speichern.isPending}>
          {speichern.isPending ? 'Wird angelegt …' : 'Abo anlegen'}
        </Button>
        <Button
          type="button"
          variant="quiet"
          onClick={() => {
            setOffen(false);
            setGeprueft(false);
            speichern.reset();
          }}
        >
          Abbrechen
        </Button>
      </div>
    </form>
  );
}
