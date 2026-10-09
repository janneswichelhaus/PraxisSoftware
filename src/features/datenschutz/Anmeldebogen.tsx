import { einwilligungAngeboten } from '@/lib/einwilligung';
import { useId, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
import { Aufklappzeichen } from '@/components/ui/Card';
import { aufklappKopfKlassen } from '@/components/ui/aufklappStile';
import { Dialogfenster } from '@/components/ui/Dialogfenster';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { formatDate } from '@/lib/datum';
import { todayInTimeZone } from '@/features/appointments/api';
import { DokumentFoto } from '@/features/files/DokumentFoto';
import { BEGRIFFE } from '@/lib/begriffe';
import type { Patient } from '@/features/patients/api';
import type { CurrentUser } from '@/features/session/types';
import {
  datenschutzstand,
  fetchDatenschutzvermerke,
  herkunftText,
  vermerkartTexte,
  vermerkeSpeichern,
  zweckTexte,
  type Einwilligungsstand,
  type Datenschutzvermerk,
  type Einwilligungszweck,
  type NeuerVermerk,
} from './vermerke';

/**
 * Der Anmeldebogen in der Akte (PAT-006; seit AKTE-007 in den Stammdaten).
 *
 * Seit 2026-10-03 (ANN-227) ist der Anmeldebogen ein Foto: Kontaktdaten,
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
      // Kopf der Akte verschwindet ohne Neuladen (ANN-227).
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
 * (ADR-017 Punkt 35).
 *
 * Seit 2026-10-03 (Akte entschlacken, Entscheidung Jannes) eine Karte im
 * Raster der Stammdaten: je Zweck eine Zeile mit ihrem Stand, ein Tipp
 * öffnet das Fenster zum Vermerken. Die Erklärtexte stehen dort, der Verlauf
 * ist eingeklappt. Das Formular „Vermerk erfassen" ist entfallen; seine
 * Zusagen gelten im Fenster weiter: nichts vorausgewählt, Rückfrage mit
 * Vorgang und Datum, der Fotowiderruf sagt, dass er löscht (PAT-04).
 *
 * Schreiben dürfen die vier Praxisrollen; verbindlich prüft der Server
 * (ADR-004).
 */
export function Datenschutz({ patient, user }: { patient: Patient; user: CurrentUser }) {
  const vermerke = useQuery({
    queryKey: ['datenschutzvermerke', patient.id],
    queryFn: () => fetchDatenschutzvermerke(patient.id),
  });
  const [offen, setOffen] = useState<Einwilligungszweck | null>(null);
  const [gespeichert, setGespeichert] = useState<string | null>(null);

  let inhalt: ReactNode;
  if (vermerke.isPending) {
    inhalt = <LoadingState label="Datenschutzvermerke werden geladen …" />;
  } else if (vermerke.isError) {
    inhalt = (
      <ErrorState
        title="Die Datenschutzvermerke konnten nicht geladen werden."
        description="Bitte die Verbindung prüfen und später erneut versuchen."
        onErneut={() => void vermerke.refetch()}
      />
    );
  } else {
    const stand = datenschutzstand(vermerke.data);
    const gewaehlt = stand.einwilligungen.find((e) => e.zweck === offen) ?? null;
    inhalt = (
      <>
        <ul className="divide-line -my-1 flex flex-col divide-y">
          {stand.einwilligungen
            .filter((e) => einwilligungAngeboten(e.zweck, e.erteilt))
            .map((e) => (
              <li key={e.zweck}>
                <button
                  type="button"
                  className="hover:bg-surface-sunken rounded-button -mx-2 flex min-h-11 w-[calc(100%+1rem)] flex-wrap items-center justify-between gap-2 px-2 py-2 text-left"
                  onClick={() => {
                    setGespeichert(null);
                    setOffen(e.zweck);
                  }}
                >
                  <span className="text-ink text-liste font-medium">
                    {zweckTexte[e.zweck].label}
                  </span>
                  <span className="flex items-center gap-2">
                    <Einwilligungszeichen stand={e} />
                    <span aria-hidden="true" className="text-ink-muted">
                      ›
                    </span>
                  </span>
                </button>
              </li>
            ))}
        </ul>
        {gespeichert ? (
          <Statusmeldung ton="erfolg" className="mt-3">
            Vermerkt: {gespeichert}.
          </Statusmeldung>
        ) : null}
        <Verlauf vermerke={vermerke.data} />
        {gewaehlt ? (
          <EinwilligungFenster
            stand={gewaehlt}
            patientId={patient.id}
            zeitzone={user.organizationTimeZone}
            onGespeichert={(text) => {
              setGespeichert(text);
              setOffen(null);
            }}
            onSchliessen={() => setOffen(null)}
          />
        ) : null}
      </>
    );
  }

  return (
    <Section titel="Einwilligungen" rahmen>
      {inhalt}
    </Section>
  );
}

/** Etiketten beginnen groß, wie überall (WRT-16). */
function Einwilligungszeichen({ stand }: { stand: Einwilligungsstand }) {
  // POR-016: Was die Person selbst auf der Plattform gesetzt hat, sagt es dazu.
  const plattform = stand.ueberPlattform ? ' (Plattform)' : '';
  if (stand.erteilt)
    return (
      <Badge ton="positiv">
        Erteilt am {formatDate(stand.seit)}
        {plattform}
      </Badge>
    );
  if (stand.abgelehnt) return <Badge ton="neutral">Abgelehnt am {formatDate(stand.seit)}</Badge>;
  if (stand.seit)
    return (
      <Badge ton="warnung">
        Widerrufen am {formatDate(stand.seit)}
        {plattform}
      </Badge>
    );
  return <Badge ton="neutral">Nicht erteilt</Badge>;
}

type Vorgang = 'consent_granted' | 'consent_withdrawn' | 'consent_refused';

/**
 * Was sich zu einem Zweck vermerken lässt: Erteilt wird widerrufen; sonst
 * erteilt - und abgelehnt, solange es nicht schon abgelehnt ist (ADR-017
 * Punkt 35). Datenschutzinformation und Behandlungsvertrag belegt seit
 * ANN-227 das Foto des Anmeldebogens.
 */
function moeglicheVorgaenge(stand: Einwilligungsstand): Vorgang[] {
  if (stand.erteilt) return ['consent_withdrawn'];
  return stand.abgelehnt ? ['consent_granted'] : ['consent_granted', 'consent_refused'];
}

/**
 * Das Fenster einer Einwilligung: Beschreibung, Stand, Vorgang, Datum.
 *
 * **Nichts ist vorbelegt, und nichts wird ohne Rückfrage vermerkt** (PAT-04).
 * Der Widerruf der Fotoeinwilligung löscht die Fotos sofort (ADR-017
 * Punkt 36) - das steht vor dem Vermerken da, auf der Schaltfläche und in
 * der Rückfrage. Löschweg und Serverfunktion bleiben, wie sie sind.
 */
function EinwilligungFenster({
  stand,
  patientId,
  zeitzone,
  onGespeichert,
  onSchliessen,
}: {
  stand: Einwilligungsstand;
  patientId: string;
  zeitzone: string | null;
  onGespeichert: (text: string) => void;
  onSchliessen: () => void;
}) {
  const queryClient = useQueryClient();
  const heute = zeitzone ? todayInTimeZone(zeitzone) : '';
  const [vorgang, setVorgang] = useState<Vorgang | null>(null);
  const [datum, setDatum] = useState(heute);
  const gruppe = useId();
  const zweck = stand.zweck;
  const fotoWiderruf = zweck === 'patient_photos' && vorgang === 'consent_withdrawn';
  const knopf = fotoWiderruf ? 'Widerruf vermerken und Fotos löschen' : 'Speichern';

  const mutation = useMutation({
    mutationFn: (vermerk: NeuerVermerk) => vermerkeSpeichern(vermerk),
    onSuccess: async (_daten, vermerk) => {
      await queryClient.invalidateQueries({ queryKey: ['datenschutzvermerke', patientId] });
      // Ein Vermerk zur Fotoeinwilligung ändert, welche Fotos es gibt und ob
      // neue entstehen dürfen (ADR-017 Punkt 36).
      if (vermerk.zweck === 'patient_photos') {
        await queryClient.invalidateQueries({ queryKey: ['patient-photos', patientId] });
      }
      onGespeichert(vermerkartTexte[vermerk.art]);
    },
  });

  return (
    <Dialogfenster titel={zweckTexte[zweck].label} onSchliessen={onSchliessen}>
      <p className="text-ink text-sm">{zweckTexte[zweck].beschreibung}</p>
      <p className="text-ink-muted mt-2 text-sm">
        Die Behandlung selbst braucht keine Einwilligung. Ein Widerruf gilt ab seinem Datum.
      </p>
      <p className="mt-3">
        <Einwilligungszeichen stand={stand} />
      </p>

      <fieldset className="mt-4 flex flex-col gap-2">
        <legend className="text-ink mb-1 text-sm font-medium">Was ist geschehen?</legend>
        {moeglicheVorgaenge(stand).map((v) => (
          <label key={v} className="flex min-h-11 cursor-pointer items-center gap-3">
            <input
              type="radio"
              name={gruppe}
              className="border-line-strong text-accent focus-visible:outline-accent size-5 shrink-0"
              checked={vorgang === v}
              onChange={() => {
                setVorgang(v);
                mutation.reset();
              }}
            />
            <span className="text-ink text-sm">{vermerkartTexte[v]}</span>
          </label>
        ))}
      </fieldset>
      {fotoWiderruf ? (
        <p className="text-ink mt-2 text-sm">
          Mit dem Widerruf werden alle Fotos dieser Person sofort gelöscht – außer eine Löschsperre
          hält sie; dann bleiben sie gesperrt bis zu ihrem Ende. Neue Fotos brauchen eine neue
          Einwilligung.
        </p>
      ) : null}

      <div className="mt-4 max-w-60">
        <Field
          label="Datum auf dem Papier"
          type="date"
          value={datum}
          max={heute || undefined}
          required
          onChange={(e) => {
            setDatum(e.target.value);
            mutation.reset();
          }}
        />
      </div>

      <div className="border-line mt-6 flex flex-wrap items-start justify-end gap-3 border-t pt-4">
        <Button type="button" variant="quiet" onClick={onSchliessen}>
          Abbrechen
        </Button>
        {vorgang && datum !== '' ? (
          <Rueckfrage
            ausloeser={knopf}
            ausloeserVariante="primary"
            bestaetigen={knopf}
            bestaetigenLaeuft="Wird gespeichert …"
            fehler={mutation.isError ? mutation.error.message : undefined}
            onBestaetigen={() => mutation.mutateAsync({ patientId, art: vorgang, zweck, datum })}
            onAbbrechen={() => mutation.reset()}
          >
            <p>
              Vermerken: {vermerkartTexte[vorgang]} – {zweckTexte[zweck].label}, {formatDate(datum)}
              . Vermerke lassen sich nicht ändern.
            </p>
            {fotoWiderruf ? (
              <p className="mt-2 font-medium">
                Alle Fotos dieser Person werden sofort gelöscht – außer eine Löschsperre hält sie.
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
    </Dialogfenster>
  );
}

/** Der Verlauf aller Vermerke, eingeklappt unter der Karte. */
function Verlauf({ vermerke }: { vermerke: Datenschutzvermerk[] }) {
  if (vermerke.length === 0) return null;
  const neuesteZuerst = [...vermerke].reverse();

  return (
    <details className="group border-line mt-3 border-t pt-1">
      <summary className={`${aufklappKopfKlassen} text-ink-muted py-2 text-sm`}>
        <Aufklappzeichen />
        Verlauf ({vermerke.length})
      </summary>
      <p className="text-ink-muted text-sm">
        Vermerke werden nie geändert oder gelöscht; ein Widerruf steht neben der Einwilligung.
      </p>
      <ul className="mt-2 flex flex-col gap-2 pb-2 text-sm">
        {neuesteZuerst.map((v) => (
          <li key={v.id} className="flex flex-wrap gap-x-3">
            <span className="text-ink-muted w-24 shrink-0 tabular-nums">
              {formatDate(v.occurred_on)}
            </span>
            <span className="text-ink">
              {vermerkartTexte[v.record_kind]}
              {v.purpose ? ` · ${zweckTexte[v.purpose].label}` : ''}
              {v.notice_version ? ` · Fassung ${v.notice_version}` : ''}
              {herkunftText(v) ? ` · ${herkunftText(v)}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
