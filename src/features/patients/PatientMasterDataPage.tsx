import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { HausbesucheMitAlterAdresse } from '@/features/appointments/HausbesucheMitAlterAdresse';
import { useLocation } from 'react-router-dom';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { Field } from '@/components/ui/Field';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
import { Zusammenfuehrungsvermerke } from './Zusammenfuehrungsvermerke';
import { Textlink } from '@/components/ui/Textlink';
import { formatDate } from '@/lib/datum';
import { mitRueckweg } from '@/lib/rueckweg';
import { telHref } from '@/lib/telefon';
import { todayInTimeZone } from '@/features/appointments/api';
import { PlattformAbschnitt } from '@/features/platform-access/PlattformAbschnitt';
import {
  canChangePatientStatus,
  canConcludePatientCare,
  canReadPatientDirectory,
  isOwner,
  type CurrentUser,
} from '@/features/session/types';
import { ANMELDEBOGEN_ANKER, usePatientRecord } from './akte';
import { Datenschutz } from '@/features/datenschutz/Anmeldebogen';
import { SonstigeDateien } from '@/features/files/Aktendateien';
import { AdresseVerorten } from './AdresseVerorten';
import { Behandlungsliege } from './Behandlungsliege';
import { Mitnehmen } from './Mitnehmen';
import {
  concludePatientCare,
  jahrPlus,
  reopenPatientCare,
  setPatientStatus,
  type Patient,
} from './api';

/**
 * Stammdaten und Verwaltung (AKTE-005).
 *
 * Der Bereich, der am seltensten gebraucht wird und deshalb zuletzt steht:
 * Anschrift, Kontakt, Versorgungsdaten, seit AKTE-007 der Anmeldebogen und
 * die Dateien ohne eigenen Bereich - und die beiden Vorgänge, die eine
 * Akte aus dem laufenden Betrieb nehmen. Genau deshalb stehen sie hier unten
 * und nicht im Kopf: Ein versehentlicher Tap auf „Versorgung abschließen"
 * startet eine zehnjährige Aufbewahrung (ADR-008).
 */

/**
 * Telefonnummer als Aktion, nicht als Text (Oberflächen-Checkliste Punkt 8).
 *
 * Im Hausbesuch ist der Anruf der häufigste nächste Schritt; ein `tel:`-Link
 * spart das Abtippen am Handy. Als alleinstehender Textlink mit 44 px
 * Tippziel und Unterstreichung (PAT-11, RSP-05, UIK-15): Vorher war die
 * Nummer ein 20 px hoher Streifen, mit Handschuhen kaum zu treffen, und ohne
 * Unterstreichung neben schwarzem Text kaum als Link zu erkennen.
 */
function TelefonZeile({ label, nummer }: { label: string; nummer: string | null }) {
  // UX-005e: Ein leerer Wert bekommt keine Zeile - der Gedankenstrich sagte
  // nur, dass nichts da ist.
  if (!nummer) return null;
  return (
    <DetailRow label={label}>
      <Textlink href={telHref(nummer)} alleinstehend className={KONTAKT_IN_DER_ZEILE}>
        {nummer}
      </Textlink>
    </DetailRow>
  );
}

/**
 * Ab 640 px stehen Beschriftung und Wert nebeneinander. Das 44-px-Tippziel
 * reicht dort in den Zeilenabstand hinein, statt die Zeile zu strecken - sonst
 * stünde die Nummer eine halbe Zeile tiefer als ihre Beschriftung. Innen
 * dieselbe Polsterung wie außen weggenommen: So beginnt auch eine E-Mail über
 * zwei Zeilen auf der Höhe der Beschriftung. Am Telefon steht der Wert unter
 * der Beschriftung, dort bleibt das Ziel, wie es ist.
 */
const KONTAKT_IN_DER_ZEILE = 'sm:-my-2.5 sm:py-2.5';

/**
 * Wechsel des Versorgungsstatus.
 *
 * Bewusst mit Rückfrage: der Wechsel nimmt einen Patienten aus dem laufenden
 * Betrieb, und ein versehentlicher Klick soll das nicht auslösen
 * (PROJECT_PRINCIPLES.md 13). Die Rückfrage ist Bedienkomfort - verbindlich
 * prüft `set_patient_status` die Berechtigung erneut.
 */
function StatusAktion({ patient }: { patient: Patient }) {
  const queryClient = useQueryClient();
  const zielStatus: Patient['status'] = patient.status === 'active' ? 'inactive' : 'active';

  const mutation = useMutation({
    mutationFn: () => setPatientStatus(patient.id, zielStatus),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['patients'] });
      await queryClient.invalidateQueries({ queryKey: ['patient', patient.id] });
    },
  });

  const beschriftung =
    zielStatus === 'inactive' ? 'Als inaktiv markieren' : 'Wieder als aktiv führen';

  return (
    <Rueckfrage
      ausloeser={beschriftung}
      bestaetigen={beschriftung}
      bestaetigenLaeuft="Wird geändert …"
      fehler={mutation.isError ? 'Der Versorgungsstatus konnte nicht geändert werden.' : undefined}
      laeuft={mutation.isPending}
      onBestaetigen={() => mutation.mutateAsync()}
    >
      {zielStatus === 'inactive'
        ? 'Diese Person wird als nicht in laufender Versorgung geführt. Die Akte bleibt vollständig erhalten.'
        : 'Diese Person wird wieder als in laufender Versorgung geführt.'}
    </Rueckfrage>
  );
}

/**
 * Abschluss der Versorgung festhalten oder zurücknehmen (LOE-001b).
 *
 * Der Vorgang startet die zehnjährige Aufbewahrung nach ADR-008 — deshalb die
 * Rückfrage und deshalb der ausdrückliche Satz darüber, was danach passiert.
 * Der Tag ist änderbar, weil der letzte Behandlungstag oft vor der
 * Entscheidung liegt. Verbindlich prüft `conclude_patient_care` Rolle, Datum
 * und Organisation erneut (ADR-004).
 */
function VersorgungAbschliessen({
  patient,
  zeitzone,
}: {
  patient: Patient;
  zeitzone: string | null;
}) {
  const queryClient = useQueryClient();
  // Vorbelegung in der Zeitzone der Praxis, nicht in der des Geräts: der
  // laufende Praxistag ist der Maßstab. Verbindlich prüft der Server erneut.
  const heute = zeitzone ? todayInTimeZone(zeitzone) : '';
  const [tag, setTag] = useState(heute);
  const abgeschlossen = patient.care_concluded_on !== null;

  const mutation = useMutation({
    mutationFn: () =>
      abgeschlossen ? reopenPatientCare(patient.id) : concludePatientCare(patient.id, tag),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['patients'] });
      await queryClient.invalidateQueries({ queryKey: ['patient', patient.id] });
    },
  });

  if (abgeschlossen) {
    return (
      <Rueckfrage
        ausloeser="Abschluss zurücknehmen"
        bestaetigen="Abschluss zurücknehmen"
        bestaetigenLaeuft="Wird zurückgenommen …"
        fehler={
          mutation.isError
            ? 'Der Abschluss der Versorgung konnte nicht zurückgenommen werden.'
            : undefined
        }
        laeuft={mutation.isPending}
        onBestaetigen={() => mutation.mutateAsync()}
      >
        <p>
          Die Versorgung gilt wieder als laufend. Die Aufbewahrungsfrist beginnt erst mit einem
          neuen Abschluss – sie läuft nicht weiter.
        </p>
      </Rueckfrage>
    );
  }

  return (
    <Rueckfrage
      ausloeser="Versorgung abschließen"
      bestaetigen="Versorgung abschließen"
      // Dasselbe Verb wie auf dem Knopf (WRT-10).
      bestaetigenLaeuft="Wird abgeschlossen …"
      fehler={
        mutation.isError
          ? 'Der Abschluss der Versorgung konnte nicht gespeichert werden. Prüfen Sie das Datum.'
          : undefined
      }
      laeuft={mutation.isPending}
      onBestaetigen={() => mutation.mutateAsync()}
      onAbbrechen={() => setTag(heute)}
    >
      <p>
        Die Behandlung dieser Person ist beendet. Ab diesem Tag läuft die gesetzliche Aufbewahrung
        von zehn Jahren; danach wird die Akte gelöscht. Kommt die Person zurück, lässt sich der
        Abschluss zurücknehmen.
      </p>
      <div className="mt-3 max-w-60">
        {/* Der Tag liegt zwischen Beginn der Versorgung und heute - dieselben
            Grenzen, die der Server prüft (PAT-15). Vorher bot der Wähler auch
            Tage vor dem Beginn an, und erst die Abweisung sagte „Prüfen Sie
            das Datum". */}
        <Field
          label="Letzter Behandlungstag"
          type="date"
          min={patient.care_started_on ?? undefined}
          max={heute || undefined}
          value={tag}
          onChange={(event) => setTag(event.target.value)}
        />
      </div>
    </Rueckfrage>
  );
}

export function PatientMasterDataPage() {
  const { patient, user } = usePatientRecord();
  return <Stammdaten patient={patient} user={user} />;
}

export function Stammdaten({ patient, user }: { patient: Patient; user: CurrentUser }) {
  const ort = useLocation();
  const street = [patient.street, patient.house_number].filter(Boolean).join(' ');
  const address = [street, [patient.postal_code, patient.city].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
  const darfStatusWechseln = canChangePatientStatus(user.roles);
  const darfVerorten = canReadPatientDirectory(user.roles);
  // Die Rollenmenge von app.can_update_patient() ist die der Kartei.
  const darfLiegeSetzen = canReadPatientDirectory(user.roles);
  // Denselben Rollenschnitt prueft app.can_conclude_patient_care(): der
  // Abschluss ist eine fachliche Aussage ueber den Versorgungsverlauf, kein
  // Verwaltungsvorgang (LOE-001b). Verbindlich ist der Server.
  const darfAbschliessen = canConcludePatientCare(user.roles);
  // Die Auskunft buendelt in einer Antwort, was sonst ueber zwoelf Leserechte
  // verteilt liegt; wer sie erteilt, steht fuer sie gerade (OPS-006, G9).
  const darfAuskunftErteilen = isOwner(user.roles);
  // Zusammenführen ist ein Vorgang der Praxisleitung (PRX-018,
  // app.can_merge_patients).
  const darfZusammenfuehren = isOwner(user.roles);
  // UX-005e: Zugangshinweis und Besonderheit stehen im Kopf der Akte, sobald
  // sie gesetzt sind - hier zählen nur die Angaben, die der Kopf nicht trägt.
  const hatVersorgungsangaben = Boolean(patient.remark || patient.primary_therapist_name);
  // UX-005e: Die Kartenposition ist eine Zeile, solange sie fehlt; verortet
  // steht sie nicht als Dauerzeile da (ANN-016).
  const kartenpositionOffen = darfVerorten && !patient.geocode_precision;
  const hatPersonAngaben = Boolean(patient.institution || address) || kartenpositionOffen;
  const hatKontaktdaten = Boolean(
    patient.phone_mobile || patient.phone || patient.phone_work || patient.fax || patient.email,
  );

  // Formulare und Auskunft kehren hierher zurück - samt dem Rückweg der Akte,
  // der in der Adresse mitreist (PAT-08). Sonst stand nach dem Speichern der
  // Stammdaten „Zurück zur Liste" da, auch wenn man aus dem Kalender kam.
  const hier = `${ort.pathname}${ort.search}`;

  // Wer über „Erledigen" oder die alte Adresse `/datenschutz` kommt, landet
  // beim Anmeldebogen (AKTE-007). Der Router rollt nicht von selbst zum Anker.
  useEffect(() => {
    if (ort.hash !== `#${ANMELDEBOGEN_ANKER}`) return;
    document.getElementById(ANMELDEBOGEN_ANKER)?.scrollIntoView?.({ block: 'start' });
  }, [ort.hash]);

  return (
    <>
      {/* Der Weg ins Formular steht über den Abschnitten und nicht im Kopf von
          „Person": Er bearbeitet alle Abschnitte, und nebeneinander stehen die
          Köpfe der beiden Spalten so auf derselben Höhe (PAT-B01). */}
      {/* Rechts über den Abschnitten (Design-Handoff 2026-10-01, Abschnitt 7). */}
      <div className="mb-6 flex justify-end">
        <ButtonLink
          to={mitRueckweg(`/patienten/${patient.id}/bearbeiten`, hier)}
          variant="secondary"
          groesse="kompakt"
        >
          Stammdaten bearbeiten
        </ButtonLink>
      </div>

      {/* ABN-004: Nach einer Adressaenderung stehen hier die kuenftigen
          Hausbesuche, die noch die alte Anschrift tragen (ANN-003 Fassung 2). */}
      <HausbesucheMitAlterAdresse patientId={patient.id} user={user} />

      {/* Zwei Spalten erst ab 1280 px: Person und Kontakt sind kurze Listen und
          stünden untereinander als zwei schmale Streifen in einer leeren
          Fläche. Darunter blieben der Wertspalte neben der 176-px-Beschriftung
          knapp 100 px - Adresse und Zugangshinweis standen zu ein, zwei Wörtern
          je Zeile, und die Seite lief seitlich über (PAT-B01). Jeder Abschnitt
          steht in einem eigenen Rasterfeld - damit greift `first:mt-0` in
          jedem Feld und die Spalten beginnen auf derselben Höhe.

          Seit dem Design-Handoff vom 2026-10-01 steht neben der Akte ab 900 px
          eine Kontextspalte; ob zwei Spalten passen, entscheidet deshalb die
          eigene Breite (1024 px, `@5xl`), nicht mehr die des Fensters. Bei
          1280 px Fensterbreite liefen die Werte sonst wieder zu einzelnen
          Silben zusammen. */}
      <div className="@container">
        <div className="grid gap-x-8 gap-y-8 @5xl:grid-cols-2">
          {/* UX-005e: Das Geburtsdatum steht im Kopf über jedem Bereich und
            wird hier nicht wiederholt; ein Abschnitt ohne Zeile entfällt. */}
          {hatPersonAngaben ? (
            <div>
              <Section titel="Person" rahmen>
                <DetailList>
                  {patient.institution ? (
                    <DetailRow label="Einrichtung">{patient.institution}</DetailRow>
                  ) : null}
                  {address ? <DetailRow label="Adresse">{address}</DetailRow> : null}
                  {/* MAP-006a: Die Kartenposition ist Teil der Adresse (ANN-016).
                  Verorten darf, wer die Stammdaten ändern darf; verbindlich
                  prüft set_patient_address_coordinate (ADR-004). */}
                  {kartenpositionOffen ? (
                    <DetailRow label="Kartenposition">
                      <AdresseVerorten patient={patient} />
                    </DetailRow>
                  ) : null}
                </DetailList>
              </Section>
            </div>
          ) : null}

          <div>
            <Section titel="Kontakt" rahmen>
              {/* UX-005e: Leere Kontaktwege bekommen keine Zeile; fehlt alles,
                sagt das ein Satz statt vier Gedankenstriche. */}
              {hatKontaktdaten ? (
                <DetailList>
                  <TelefonZeile label="Mobil" nummer={patient.phone_mobile} />
                  <TelefonZeile label="Telefon (privat)" nummer={patient.phone} />
                  <TelefonZeile label="Telefon (geschäftlich)" nummer={patient.phone_work} />
                  {patient.fax ? <DetailRow label="Telefax">{patient.fax}</DetailRow> : null}
                  {patient.email ? (
                    <DetailRow label="E-Mail">
                      <Textlink
                        href={`mailto:${patient.email}`}
                        alleinstehend
                        className={KONTAKT_IN_DER_ZEILE}
                      >
                        {patient.email}
                      </Textlink>
                    </DetailRow>
                  ) : null}
                </DetailList>
              ) : (
                <p className="text-ink-muted text-sm">Keine Kontaktdaten hinterlegt</p>
              )}
            </Section>
          </div>

          {/* PAT-005: interne Angaben der Praxis. Für ein Patientenkonto liefert die
            Sicht sie gar nicht erst; der Abschnitt bleibt dann leer und
            verschwindet (ANN-010, ADR-004). Der Zugangshinweis steht zusätzlich
            auf der Übersicht - vor einem Hausbesuch ist er die Angabe, die man
            unterwegs sucht. Der Abschnitt heißt wie im Formular (PAT-07). */}
          {/* UX-003a: Die Behandlungsliege steht hier für jede Praxisrolle, auch
            wenn sonst nichts hinterlegt ist - sonst gäbe es keinen Ort, sie
            zu setzen. Dieselbe Rollenmenge wie update_patient; verbindlich
            prüft set_treatment_table_required (ADR-004). */}
          {hatVersorgungsangaben || darfLiegeSetzen ? (
            <div>
              <Section titel="Hausbesuch und Praxisangaben" rahmen>
                <DetailList>
                  {darfLiegeSetzen ? (
                    <DetailRow label="Behandlungsliege">
                      <Behandlungsliege patient={patient} darfAendern={darfLiegeSetzen} />
                    </DetailRow>
                  ) : null}
                  {/* PRX-007: Mitnehmen, von Hand gepflegt (ANN-138). Dieselbe
                    Rollenmenge wie die Liege; verbindlich prüft
                    set_take_along_items. */}
                  {darfLiegeSetzen ? (
                    <DetailRow label="Material">
                      <Mitnehmen patient={patient} darfAendern={darfLiegeSetzen} />
                    </DetailRow>
                  ) : null}
                  {/* UX-005e: Zugangshinweis und Besonderheit stehen im Kopf der
                    Akte (HausbesuchHinweise) - bearbeitet werden sie weiter im
                    Formular. */}
                  {patient.primary_therapist_name ? (
                    <DetailRow label="Feste Therapeut:in">
                      {patient.primary_therapist_name}
                    </DetailRow>
                  ) : null}
                  {patient.remark ? (
                    <DetailRow label="Bemerkung">{patient.remark}</DetailRow>
                  ) : null}
                </DetailList>
              </Section>
            </div>
          ) : null}

          {/* Versorgung und ihre Vorgänge in einem Abschnitt „Verwaltung"
            (Design-Handoff 2026-10-01, Abschnitt 7): Beginn und Abschluss
            stehen neben „Als inaktiv markieren" und „Versorgung
            abschließen", statt darunter in einem eigenen Block.
            UX-005e: Ohne erklärende Sätze - was ein Vorgang tut, sagt seine
            Rückfrage, bevor er ausgelöst wird. */}
          <div>
            <Section titel="Verwaltung" rahmen>
              <DetailList>
                <DetailRow label="Beginn">{formatDate(patient.care_started_on)}</DetailRow>
                {/* UX-005e: Der Status steht als Ausnahme im Kopf der Akte, der
                  Regelfall bekommt keine Zeile. Der Abschluss ist der Anker der
                  zehnjaehrigen Aufbewahrung (ADR-008, LOE-001b) und steht nur,
                  wenn er gesetzt ist - „Laufende Versorgung" war der Regelfall. */}
                {patient.care_concluded_on ? (
                  <DetailRow label="Abschluss">
                    {`${formatDate(patient.care_concluded_on)} – Aufbewahrung bis ${jahrPlus(patient.care_concluded_on, 10)}`}
                  </DetailRow>
                ) : null}
              </DetailList>
              {darfStatusWechseln || darfAbschliessen ? (
                <div className="border-line mt-3 flex flex-wrap items-start gap-3 border-t pt-3">
                  {darfStatusWechseln ? <StatusAktion patient={patient} /> : null}
                  {darfAbschliessen ? (
                    <VersorgungAbschliessen
                      patient={patient}
                      zeitzone={user.organizationTimeZone}
                    />
                  ) : null}
                </div>
              ) : null}
              <Zusammenfuehrungsvermerke
                patientId={patient.id}
                zeitzone={user.organizationTimeZone}
              />
            </Section>
          </div>
        </div>
      </div>

      {/* AKTE-007: Der Anmeldebogen - Datenschutzinformation, Vertrag und
          Einwilligungen samt ihrer Scans - steht bei den Kontaktdaten, die auf
          demselben Blatt stehen (ANN-224). Dieselben vier Praxisrollen wie
          bisher der Bereich „Datenschutz"; verbindlich ist die RLS. */}
      {darfVerorten ? (
        <div id={ANMELDEBOGEN_ANKER} className="mt-10 scroll-mt-4">
          <Datenschutz patient={patient} user={user} />
        </div>
      ) : null}

      <SonstigeDateien patientId={patient.id} user={user} />

      {/* POR-002: der eigene Zugang der Person zur Plattform (DSN-001
          Abschnitt 6). Dieselben Rollen wie die Kartei laden ein, sperren und
          entziehen (app.can_update_patient, ADR-023 Punkt 6); verbindlich
          prüft der Server. */}
      {darfVerorten && user.organizationTimeZone ? (
        <PlattformAbschnitt
          art="treatment"
          verhaeltnisId={patient.id}
          darfVerwalten={darfVerorten}
          zeitzone={user.organizationTimeZone}
          praxis={user.organizationName ?? 'der Praxis'}
        />
      ) : null}

      {/* PRX-018: Eine zweite Akte derselben Person hierher übernehmen. Nur
          `owner` - ausgeblendet ist keine Zugriffskontrolle, verbindlich
          prüft `merge_patients` (ADR-004). */}
      {darfZusammenfuehren ? (
        <Section titel="Dublette">
          <ButtonLink
            to={mitRueckweg(`/patienten/${patient.id}/dublette`, hier)}
            variant="secondary"
          >
            Dublette übernehmen
          </ButtonLink>
        </Section>
      ) : null}

      {/* Betroffenenrechte stehen unter der Verwaltung und nicht daneben: Sie
          beginnen mit einem Schreiben, nicht mit einem Klick (OPS-006). Der
          Zugang ist `owner` vorbehalten; ausgeblendet ist keine
          Zugriffskontrolle — verbindlich sind die Serverfunktionen
          (ADR-004). UX-005e: Die übrigen Rollen sehen den Abschnitt nicht -
          ein Satz darüber, wer etwas darf, ist kein Inhalt der Akte. Der
          Protokollhinweis entfällt ebenso; protokolliert wird weiter (ADR-010). */}
      {darfAuskunftErteilen ? (
        <Section titel="Betroffenenrechte">
          <ButtonLink
            to={mitRueckweg(`/patienten/${patient.id}/auskunft`, hier)}
            variant="secondary"
          >
            Auskunft und Löschverlangen
          </ButtonLink>
        </Section>
      ) : null}
    </>
  );
}
