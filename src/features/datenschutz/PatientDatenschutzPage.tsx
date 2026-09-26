import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Section, Feldgruppe } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { formatDate } from '@/lib/datum';
import { todayInTimeZone } from '@/features/appointments/api';
import { usePatientRecord } from '@/features/patients/akte';
import type { Patient } from '@/features/patients/api';
import type { CurrentUser } from '@/features/session/types';
import { DATENSCHUTZINFORMATION_FASSUNG } from './patienteninformation';
import {
  datenschutzstand,
  fetchDatenschutzvermerke,
  vermerkartTexte,
  vermerkeSpeichern,
  zweckTexte,
  type Datenschutzstand,
  type Datenschutzvermerk,
  type Einwilligungszweck,
  type NeuerVermerk,
} from './vermerke';

/**
 * Datenschutz in der Akte (PAT-006).
 *
 * Drei Fragen, die bei der Aufnahme und bei jeder Rückfrage einer Patientin
 * auftauchen: Hat sie die Datenschutzinformation bekommen — und welche
 * Fassung? Liegt der Behandlungsvertrag unterschrieben vor? Wozu hat sie
 * eingewilligt, und hat sie etwas widerrufen?
 *
 * Die Papiere selbst bleiben Papier (E-13). Die Seite hält nur fest, dass und
 * wann; wer den Scan ablegen will, nutzt den Bereich „Dateien".
 *
 * Schreiben dürfen die vier Praxisrollen — die Aufnahme macht oft das Büro.
 * Die Seite steht nur ihnen offen; verbindlich prüft der Server (ADR-004).
 */

export function PatientDatenschutzPage() {
  const { patient, user } = usePatientRecord();
  return <Datenschutz patient={patient} user={user} />;
}

export function Datenschutz({ patient, user }: { patient: Patient; user: CurrentUser }) {
  const vermerke = useQuery({
    queryKey: ['datenschutzvermerke', patient.id],
    queryFn: () => fetchDatenschutzvermerke(patient.id),
  });

  if (vermerke.isPending) return <LoadingState label="Datenschutzvermerke werden geladen …" />;
  if (vermerke.isError) {
    return (
      <ErrorState
        title="Die Datenschutzvermerke konnten nicht geladen werden."
        description="Bitte später erneut versuchen."
      />
    );
  }

  const stand = datenschutzstand(vermerke.data);

  return (
    <>
      <Unterlagen stand={stand} patientId={patient.id} />
      <Einwilligungen stand={stand} />
      <VermerkErfassen stand={stand} patientId={patient.id} zeitzone={user.organizationTimeZone} />
      <Verlauf vermerke={vermerke.data} />
    </>
  );
}

function Unterlagen({ stand, patientId }: { stand: Datenschutzstand; patientId: string }) {
  const info = stand.datenschutzinformation;
  const veraltet = info !== null && info.fassung !== DATENSCHUTZINFORMATION_FASSUNG;

  return (
    <Section
      titel="Unterlagen"
      hinweis="Beide bleiben Papier. Hier steht nur, dass und wann sie vorlagen."
      aktion={
        <ButtonLink to={`/patienten/${patientId}/aufnahmeblaetter`} variant="secondary">
          Blätter zum Ausdrucken
        </ButtonLink>
      }
      rahmen
    >
      <DetailList>
        <DetailRow label="Datenschutzinformation">
          {info ? (
            <>
              ausgehändigt am {formatDate(info.am)} · Fassung {info.fassung}
              {veraltet ? (
                <span className="text-warnung mt-1 block text-sm">
                  Inzwischen gilt Fassung {DATENSCHUTZINFORMATION_FASSUNG}.
                </span>
              ) : null}
            </>
          ) : (
            <span className="text-ink-muted">nicht vermerkt</span>
          )}
        </DetailRow>
        <DetailRow label="Behandlungsvertrag">
          {stand.behandlungsvertrag ? (
            <>unterschrieben am {formatDate(stand.behandlungsvertrag.am)}</>
          ) : (
            <span className="text-ink-muted">nicht vermerkt</span>
          )}
        </DetailRow>
      </DetailList>
    </Section>
  );
}

function Einwilligungen({ stand }: { stand: Datenschutzstand }) {
  return (
    <Section
      titel="Einwilligungen"
      hinweis="Die Behandlung selbst braucht keine Einwilligung. Diese Zwecke gehen darüber hinaus; ein Widerruf gilt ab seinem Datum."
      rahmen
    >
      <ul className="divide-line flex flex-col divide-y">
        {stand.einwilligungen.map((e) => (
          <li key={e.zweck} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-ink font-medium">{zweckTexte[e.zweck].label}</span>
              {e.erteilt ? (
                <Badge ton="positiv">erteilt am {formatDate(e.seit)}</Badge>
              ) : e.abgelehnt ? (
                <Badge ton="neutral">abgelehnt am {formatDate(e.seit)}</Badge>
              ) : e.seit ? (
                <Badge ton="warnung">widerrufen am {formatDate(e.seit)}</Badge>
              ) : (
                <Badge ton="neutral">nicht erteilt</Badge>
              )}
            </div>
            <p className="text-ink-muted text-sm">{zweckTexte[e.zweck].beschreibung}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** Eine Auswahl: was ist geschehen? Kodiert als `art` oder `art:zweck`. */
function moeglicheVermerke(stand: Datenschutzstand): { wert: string; label: string }[] {
  const liste = [
    { wert: 'privacy_notice_handed_out', label: 'Datenschutzinformation ausgehändigt' },
    { wert: 'treatment_contract_signed', label: 'Behandlungsvertrag unterschrieben' },
  ];
  for (const e of stand.einwilligungen) {
    const zweck = zweckTexte[e.zweck].label;
    if (e.erteilt) {
      liste.push({
        wert: `consent_withdrawn:${e.zweck}`,
        label: `Einwilligung widerrufen: ${zweck}`,
      });
      continue;
    }
    liste.push({ wert: `consent_granted:${e.zweck}`, label: `Einwilligung erteilt: ${zweck}` });
    // Eine Ablehnung ist ein eigener, erledigter Stand (ADR-017 Punkt 35).
    if (!e.abgelehnt) {
      liste.push({
        wert: `consent_refused:${e.zweck}`,
        label: `Einwilligung abgelehnt: ${zweck}`,
      });
    }
  }
  return liste;
}

/**
 * Der Widerruf der Fotoeinwilligung löscht die Fotos sofort (ADR-017
 * Punkt 36). Das steht vor dem Vermerken da und auf der Schaltfläche — ein
 * Fehlgriff in der Auswahl soll nicht still die Fotos kosten.
 */
const FOTO_WIDERRUF = 'consent_withdrawn:patient_photos';

function alsVermerk(wert: string, patientId: string, datum: string): NeuerVermerk {
  const [art, zweck] = wert.split(':') as [NeuerVermerk['art'], Einwilligungszweck | undefined];
  return {
    patientId,
    art,
    datum,
    ...(zweck ? { zweck } : {}),
    ...(art === 'privacy_notice_handed_out' ? { fassung: DATENSCHUTZINFORMATION_FASSUNG } : {}),
  };
}

function VermerkErfassen({
  stand,
  patientId,
  zeitzone,
}: {
  stand: Datenschutzstand;
  patientId: string;
  zeitzone: string | null;
}) {
  const queryClient = useQueryClient();
  const heute = zeitzone ? todayInTimeZone(zeitzone) : '';
  const optionen = moeglicheVermerke(stand);
  const [wert, setWert] = useState(optionen[0]!.wert);
  const [datum, setDatum] = useState(heute);
  const [gespeichert, setGespeichert] = useState<string | null>(null);

  // Nach einer Erteilung wird aus „erteilt" ein „widerrufen" — die Auswahl
  // darf nicht auf einem Wert stehen bleiben, den es nicht mehr gibt.
  const gewaehlt = optionen.some((o) => o.wert === wert) ? wert : optionen[0]!.wert;

  const mutation = useMutation({
    mutationFn: (vermerk: NeuerVermerk) => vermerkeSpeichern(vermerk),
    onSuccess: async (_daten, vermerk) => {
      setGespeichert(vermerkartTexte[vermerk.art]);
      await queryClient.invalidateQueries({ queryKey: ['datenschutzvermerke', patientId] });
      // Ein Vermerk zur Fotoeinwilligung ändert, welche Fotos es gibt und ob
      // neue entstehen dürfen (ADR-017 Punkt 36).
      if (vermerk.zweck === 'patient_photos') {
        await queryClient.invalidateQueries({ queryKey: ['patient-photos', patientId] });
      }
    },
  });

  function absenden(event: FormEvent) {
    event.preventDefault();
    setGespeichert(null);
    mutation.mutate(alsVermerk(gewaehlt, patientId, datum));
  }

  return (
    <Section titel="Vermerk erfassen">
      <form onSubmit={absenden} noValidate>
        <Feldgruppe>
          <Select
            label="Was ist geschehen?"
            // Die Fassung steht im Hinweis und nicht in der Auswahl: Bei 375 px
            // schnitt der geschlossene Zustand sie ab.
            hint={
              gewaehlt === 'privacy_notice_handed_out'
                ? `Vermerkt wird Fassung ${DATENSCHUTZINFORMATION_FASSUNG} — die auf den Blättern zum Ausdrucken.`
                : gewaehlt === FOTO_WIDERRUF
                  ? 'Mit dem Widerruf werden alle Fotos dieser Person sofort gelöscht — außer ein Legal Hold hält sie; dann bleiben sie gesperrt bis zu seinem Ende. Neue Fotos braucht eine neue Einwilligung.'
                  : undefined
            }
            value={gewaehlt}
            onChange={(e) => {
              setWert(e.target.value);
              setGespeichert(null);
            }}
          >
            {optionen.map((o) => (
              <option key={o.wert} value={o.wert}>
                {o.label}
              </option>
            ))}
          </Select>
          <Field
            label="Datum auf dem Papier"
            type="date"
            value={datum}
            max={heute || undefined}
            required
            onChange={(e) => setDatum(e.target.value)}
          />
          <div>
            <Button type="submit" disabled={mutation.isPending || datum === ''}>
              {mutation.isPending
                ? 'Wird gespeichert …'
                : gewaehlt === FOTO_WIDERRUF
                  ? 'Widerruf vermerken und Fotos löschen'
                  : 'Vermerken'}
            </Button>
          </div>
          {mutation.isError ? (
            <Statusmeldung ton="fehler">{mutation.error.message}</Statusmeldung>
          ) : null}
          {gespeichert ? <Statusmeldung>Vermerkt: {gespeichert}.</Statusmeldung> : null}
        </Feldgruppe>
      </form>
    </Section>
  );
}

function Verlauf({ vermerke }: { vermerke: Datenschutzvermerk[] }) {
  if (vermerke.length === 0) return null;
  const neuesteZuerst = [...vermerke].reverse();

  return (
    <Section
      titel="Verlauf"
      hinweis="Vermerke werden nie geändert oder gelöscht; ein Widerruf steht neben der Einwilligung."
      rahmen
    >
      <ul className="flex flex-col gap-2 text-sm">
        {neuesteZuerst.map((v) => (
          <li key={v.id} className="flex flex-wrap gap-x-3">
            <span className="text-ink-muted w-24 shrink-0 tabular-nums">
              {formatDate(v.occurred_on)}
            </span>
            <span className="text-ink">
              {vermerkartTexte[v.record_kind]}
              {v.purpose ? ` · ${zweckTexte[v.purpose].label}` : ''}
              {v.notice_version ? ` · Fassung ${v.notice_version}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
