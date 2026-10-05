import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { ErrorState } from '@/components/ui/Feedback';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { formatDate } from '@/lib/datum';
import { formatEuro, parseEuroZuCent } from '@/lib/geld';
import {
  createVereinbarung,
  deleteVereinbarung,
  fetchHonorar,
  VereinbarungAmSelbenTag,
  type Honorarstand,
} from './api';

/**
 * Das Terminhonorar einer Person in der Akte (ABR-030, ADR-009 Punkte 5 und
 * 22, ANN-231).
 *
 * Zeigt, was heute gilt — die Vereinbarung mit der Person oder den
 * allgemeinen Tarif — und die Vereinbarungen selbst. Festlegen und entfernen
 * darf nur owner; die Seite blendet die Knöpfe für alle anderen aus,
 * verbindlich prüft der Server (ADR-004). Eine Vereinbarung ändert kein
 * Honorar, das an einem Termin schon festgeschrieben ist (ANN-232) — der
 * Satz in der Rückfrage sagt das, bevor sie entsteht.
 */
export function Honorarvereinbarung({
  patientId,
  darfFestlegen,
  heute,
}: {
  patientId: string;
  darfFestlegen: boolean;
  /** Heutiger Tag in der Zeitzone der Praxis, Vorgabe für „gilt ab“. */
  heute: string | null;
}) {
  const stand = useQuery({
    queryKey: ['honorar', patientId],
    queryFn: () => fetchHonorar(patientId),
    retry: false,
  });

  if (stand.isPending) return null;
  if (stand.isError) {
    return (
      <ErrorState
        title="Das Honorar konnte nicht geladen werden."
        description="Bitte die Verbindung prüfen und erneut versuchen."
        onErneut={() => stand.refetch()}
      />
    );
  }
  if (!stand.data) return null;

  return (
    <div className="border-line mt-3 border-t pt-3">
      <Geltend stand={stand.data} />
      <Vereinbarungen stand={stand.data} darfEntfernen={darfFestlegen} />
      {darfFestlegen ? <Festlegen patientId={patientId} heute={heute} /> : null}
    </div>
  );
}

function Geltend({ stand }: { stand: Honorarstand }) {
  if (stand.current_cents === null) {
    return (
      <p className="text-ink-muted text-sm">
        Kein Terminhonorar: Die geltende Preisliste nennt keins, und es gibt keine Vereinbarung.
      </p>
    );
  }
  return (
    <p className="text-ink text-liste">
      Terminhonorar{' '}
      <strong className="font-medium tabular-nums">{formatEuro(stand.current_cents)}</strong>
      <span className="text-ink-muted text-sm">
        {stand.current_source === 'agreement'
          ? ` · vereinbart ab ${formatDate(stand.current_valid_from ?? '')}`
          : ' · allgemeiner Tarif'}
      </span>
    </p>
  );
}

function Vereinbarungen({ stand, darfEntfernen }: { stand: Honorarstand; darfEntfernen: boolean }) {
  if (stand.agreements.length === 0) return null;
  return (
    <ul className="divide-line mt-2 divide-y" aria-label="Honorarvereinbarungen">
      {stand.agreements.map((v) => (
        <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
          <span className="text-ink min-w-0 flex-1 text-sm">
            ab {formatDate(v.valid_from)}:{' '}
            <span className="tabular-nums">{formatEuro(v.session_fee_cents)}</span>
            {v.created_by_name ? (
              <span className="text-ink-muted"> · festgelegt von {v.created_by_name}</span>
            ) : null}
          </span>
          {darfEntfernen ? <Entfernen id={v.id} gueltigAb={v.valid_from} /> : null}
        </li>
      ))}
    </ul>
  );
}

function Entfernen({ id, gueltigAb }: { id: string; gueltigAb: string }) {
  const queryClient = useQueryClient();
  const entfernen = useMutation({
    mutationFn: () => deleteVereinbarung(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['honorar'] }),
  });
  return (
    <Rueckfrage
      ausloeser="Entfernen"
      ausloeserVariante="quiet"
      ausloeserGroesse="kompakt"
      bezeichnung={`Vereinbarung ab ${formatDate(gueltigAb)} entfernen`}
      bestaetigen="Ja, entfernen"
      bestaetigenLaeuft="Wird entfernt …"
      fehler={entfernen.isError ? entfernen.error.message : undefined}
      onBestaetigen={() => entfernen.mutateAsync()}
      onAbbrechen={() => entfernen.reset()}
    >
      Die Vereinbarung ab {formatDate(gueltigAb)} wird entfernt. Das geht nur, solange sie an keinem
      Termin angewandt wurde.
    </Rueckfrage>
  );
}

function Festlegen({ patientId, heute }: { patientId: string; heute: string | null }) {
  const queryClient = useQueryClient();
  const [offen, setOffen] = useState(false);
  const [betrag, setBetrag] = useState('');
  const [gueltigAb, setGueltigAb] = useState(heute ?? '');
  const [geprueft, setGeprueft] = useState(false);
  const [gespeichert, setGespeichert] = useState(false);

  const cent = parseEuroZuCent(betrag);
  const betragFehler =
    geprueft && cent === null ? 'Bitte einen Betrag in Euro eingeben.' : undefined;
  const datumFehler = geprueft && gueltigAb === '' ? 'Bitte angeben, ab wann sie gilt.' : undefined;

  const speichern = useMutation({
    mutationFn: () => createVereinbarung(patientId, gueltigAb, cent ?? 0),
    onSuccess: async () => {
      setOffen(false);
      setBetrag('');
      setGeprueft(false);
      setGespeichert(true);
      await queryClient.invalidateQueries({ queryKey: ['honorar', patientId] });
    },
  });

  if (!offen) {
    return (
      <div className="mt-3 flex flex-col gap-3">
        {gespeichert ? <Statusmeldung ton="erfolg">Vereinbarung gespeichert.</Statusmeldung> : null}
        <div>
          <Button
            type="button"
            variant="secondary"
            groesse="kompakt"
            onClick={() => {
              setGespeichert(false);
              setOffen(true);
            }}
          >
            Honorar vereinbaren
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="mt-3 flex flex-col gap-4"
      aria-label="Honorar vereinbaren"
      onSubmit={(event) => {
        event.preventDefault();
        setGeprueft(true);
        if (cent === null || gueltigAb === '') return;
        speichern.mutate();
      }}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="sm:w-40">
          <Field
            label="Terminhonorar"
            inputMode="decimal"
            value={betrag}
            hint="in Euro je Termin"
            error={betragFehler}
            onChange={(event) => setBetrag(event.target.value)}
          />
        </div>
        <div className="sm:w-44">
          <Field
            label="Gilt ab"
            type="date"
            value={gueltigAb}
            error={datumFehler}
            onChange={(event) => setGueltigAb(event.target.value)}
          />
        </div>
      </div>
      <p className="text-ink-muted text-sm">
        Gilt für Termine ab diesem Tag und geht dem allgemeinen Tarif vor. Schon bestätigte Termine
        behalten ihr Honorar.
      </p>
      {speichern.isError ? (
        <Statusmeldung ton="fehler">
          {speichern.error instanceof VereinbarungAmSelbenTag
            ? 'Ab diesem Tag gibt es schon eine Vereinbarung. Bitte einen anderen Tag wählen.'
            : `${speichern.error.message} Bitte die Verbindung prüfen und erneut versuchen.`}
        </Statusmeldung>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={speichern.isPending}>
          {speichern.isPending ? 'Wird gespeichert …' : 'Vereinbarung speichern'}
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
