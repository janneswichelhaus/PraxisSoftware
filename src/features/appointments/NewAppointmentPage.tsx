import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Fehlerzusammenfassung } from '@/components/ui/Fehlerzusammenfassung';
import { Hinweisfenster } from '@/components/ui/Dialogfenster';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { EINGABETEXTE, useTextverlustschutz } from '@/features/documentation/Textverlustschutz';
import { fetchPatient, fullName } from '@/features/patients/api';
import { canReadTreatmentBases, type CurrentUser } from '@/features/session/types';
import { fetchPatientTreatmentBases, grundlageBezeichnung } from '@/features/treatment-bases/api';
import { formatDate } from '@/lib/datum';
import type { Formularfehler } from '@/lib/formularfehler';
import { istInternerPfad, leseRueckweg, mitRueckweg, RUECKWEG_PARAM } from '@/lib/rueckweg';
import {
  AppointmentFormFields,
  ArbeitszeitRueckfrage,
  UebernommeneAdresse,
} from './AppointmentFormFields';
import { TerritoryHint } from '@/features/territories/TerritoryHint';
import { NachladeHinweis } from './Rueckmeldungen';
import {
  appointmentFormSchema,
  createAppointment,
  fensterEnde,
  fetchAssignableTherapists,
  fetchLocations,
  istAusserhalbArbeitszeit,
  istVergangenheit,
  liegtInVergangenheit,
  leererTermin,
  leseTerminVorbelegung,
  schreibeTerminVorbelegung,
  TERMINFENSTER_MINUTEN,
  todayInTimeZone,
  type AppointmentFormField,
  type AppointmentFormValues,
  type AppointmentType,
  type TerminVorbelegung,
} from './api';
import {
  DAUER_PARAM,
  leseDauer,
  mitAngelegtemTermin,
  nachDemAnlegen,
  speicherfehlerText,
  terminFehlerliste,
  terminFeldfehler,
} from './terminformular';

/**
 * Anlage eines Termins für einen bereits gewählten Patienten.
 *
 * Der Patient ist Kontext und nicht wechselbar: der Einstieg erfolgt aus seiner
 * Akte. Ein Wechsel wäre eine andere Aufgabe und würde die Verwechslungsgefahr
 * erhöhen.
 *
 * Die Prüfung im Formular dient der Bedienbarkeit. Verbindlich sind
 * Berechtigung, Organisationszuordnung, Zeitzone, Überschneidungsschutz und
 * Ortslogik in der Serverfunktion `create_appointment` (ADR-004).
 */
/** Kennungen in der Adresszeile werden geprüft, bevor sie weiterreisen. */
const VERORDNUNG_KENNUNG = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Die Felder, an denen sich eine Eingabe von der Vorbelegung unterscheiden kann. */
const FELDER: readonly AppointmentFormField[] = [
  'staff_member_id',
  'appointment_type',
  'date',
  'start_time',
  'end_time',
  'location_id',
];

/** Der Schutz vor Verlust spricht vom Termin, nicht von Text (ANN-046, UXR-001). */
const TERMINTEXTE = { ...EINGABETEXTE, bezeichnung: 'Ungespeicherter Termin' };

/** Titel des Fehlerfensters - und der Satz, den die Schnittstelle ohne Grund liefert. */
const SPEICHERFEHLER_TITEL = 'Der Termin konnte nicht angelegt werden.';

export function NewAppointmentPage({ user }: { user: CurrentUser }) {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [suche] = useSearchParams();
  // Einmalig beim ersten Rendern: die Vorbelegung stammt aus der Adresszeile
  // und soll spätere Eingaben nicht überschreiben.
  const [vorbelegung] = useState(() => leseTerminVorbelegung(suche));
  /**
   * Verordnung aus der Adresszeile (CAL-015c).
   *
   * Sie kommt vom Weg „Akte → Verordnung → Kalender → freie Stelle" und sagt,
   * aus welchem Kontingent dieser Termin geplant wird. Der Server prüft, dass
   * sie zu dieser Patient:in gehört; hier steht nur der Kontext.
   */
  const verordnungId = (() => {
    const roh = suche.get('verordnung');
    return roh && VERORDNUNG_KENNUNG.test(roh) ? roh : null;
  })();

  /**
   * Eintrag der Warteliste, aus dem der Termin nachrückt (PRX-004). Mit ihm
   * schließt der Server den Eintrag in derselben Transaktion wie das Anlegen.
   */
  const wartelisteId = (() => {
    const roh = suche.get('warteliste');
    return roh && VERORDNUNG_KENNUNG.test(roh) ? roh : null;
  })();

  /** Die Akte - Ziel von Rückweg und Abbrechen, wenn keiner mitgereist ist. */
  const akte = `/patienten/${patientId ?? ''}`;

  // Der laufende Praxistag: Vorbelegung des Datums und Vorabfrage bei einem
  // Tag davor (FIX-019). Ohne Zeitzone bleibt beides leer.
  const heute = user.organizationTimeZone ? todayInTimeZone(user.organizationTimeZone) : '';
  /**
   * Die Länge, mit der das Formular beginnt (CAL-015b).
   *
   * 60 ist die Vorbelegung nach §8.1. Nur der Abstecher in die Stammdaten
   * bringt eine andere mit zurück (TER-05): Sie war schon gewählt.
   */
  const [anfangsMinuten] = useState(() => leseDauer(suche) ?? TERMINFENSTER_MINUTEN);
  const [startwerte] = useState<Record<AppointmentFormField, string>>(() => ({
    ...leererTermin,
    // „Hausbesuch, ich, heute" ist der Regelfall dieser Praxis: sie fährt zu
    // den Menschen. Die Vorbelegung aus der Adresszeile geht vor - sie kommt
    // vom Folgetermin oder aus dem Kalender und weiß es genauer.
    appointment_type: vorbelegung.art ?? 'home_visit',
    date: vorbelegung.datum ?? heute,
    start_time: vorbelegung.beginn ?? '',
    // Das Ende wird abgeleitet, nicht übernommen (CAL-010a): aus dem Beginn
    // und der Länge, mit der das Formular beginnt. Ein Ende aus der
    // Adresszeile - der Kalender gibt eines mit - zählt nicht.
    end_time: vorbelegung.beginn ? fensterEnde(vorbelegung.beginn, anfangsMinuten) : '',
    staff_member_id: vorbelegung.person ?? '',
  }));
  const [werte, setWerte] = useState(startwerte);
  /**
   * Was ohne Zutun im Formular steht - Adresszeile, „ich", der einzige
   * Standort (TER-05).
   *
   * Der Schutz vor Verlust fragt erst, wenn eine Eingabe davon abweicht: Wer
   * das Formular nur öffnet und wieder verlässt, hat nichts verloren.
   */
  const [vorbelegt, setVorbelegt] = useState(startwerte);
  const [fehler, setFehler] = useState<Partial<Record<AppointmentFormField, string>>>({});
  /**
   * Die Zusammenfassung der letzten Prüfung (UIK-02, TER-06).
   *
   * Ein eigener Stand und nicht die Feldfehler selbst: Die Feldfehler
   * verschwinden beim Tippen, und jede Änderung ihrer Zahl holte den Fokus in
   * die Zusammenfassung - mitten aus dem Feld, in dem gerade korrigiert wird.
   * Die Nummer holt ihn bei jedem gescheiterten Absenden zurück.
   */
  const [pruefung, setPruefung] = useState<{ nummer: number; fehler: Formularfehler[] }>({
    nummer: 0,
    fehler: [],
  });
  /**
   * Die gewählte Länge (CAL-015b). 60 ist die Vorbelegung nach §8.1; 45 steht
   * daneben zur Wahl, eine dritte Länge weist der Server ab.
   */
  const [fensterMinuten, setFensterMinuten] = useState(anfangsMinuten);
  /** Enthält das Minutenfeld eine Zahl? Sonst gibt es kein Ende (CAL-020). */
  const [dauerGueltig, setDauerGueltig] = useState(true);

  const patient = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => fetchPatient(patientId!),
    enabled: Boolean(patientId),
    retry: false,
  });

  const therapeuten = useQuery({
    queryKey: ['assignable-therapists'],
    queryFn: fetchAssignableTherapists,
    retry: false,
  });

  const standorte = useQuery({
    queryKey: ['locations'],
    queryFn: fetchLocations,
    retry: false,
  });

  /**
   * Die Grundlage, der der Termin zugeordnet wird (TER-21).
   *
   * Nur auf dem Weg über eine Verordnung und nur für Rollen, die
   * Behandlungsgrundlagen lesen. Gelesen wird die organisatorische Sicht der
   * Akte - dieselbe Abfrage, dieselben Wörter, keine klinischen Felder.
   */
  const grundlagen = useQuery({
    queryKey: ['patient-treatment-bases', patientId],
    queryFn: () => fetchPatientTreatmentBases(patientId!),
    enabled: Boolean(patientId && verordnungId) && canReadTreatmentBases(user.roles),
    retry: false,
  });
  const grundlage = grundlagen.data?.find((eintrag) => eintrag.id === verordnungId) ?? null;
  // Wie in der Akte: die Bauart mit ihrem Datum, „Folgeverordnung vom
  // 18.06.2026" oder „Selbstzahler seit 03.09.2026" (ADR-020 Punkt 7).
  const grundlageText = grundlage
    ? `${grundlageBezeichnung(grundlage).bauart} ${grundlageBezeichnung(grundlage).praeposition} ${formatDate(grundlage.issued_on)}`
    : null;

  // Bei genau einem verfügbaren Standort darf vorausgewählt werden - eine
  // Auswahl ohne Alternative ist keine Entscheidung.
  useEffect(() => {
    const nurEiner = standorte.data?.length === 1 ? standorte.data[0] : undefined;
    if (nurEiner) {
      const vorwaehlen = (bisher: Record<AppointmentFormField, string>) =>
        bisher.location_id === '' ? { ...bisher, location_id: nurEiner.id } : bisher;
      setWerte(vorwaehlen);
      setVorbelegt(vorwaehlen);
    }
  }, [standorte.data]);

  /**
   * „Ich" als behandelnde Person - sobald feststeht, wer zuordenbar ist.
   *
   * Zwei Fälle, und beide brauchen die geladene Liste: Ist noch niemand
   * gewählt und ist die angemeldete Person selbst zuordenbar, wird sie
   * vorbelegt (UX-003). Steht in der Adresszeile eine Person, die gar nicht
   * zuordenbar ist, wird die Auswahl geleert - ein Wert ohne passende Option
   * sähe wie eine getroffene Wahl aus, wäre aber keine.
   */
  useEffect(() => {
    const zuordenbar = therapeuten.data;
    if (!zuordenbar) return;

    const vorbelegen = (bisher: Record<AppointmentFormField, string>) => {
      if (bisher.staff_member_id !== '') {
        const bekannt = zuordenbar.some((t) => t.staff_member_id === bisher.staff_member_id);
        return bekannt ? bisher : { ...bisher, staff_member_id: '' };
      }
      const ich = zuordenbar.find((t) => t.staff_member_id === user.staffMemberId);
      return ich ? { ...bisher, staff_member_id: ich.staff_member_id } : bisher;
    };
    setWerte(vorbelegen);
    setVorbelegt(vorbelegen);
  }, [therapeuten.data, user.staffMemberId]);

  const geaendert =
    fensterMinuten !== anfangsMinuten ||
    !dauerGueltig ||
    FELDER.some((feld) => werte[feld] !== vorbelegt[feld]);

  // Termin anlegen kennt keinen Entwurf: Die Rückfrage bietet nur Verwerfen
  // und Bleiben an (ANN-046, TER-05).
  const { freigeben, schutz } = useTextverlustschutz({
    ungespeichert: geaendert,
    texte: TERMINTEXTE,
  });

  /**
   * Ein Tag vor dem heutigen, noch nicht abgeschickt (FIX-019): Die Frage
   * kommt VOR dem Server, weil das Datum hier schon bekannt ist - der Server
   * prüft es trotzdem (ANN-057).
   */
  const [vorfrage, setVorfrage] = useState<AppointmentFormValues | null>(null);

  const mutation = useMutation({
    mutationFn: (eingabe: {
      werte: AppointmentFormValues;
      bestaetigt: boolean;
      vergangenheit: boolean;
    }) =>
      createAppointment(
        patientId!,
        eingabe.werte,
        eingabe.bestaetigt,
        verordnungId,
        eingabe.vergangenheit,
        wartelisteId,
      ),
    onSuccess: async (appointmentId) => {
      await queryClient.invalidateQueries({ queryKey: ['appointments'] });
      if (wartelisteId) await queryClient.invalidateQueries({ queryKey: ['waitlist'] });
      // Zurück, wo das Anlegen begann (BEF-016): Wer aus dem Kalender kam,
      // landet wieder im Kalender, mit dem neuen Termin hervorgehoben; wer vom
      // Termin kam („Folgetermin anlegen"), auf dem Termin, der das Anlegen
      // bestätigt (TER-04). Ohne Rückweg bleibt es die Terminansicht.
      const rueckweg = nachDemAnlegen(leseRueckweg(suche, ''), wartelisteId !== null);
      // Gespeichert ist gespeichert: Der eigene Weg danach ist kein Verlust.
      freigeben();
      void navigate(
        rueckweg ? mitAngelegtemTermin(rueckweg, appointmentId) : `/termine/${appointmentId}`,
        {
          replace: true,
        },
      );
    },
  });

  function setzen(feld: AppointmentFormField, wert: string) {
    setWerte((bisher) =>
      feld === 'start_time'
        ? {
            ...bisher,
            start_time: wert,
            // Ein leeres oder halbes Minutenfeld ergibt kein Ende - auch
            // nicht über einen neuen Beginn mit der zuletzt gültigen Länge.
            end_time: dauerGueltig ? fensterEnde(wert, fensterMinuten) : '',
          }
        : { ...bisher, [feld]: wert },
    );
    if (fehler[feld]) setFehler((bisher) => ({ ...bisher, [feld]: undefined }));
    // Eine geänderte Eingabe macht die Rückfrage gegenstandslos: sie bezieht
    // sich auf genau den Zeitraum, der abgewiesen wurde.
    if (mutation.isError) mutation.reset();
  }

  /**
   * Wiederholt den Vorgang mit einer weiteren Bestätigung (CAL-005, FIX-019).
   * Was schon bestätigt war, bleibt bestätigt - so kommt nach der zweiten
   * Frage keine dritte.
   */
  function bestaetigen(zusatz: { bestaetigt?: boolean; vergangenheit?: boolean }) {
    if (mutation.isPending) return;
    const ergebnis = appointmentFormSchema.safeParse(werte);
    if (!ergebnis.success) return;
    mutation.mutate({
      werte: ergebnis.data,
      bestaetigt: zusatz.bestaetigt ?? mutation.variables?.bestaetigt ?? false,
      vergangenheit: zusatz.vergangenheit ?? mutation.variables?.vergangenheit ?? false,
    });
  }

  function absenden(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Schutz gegen mehrfaches Absenden: solange ein Vorgang läuft, wird kein
    // zweiter gestartet. Der Button ist zusätzlich deaktiviert.
    if (mutation.isPending) return;

    const ergebnis = appointmentFormSchema.safeParse(werte);
    const gefunden: Partial<Record<AppointmentFormField, string>> = ergebnis.success
      ? {}
      : terminFeldfehler(ergebnis.error.issues, werte, dauerGueltig);
    // Eine gescheiterte Pflichtliste sperrt das Absenden (ZST-07): Die
    // Auswahl sähe sonst getroffen oder leer aus, ohne es zu sein.
    if (therapeuten.isError && !gefunden.staff_member_id) {
      gefunden.staff_member_id = 'Bitte zuerst die Liste der Personen erneut laden.';
    }
    if (werte.appointment_type === 'practice' && standorte.isError && !gefunden.location_id) {
      gefunden.location_id = 'Bitte zuerst die Liste der Standorte erneut laden.';
    }

    if (!ergebnis.success || Object.keys(gefunden).length > 0) {
      setFehler(gefunden);
      setPruefung((bisher) => ({ nummer: bisher.nummer + 1, fehler: terminFehlerliste(gefunden) }));
      return;
    }

    setFehler({});
    setPruefung((bisher) => ({ ...bisher, fehler: [] }));
    if (heute && liegtInVergangenheit(ergebnis.data.date, heute)) {
      setVorfrage(ergebnis.data);
      return;
    }
    mutation.mutate({ werte: ergebnis.data, bestaetigt: false, vergangenheit: false });
  }

  /**
   * Zurück ins Formular nach dem Abstecher in die Stammdaten (TER-05).
   *
   * Mit allem, was schon steht: Tag, Beginn, Dauer, Art und Person, dazu die
   * Verordnung, auf die der Termin gebucht wird, und der eigene Rückweg.
   * Vorher kam nur ein Teil davon zurück - und ohne die Verordnung entstand
   * der Termin danach ohne Grundlage.
   */
  function rueckkehrAdresse(): string {
    const felder: TerminVorbelegung = { art: werte.appointment_type as AppointmentType };
    if (werte.date) felder.datum = werte.date;
    if (werte.start_time) felder.beginn = werte.start_time;
    if (werte.staff_member_id) felder.person = werte.staff_member_id;
    const teile = new URLSearchParams(schreibeTerminVorbelegung(felder));
    if (dauerGueltig && fensterMinuten !== TERMINFENSTER_MINUTEN) {
      teile.set(DAUER_PARAM, String(fensterMinuten));
    }
    if (verordnungId) teile.set('verordnung', verordnungId);
    if (wartelisteId) teile.set('warteliste', wartelisteId);
    const eingehend = suche.get(RUECKWEG_PARAM);
    if (istInternerPfad(eingehend)) teile.set(RUECKWEG_PARAM, eingehend);
    return `${akte}/termine/neu?${teile.toString()}`;
  }

  // Der Rückweg steht in jedem Zustand der Seite - auch beim Laden und im
  // Fehlerfall, wo er sonst der einzige Weg zurück wäre (ZST-08).
  const kopf = <Rueckweg standard={akte} beschriftung="Zurück zur Akte" />;

  // Ersetzt wird das Formular nur, solange es keine Daten gibt: Ein
  // gescheitertes Nachladen nimmt eine angefangene Eingabe nicht mehr mit
  // (ZST-03).
  if (!patient.data) {
    if (patient.isPending) {
      return (
        <>
          {kopf}
          <LoadingState label="Patientendaten werden geladen …" />
        </>
      );
    }
    return (
      <>
        {kopf}
        {patient.isError ? (
          <ErrorState
            title="Die Patientendaten konnten nicht geladen werden."
            description="Bitte die Verbindung prüfen und erneut versuchen."
            onErneut={() => void patient.refetch()}
          />
        ) : (
          <ErrorState
            title="Nicht gefunden"
            description="Diese Akte gibt es nicht oder sie ist für Ihren Zugang nicht freigegeben."
          />
        )}
      </>
    );
  }

  // Nach der Pruefung oben festhalten: in Closures ginge die Einengung des
  // Typs sonst verloren.
  const patientDaten = patient.data;

  return (
    <>
      {kopf}

      <PageHeader
        title="Termin anlegen"
        description={`Für ${fullName(patientDaten)}. Mit * markierte Felder sind erforderlich.`}
      />

      {patient.isError ? (
        <NachladeHinweis
          className="mb-6"
          laeuft={patient.isFetching}
          onErneut={() => void patient.refetch()}
        />
      ) : null}

      <form onSubmit={absenden} noValidate className="max-w-xl">
        {/* Sind alle Angaben berichtigt, verschwindet der Kasten; bis dahin
            bleibt er, wie ihn die Prüfung aufgestellt hat. */}
        <Fehlerzusammenfassung
          key={pruefung.nummer}
          fehler={Object.values(fehler).some(Boolean) ? pruefung.fehler : []}
        />

        {/* Rückfrage und Fehler als Fenster über dem Formular (FIX-016): Wer am
            Seitenende abschickt, sieht sie sofort. */}
        {vorfrage ? (
          <ArbeitszeitRueckfrage
            arbeitszeit={false}
            vergangenheit
            onBestaetigen={() => {
              const w = vorfrage;
              setVorfrage(null);
              mutation.mutate({ werte: w, bestaetigt: false, vergangenheit: true });
            }}
            onAbbrechen={() => setVorfrage(null)}
            laeuft={false}
            beschriftung="Termin trotzdem anlegen"
          />
        ) : istAusserhalbArbeitszeit(mutation.error) ? (
          <ArbeitszeitRueckfrage
            vergangenheit={mutation.variables?.vergangenheit ?? false}
            onBestaetigen={() => bestaetigen({ bestaetigt: true })}
            onAbbrechen={() => mutation.reset()}
            laeuft={mutation.isPending}
            beschriftung="Termin trotzdem anlegen"
          />
        ) : istVergangenheit(mutation.error) ? (
          <ArbeitszeitRueckfrage
            arbeitszeit={false}
            vergangenheit
            onBestaetigen={() => bestaetigen({ vergangenheit: true })}
            onAbbrechen={() => mutation.reset()}
            laeuft={mutation.isPending}
            beschriftung="Termin trotzdem anlegen"
          />
        ) : mutation.isError ? (
          <Hinweisfenster titel={SPEICHERFEHLER_TITEL} onSchliessen={() => mutation.reset()}>
            {speicherfehlerText(mutation.error.message, SPEICHERFEHLER_TITEL)}
          </Hinweisfenster>
        ) : null}

        {/* Kein Kasten mit dem Namen mehr: Er steht schon in der Beschreibung
            darüber (TER-21). Genannt wird dafür, was die Seite sonst
            verschwiege - die Grundlage, der der Termin zugeordnet wird. */}
        {wartelisteId ? (
          <p className="text-ink mb-3 max-w-prose text-sm">
            Aus der Warteliste: Mit dem Termin wird der Eintrag als eingeplant geschlossen.
          </p>
        ) : null}
        {verordnungId ? (
          <p className="text-ink mb-6 max-w-prose text-sm">
            {grundlageText
              ? `Der Termin wird dieser Behandlungsgrundlage zugeordnet: ${grundlageText}.`
              : 'Der Termin wird der Behandlungsgrundlage zugeordnet, aus der er geplant wird.'}
          </p>
        ) : null}

        <AppointmentFormFields
          werte={werte}
          fehler={fehler}
          onChange={setzen}
          therapeuten={therapeuten.data ?? []}
          personenListe={{
            laedt: therapeuten.isPending,
            fehlgeschlagen: therapeuten.isError,
            erneut: () => void therapeuten.refetch(),
          }}
          standorte={standorte.data ?? []}
          standortListe={{
            laedt: standorte.isPending,
            fehlgeschlagen: standorte.isError,
            erneut: () => void standorte.refetch(),
          }}
          rasterMinuten={user.appointmentGridMinutes ?? undefined}
          fensterMinuten={fensterMinuten}
          onFensterMinuten={(minuten) => {
            if (minuten !== null) setFensterMinuten(minuten);
            setDauerGueltig(minuten !== null);
            setWerte((bisher) => ({
              ...bisher,
              end_time: fensterEnde(bisher.start_time, minuten),
            }));
            if (fehler.end_time) {
              setFehler(({ end_time: _entfaellt, ...rest }) => rest);
            }
            if (mutation.isError) mutation.reset();
          }}
          hausbesuch={
            <>
              <UebernommeneAdresse
                street={patientDaten.street}
                houseNumber={patientDaten.house_number}
                postalCode={patientDaten.postal_code}
                city={patientDaten.city}
                // Der Abstecher in die Stammdaten und zurück in genau dieses
                // Formular - mit allem, was es schon trägt (UX-012, TER-05).
                // Weil nichts verloren geht, fragt der Schutz hier nicht.
                ergaenzenZiel={mitRueckweg(`${akte}/bearbeiten`, rueckkehrAdresse())}
                onErgaenzen={freigeben}
              />
              {/* Gebietstag der Adresse (PRX-002): warnt, sperrt nichts. */}
              <TerritoryHint
                postalCode={patientDaten.postal_code}
                slots={[{ datum: werte.date, beginn: werte.start_time }]}
              />
            </>
          }
        />

        {/* Die Rückfrage vor dem Weggehen steht dort, wo gearbeitet wird -
            über den Knöpfen (TER-05). */}
        {schutz}

        <div className="mt-8 flex flex-wrap gap-3">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Wird angelegt …' : 'Termin anlegen'}
          </Button>
          {/* Ein Seitenwechsel und damit ein Link (UIK-13); dasselbe Ziel wie
              der Rückweg oben (TER-03). */}
          <ButtonLink to={leseRueckweg(suche, akte)} variant="secondary">
            Abbrechen
          </ButtonLink>
        </div>
      </form>

      <p className="text-ink-muted mt-10 max-w-prose text-xs leading-relaxed">
        Es werden ausschließlich organisatorische Angaben erfasst. Klinische Inhalte gehören nicht
        zum Termin.
      </p>
    </>
  );
}
