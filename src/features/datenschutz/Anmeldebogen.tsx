import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Section, Feldgruppe } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { formatDate } from '@/lib/datum';
import { todayInTimeZone } from '@/features/appointments/api';
import { DokumentFoto } from '@/features/files/DokumentFoto';
import { BEGRIFFE } from '@/lib/begriffe';
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
 * Der Anmeldebogen in der Akte (PAT-006; seit AKTE-007 in den Stammdaten).
 *
 * Seit 2026-10-03 (ANN-226) ist der Anmeldebogen ein Foto: Kontaktdaten,
 * Datenschutzinformation und Behandlungsvertrag stehen auf einem Blatt, die
 * Person unterschreibt es, die Praxis fotografiert es. Das Foto ist der
 * Nachweis; die Vermerke „Datenschutzinformation ausgehändigt" und
 * „Behandlungsvertrag unterschrieben" werden nicht mehr einzeln erfasst. Im
 * Bestand zählen sie weiter (`app.intake_checklist`).
 *
 * Das Foto geht als Datei der Art `vertrag` in die Akte - organisatorisch,
 * das Büro sieht sie (ADR-017 Punkt 12).
 */
export function AnmeldebogenFoto({
  patientId,
  ausloeser = 'knopf',
  knopf = `${BEGRIFFE.anmeldebogen} fotografieren`,
}: {
  patientId: string;
  ausloeser?: 'knopf' | 'link';
  knopf?: string;
}) {
  const queryClient = useQueryClient();
  return (
    <DokumentFoto
      patientId={patientId}
      documentType="vertrag"
      anzeigename={BEGRIFFE.anmeldebogen}
      knopf={knopf}
      dateiLabel={`${BEGRIFFE.anmeldebogen} als Datei`}
      kameraTitel={`Foto des ${BEGRIFFE.anmeldebogen}s`}
      kameraHinweis="Das unterschriebene Blatt flach hinlegen und ganz ins Bild nehmen. Das Foto bleibt in der Anwendung und landet nicht in der Mediathek des Geräts."
      vorschauAlt={`Foto des ${BEGRIFFE.anmeldebogen}s, noch nicht gespeichert`}
      erfolg={`Der ${BEGRIFFE.anmeldebogen} liegt in der Akte.`}
      // Ein Foto erledigt den Anmeldebogen der Erstaufnahme - der Hinweis im
      // Kopf der Akte verschwindet ohne Neuladen (ANN-226).
      onErfolg={() => void queryClient.invalidateQueries({ queryKey: ['open-points'] })}
      sofort
      ausloeser={ausloeser}
    />
  );
}

/**
 * Einwilligungen (PAT-006): Wozu hat die Person eingewilligt, und hat sie
 * etwas widerrufen? Freiwillig und über die Behandlung hinaus; die
 * Fotoeinwilligung schaltet serverseitig die Foto-Arbeitshilfe frei
 * (ADR-017 Punkt 35). Wo dieser Teil künftig steht, entscheidet die Runde
 * zum Reiter Stammdaten.
 *
 * Schreiben dürfen die vier Praxisrollen; verbindlich prüft der Server
 * (ADR-004).
 */
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
        description="Bitte die Verbindung prüfen und später erneut versuchen."
        onErneut={() => void vermerke.refetch()}
      />
    );
  }

  const stand = datenschutzstand(vermerke.data);

  return (
    <>
      <Einwilligungen stand={stand} />
      <VermerkErfassen stand={stand} patientId={patient.id} zeitzone={user.organizationTimeZone} />
      <Verlauf vermerke={vermerke.data} />
    </>
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
              {/* Etiketten beginnen groß, wie überall (WRT-16). */}
              {e.erteilt ? (
                <Badge ton="positiv">Erteilt am {formatDate(e.seit)}</Badge>
              ) : e.abgelehnt ? (
                <Badge ton="neutral">Abgelehnt am {formatDate(e.seit)}</Badge>
              ) : e.seit ? (
                <Badge ton="warnung">Widerrufen am {formatDate(e.seit)}</Badge>
              ) : (
                <Badge ton="neutral">Nicht erteilt</Badge>
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
interface Vermerkoption {
  wert: string;
  /** Beschriftung in der Auswahl. */
  label: string;
  /** Derselbe Vorgang als Satzteil der Rückfrage. */
  zusammenfassung: string;
}

function moeglicheVermerke(stand: Datenschutzstand): Vermerkoption[] {
  // Datenschutzinformation und Behandlungsvertrag belegt seit ANN-226 das
  // Foto des Anmeldebogens - hier stehen nur noch die Einwilligungen.
  const liste: Vermerkoption[] = [];
  function einwilligung(
    art: 'consent_granted' | 'consent_withdrawn' | 'consent_refused',
    zweck: Einwilligungszweck,
  ) {
    const vorgang = vermerkartTexte[art];
    const wozu = zweckTexte[zweck].label;
    liste.push({
      wert: `${art}:${zweck}`,
      label: `${vorgang}: ${wozu}`,
      zusammenfassung: `${vorgang} – ${wozu}`,
    });
  }
  for (const e of stand.einwilligungen) {
    if (e.erteilt) {
      einwilligung('consent_withdrawn', e.zweck);
      continue;
    }
    einwilligung('consent_granted', e.zweck);
    // Eine Ablehnung ist ein eigener, erledigter Stand (ADR-017 Punkt 35).
    if (!e.abgelehnt) einwilligung('consent_refused', e.zweck);
  }
  return liste;
}

/**
 * Der Widerruf der Fotoeinwilligung löscht die Fotos sofort (ADR-017
 * Punkt 36). Das steht vor dem Vermerken da, auf der Schaltfläche und in der
 * Rückfrage — ein Fehlgriff in der Auswahl soll nicht still die Fotos kosten.
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

/**
 * Einen Vermerk erfassen (PAT-006, PAT-04).
 *
 * **Nichts ist vorbelegt, und nichts wird ohne Rückfrage vermerkt.** Die
 * Auswahl stand beim Öffnen auf „Datenschutzinformation ausgehändigt" - ein
 * Tipp auf „Vermerken" schrieb eine Angabe, die sich nie mehr ändern oder
 * löschen lässt, und der Widerruf der Fotoeinwilligung löschte ohne zweiten
 * Tipp alle Fotos. Jetzt wählt die Person den Vorgang selbst, und die
 * Rückfrage nennt ihn samt Datum, bevor er gilt. Löschweg und Serverfunktion
 * bleiben, wie sie sind (ADR-017 Punkt 36).
 */
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
  const [wert, setWert] = useState('');
  const [datum, setDatum] = useState(heute);
  const [gespeichert, setGespeichert] = useState<string | null>(null);

  // Nach einer Erteilung wird aus „erteilt" ein „widerrufen" — die Auswahl
  // darf nicht auf einem Wert stehen bleiben, den es nicht mehr gibt.
  const gewaehlt = optionen.find((o) => o.wert === wert);
  const fotoWiderruf = gewaehlt?.wert === FOTO_WIDERRUF;
  const knopf = fotoWiderruf ? 'Widerruf vermerken und Fotos löschen' : 'Vermerken';

  const mutation = useMutation({
    mutationFn: (vermerk: NeuerVermerk) => vermerkeSpeichern(vermerk),
    onSuccess: async (_daten, vermerk) => {
      setGespeichert(vermerkartTexte[vermerk.art]);
      // Vermerkt ist vermerkt: Die Auswahl steht wieder auf „Bitte wählen",
      // damit kein zweiter Tipp denselben Vermerk noch einmal schreibt.
      setWert('');
      await queryClient.invalidateQueries({ queryKey: ['datenschutzvermerke', patientId] });
      // Ein Vermerk zur Fotoeinwilligung ändert, welche Fotos es gibt und ob
      // neue entstehen dürfen (ADR-017 Punkt 36).
      if (vermerk.zweck === 'patient_photos') {
        await queryClient.invalidateQueries({ queryKey: ['patient-photos', patientId] });
      }
    },
  });

  function neueEingabe() {
    setGespeichert(null);
    mutation.reset();
  }

  return (
    <Section titel="Vermerk erfassen">
      {/* Formularbreite wie überall (PAT-16, UI-001): Am Desktop liefen
          Auswahl und Datum sonst über die ganze Seite. */}
      <div className="max-w-xl">
        <Feldgruppe>
          <Select
            label="Was ist geschehen?"
            // Die Fassung steht im Hinweis und nicht in der Auswahl: Bei 375 px
            // schnitt der geschlossene Zustand sie ab.
            hint={
              fotoWiderruf
                ? 'Mit dem Widerruf werden alle Fotos dieser Person sofort gelöscht – außer eine Löschsperre hält sie; dann bleiben sie gesperrt bis zu ihrem Ende. Neue Fotos brauchen eine neue Einwilligung.'
                : undefined
            }
            value={gewaehlt?.wert ?? ''}
            onChange={(e) => {
              setWert(e.target.value);
              neueEingabe();
            }}
          >
            <option value="">Bitte wählen …</option>
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
            onChange={(e) => {
              setDatum(e.target.value);
              neueEingabe();
            }}
          />
          <div>
            {gewaehlt && datum !== '' ? (
              <Rueckfrage
                ausloeser={knopf}
                ausloeserVariante="primary"
                bestaetigen={knopf}
                bestaetigenLaeuft="Wird gespeichert …"
                fehler={mutation.isError ? mutation.error.message : undefined}
                onBestaetigen={() => {
                  setGespeichert(null);
                  return mutation.mutateAsync(alsVermerk(gewaehlt.wert, patientId, datum));
                }}
                onAbbrechen={() => mutation.reset()}
              >
                <p>
                  Vermerken: {gewaehlt.zusammenfassung}, {formatDate(datum)}. Vermerke lassen sich
                  nicht ändern.
                </p>
                {fotoWiderruf ? (
                  <p className="mt-2 font-medium">
                    Alle Fotos dieser Person werden sofort gelöscht – außer eine Löschsperre hält
                    sie.
                  </p>
                ) : null}
              </Rueckfrage>
            ) : (
              // Bis ein Vorgang gewählt ist, gibt es nichts zu vermerken.
              <Button type="button" disabled>
                {knopf}
              </Button>
            )}
          </div>
          {gespeichert ? (
            <Statusmeldung ton="erfolg">Vermerkt: {gespeichert}.</Statusmeldung>
          ) : null}
        </Feldgruppe>
      </div>
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
