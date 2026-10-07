import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { ErrorState } from '@/components/ui/Feedback';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { formatDate } from '@/lib/datum';
import { formatEuro } from '@/lib/geld';
import { monateText } from './api';
import {
  STARTHINDERNIS,
  createPaket,
  deletePaket,
  fetchPakete,
  fetchPaketpositionen,
  paketSchluessel,
  type Paketsicht,
  type Trainingspaket as Paket,
} from './trainingspaket-api';

/**
 * Das Trainingspaket am Trainingsverhältnis (ANG-EPIC-002, PROJECT_PRINCIPLES.md
 * 4.10 und 19, ADR-009 Punkt 21).
 *
 * Ein Paket gilt für einen festen Zeitraum, ist nicht pausierbar und wird
 * einmal im Voraus berechnet (ANN-276, ANN-277). Mit dem Paket entsteht seine
 * Leistung; die Rechnung kommt über Abrechnung → Rechnungen. Sichtbar und
 * bedienbar für owner und office; die Seite blendet den Abschnitt für alle
 * anderen aus, verbindlich prüft der Server (ADR-004).
 */
export function Trainingspaket({ verhaeltnisId }: { verhaeltnisId: string }) {
  const sicht = useQuery({
    queryKey: paketSchluessel(verhaeltnisId),
    queryFn: () => fetchPakete(verhaeltnisId),
    retry: false,
  });

  if (sicht.isPending) return null;
  if (sicht.isError) {
    return (
      <ErrorState
        title="Die Trainingspakete konnten nicht geladen werden."
        description="Bitte die Verbindung prüfen und erneut versuchen."
        onErneut={() => sicht.refetch()}
      />
    );
  }
  if (!sicht.data) return null;

  return (
    <Section titel="Trainingspaket" rahmen>
      {sicht.data.packages.length === 0 ? (
        <p className="text-ink-muted text-sm">Kein Paket.</p>
      ) : (
        <ul className="divide-line divide-y">
          {sicht.data.packages.map((paket) => (
            <PaketZeile key={paket.id} paket={paket} verhaeltnisId={verhaeltnisId} />
          ))}
        </ul>
      )}
      <Anlegen verhaeltnisId={verhaeltnisId} sicht={sicht.data} />
    </Section>
  );
}

const STAND: Record<Paket['state'], string> = {
  planned: 'Beginnt bald',
  running: 'Läuft',
  ended: 'Beendet',
};

function PaketZeile({ paket, verhaeltnisId }: { paket: Paket; verhaeltnisId: string }) {
  return (
    <li className="flex flex-col gap-1 py-2">
      <p className="text-ink text-liste flex flex-wrap items-center gap-2">
        <span>{paket.label}</span>
        {paket.state === 'ended' ? null : <Badge>{STAND[paket.state]}</Badge>}
      </p>
      <p className="text-ink-muted text-sm">
        {formatDate(paket.starts_on)} bis {formatDate(paket.ends_on)} ·{' '}
        {monateText(paket.package_months)} · {formatEuro(paket.price_cents, paket.currency)}
        {paket.created_by_name ? ` · angelegt von ${paket.created_by_name}` : ''}
      </p>
      <p className="text-ink-muted text-sm">
        {paket.invoiced
          ? 'Steht auf einer Rechnung.'
          : 'Noch nicht abgerechnet – die Rechnung entsteht unter Abrechnung → Rechnungen.'}
      </p>
      {/* Eine Fehlanlage geht nur, solange nichts abgerechnet ist (ANG-006). */}
      {paket.invoiced ? null : (
        <div className="mt-1">
          <Entfernen paket={paket} verhaeltnisId={verhaeltnisId} />
        </div>
      )}
    </li>
  );
}

function Entfernen({ paket, verhaeltnisId }: { paket: Paket; verhaeltnisId: string }) {
  const queryClient = useQueryClient();
  const entfernen = useMutation({
    mutationFn: () => deletePaket(paket.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: paketSchluessel(verhaeltnisId) }),
  });
  return (
    <Rueckfrage
      ausloeser="Irrtümlich angelegt"
      ausloeserVariante="quiet"
      ausloeserGroesse="kompakt"
      bezeichnung={`Paket ab ${formatDate(paket.starts_on)} entfernen`}
      bestaetigen="Ja, entfernen"
      bestaetigenLaeuft="Wird entfernt …"
      fehler={entfernen.isError ? entfernen.error.message : undefined}
      onBestaetigen={() => entfernen.mutateAsync()}
      onAbbrechen={() => entfernen.reset()}
    >
      Das Paket ab {formatDate(paket.starts_on)} und seine Leistung werden entfernt, als hätte es
      sie nie gegeben. Das geht nur, solange das Paket auf keiner Rechnung steht.
    </Rueckfrage>
  );
}

function Anlegen({ verhaeltnisId, sicht }: { verhaeltnisId: string; sicht: Paketsicht }) {
  const queryClient = useQueryClient();
  const [offen, setOffen] = useState(false);
  const [beginn, setBeginn] = useState(sicht.today);
  const [position, setPosition] = useState('');
  const [geprueft, setGeprueft] = useState(false);
  const [gespeichert, setGespeichert] = useState(false);

  // Die Pakete der Preisliste, die am gewählten Beginn gilt (ADR-009 Punkt 5).
  const positionen = useQuery({
    queryKey: ['trainingspaket-positionen', beginn],
    queryFn: () => fetchPaketpositionen(beginn),
    enabled: offen && beginn !== '',
    retry: false,
  });

  const speichern = useMutation({
    mutationFn: () => createPaket(verhaeltnisId, position, beginn),
    onSuccess: async () => {
      setOffen(false);
      setGeprueft(false);
      setGespeichert(true);
      await queryClient.invalidateQueries({ queryKey: paketSchluessel(verhaeltnisId) });
    },
  });

  // Ein Hindernis, das jeden Beginn betrifft, steht als Satz da statt eines
  // Knopfs, der abgewiesen würde. „Zu früh" und „vor dem Abschluss" hängen
  // am gewählten Tag und meldet erst das Formular.
  const hindernis =
    sicht.start_blocker === 'ended' || sicht.start_blocker === 'care_open'
      ? STARTHINDERNIS[sicht.start_blocker]
      : null;
  if (hindernis) {
    return <p className="text-ink-muted mt-2 text-sm">{hindernis}</p>;
  }

  if (!offen) {
    return (
      <div className="mt-3 flex flex-col gap-3">
        {gespeichert ? (
          <Statusmeldung ton="erfolg">Paket angelegt, die Leistung ist erfasst.</Statusmeldung>
        ) : null}
        <div>
          <Button
            type="button"
            variant="secondary"
            groesse="kompakt"
            onClick={() => {
              setGespeichert(false);
              setBeginn(sicht.today);
              setPosition('');
              setOffen(true);
            }}
          >
            Paket anlegen
          </Button>
        </div>
      </div>
    );
  }

  const liste = positionen.data ?? [];
  const gewaehlt = liste.find((p) => p.catalog_item_id === position);
  const fehlerBeginn =
    geprueft && beginn === '' ? 'Bitte angeben, ab wann das Paket läuft.' : undefined;
  const fehlerPaket = geprueft && !gewaehlt ? 'Bitte ein Paket wählen.' : undefined;

  return (
    <form
      className="mt-3 flex flex-col gap-4"
      aria-label="Trainingspaket anlegen"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        setGeprueft(true);
        if (beginn === '' || !gewaehlt) return;
        speichern.mutate();
      }}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="sm:w-44">
          <Field
            label="Beginn"
            type="date"
            value={beginn}
            error={fehlerBeginn}
            onChange={(event) => {
              setBeginn(event.target.value);
              setPosition('');
            }}
          />
        </div>
        <div className="min-w-0 sm:grow">
          <Select
            label="Paket"
            value={position}
            error={fehlerPaket}
            disabled={positionen.isPending}
            onChange={(event) => setPosition(event.target.value)}
          >
            <option value="">
              {positionen.isPending
                ? 'Wird geladen …'
                : liste.length === 0
                  ? 'Die Preisliste nennt kein Paket'
                  : 'Bitte wählen'}
            </option>
            {liste.map((p) => (
              <option key={p.catalog_item_id} value={p.catalog_item_id}>
                {p.label} – {formatEuro(p.unit_price_cents, p.currency)}
              </option>
            ))}
          </Select>
        </div>
      </div>
      {positionen.isError ? (
        <Statusmeldung ton="fehler">{positionen.error.message}</Statusmeldung>
      ) : null}
      <p className="text-ink-muted max-w-prose text-sm">
        Das Paket läuft über die ganze Laufzeit, auch wenn eine Behandlung dazukommt; es lässt sich
        nicht pausieren und nicht kündigen. Es wird einmal zu Beginn berechnet.
      </p>
      {speichern.isError ? (
        <Statusmeldung ton="fehler">{speichern.error.message}</Statusmeldung>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={speichern.isPending}>
          {speichern.isPending ? 'Wird angelegt …' : 'Paket anlegen'}
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
