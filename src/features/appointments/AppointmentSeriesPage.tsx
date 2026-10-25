import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { VERBINDUNG_PRUEFEN } from '@/components/ui/abfrageTexte';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Tile, TileGrid } from '@/components/ui/Tile';
import { Fehlerzusammenfassung } from '@/components/ui/Fehlerzusammenfassung';
import { Dialogfenster, Hinweisfenster } from '@/components/ui/Dialogfenster';
import { Field } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Feldgruppe, Section } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { EINGABETEXTE, useTextverlustschutz } from '@/app/Textverlustschutz';
import { fetchPatient, fullName } from '@/features/patients/api';
import type { CurrentUser } from '@/features/session/types';
import { alsFormularfehler, type Formularfehler } from '@/lib/formularfehler';
import { istInternerPfad, leseRueckweg, mitRueckweg, RUECKWEG_PARAM } from '@/lib/rueckweg';
import { ArbeitszeitRueckfrage, UebernommeneAdresse } from './AppointmentFormFields';
import { TerritoryHint } from '@/features/territories/TerritoryHint';
import { Deckungszeichen } from './Deckungszeichen';
import { Listenfehler, NachladeHinweis } from '@/components/ui/Rueckmeldung';
import {
  checkAppointmentSlots,
  createAppointmentSeries,
  fensterEnde,
  fetchTreatmentBasisSlots,
  istAusserhalbArbeitszeit,
  istHinderlich,
  slotConflictLabels,
  type AppointmentFormValues,
  type SlotConflict,
} from './api';
import { tageslageNeuLaden } from './tageslage';
import {
  SERIE_HOECHSTZAHL,
  rhythmen,
  serienTermine,
  type Rhythmus,
  type Serientermin,
} from './serie';
import { speicherfehlerText } from './terminformular';
import { formatDate, todayInTimeZone, istIsoDatum } from '@/lib/datum';
import { fetchAssignableTherapists, fetchLocations } from '@/features/staff/api';
import {
  appointmentTypeLabels,
  leseTerminVorbelegung,
  schreibeTerminVorbelegung,
  type AppointmentType,
  type TerminVorbelegung,
} from '@/lib/termin';

/**
 * „1 Termin" gegen „3 Termine" — an einer Stelle statt in jeder Meldung.
 *
 * Ohne das steht in der Oberfläche „1 Termine anlegen" und „1 von 10 Terminen
 * sind nicht planbar". Bei einer Serie ist die Eins kein Sonderfall: Genau so
 * sieht der letzte offene Platz einer Grundlage aus.
 */
function termineWort(anzahl: number): string {
  return anzahl === 1 ? '1 Termin' : `${anzahl} Termine`;
}

/** Die Felder des Vorschlags - in der Reihenfolge des Formulars. */
type Serienfeld = 'person' | 'standort' | 'ersterTag' | 'beginn' | 'anzahl';

const SERIENFELDER: readonly Serienfeld[] = ['person', 'standort', 'ersterTag', 'beginn', 'anzahl'];

/** Beschriftungen für die Fehlerzusammenfassung, ohne Sternchen. */
const SERIENFELD_BESCHRIFTUNG: Readonly<Record<Serienfeld, string>> = {
  person: 'Behandelnde Person',
  standort: 'Standort',
  ersterTag: 'Erster Termin am',
  beginn: 'Beginn',
  anzahl: 'Anzahl Termine',
};

/** Feste Kennungen, damit die Zusammenfassung auf das Feld springen kann (TER-06). */
function serienfeldId(feld: Serienfeld): string {
  return `serie-${feld}`;
}

/** Die Anzahl als ganze Zahl von 1 bis zur Höchstzahl - sonst `null`. */
function gueltigeAnzahl(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const zahl = Number(text);
  return zahl >= 1 && zahl <= SERIE_HOECHSTZAHL ? zahl : null;
}

/** Der Schutz vor Verlust spricht von der Serie (ANN-046, UXR-001). */
const SERIENTEXTE = { ...EINGABETEXTE, bezeichnung: 'Ungespeicherter Dauertermin' };

/** Der Satz, den die Schnittstelle liefert, wenn sie keinen Grund nennen kann. */
const SPEICHERFEHLER_TITEL = 'Der Dauertermin konnte nicht angelegt werden.';

/**
 * Terminserie aus einer Behandlungsgrundlage (CAL-007, seit GRD-001 beide
 * Bauarten).
 *
 * Der Vorgang hat zwei Schritte, und das ist Absicht: erst ein Vorschlag aus
 * Rhythmus und Anzahl, dann eine Liste, in der jeder Termin einzeln
 * verschiebbar ist. Die Serie ist serverseitig alles oder nichts — ohne die
 * Zwischenansicht hieße ein Feiertag in Woche drei: Meldung lesen und raten.
 *
 * Die Rhythmusrechnung steht in `serie.ts` und ist deterministisch (§6.2). Die
 * Konfliktprüfung macht ausschließlich der Server; was hier steht, ist ihre
 * Darstellung (ADR-004).
 */
export function AppointmentSeriesPage({ user }: { user: CurrentUser }) {
  const { patientId, grundlageId } = useParams<{
    patientId: string;
    grundlageId: string;
  }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const praxisZeitzone = user.organizationTimeZone;
  const heute = praxisZeitzone ? todayInTimeZone(praxisZeitzone) : '';

  // Tag, Beginn und Person kommen aus der aufgezogenen Spanne im Kalender,
  // wenn der Weg von dort kam (CAL-019, KAL-05). Die Länge nicht: Sie steht
  // beim Behandlungstermin ohnehin im Terminfenster.
  const [suche] = useSearchParams();
  const [vorbelegung] = useState(() => leseTerminVorbelegung(suche));

  /** Die Akte - Ziel des Rückwegs, wenn keiner mitgereist ist. */
  const akte = `/patienten/${patientId ?? ''}`;

  /**
   * Was ohne Zutun im Formular steht (TER-05).
   *
   * Der Schutz vor Verlust fragt erst, wenn eine Eingabe davon abweicht oder
   * schon ein Vorschlag auf dem Tisch liegt.
   */
  const [vorbelegt, setVorbelegt] = useState<{
    staffMemberId: string;
    art: AppointmentType;
    locationId: string;
    ersterTag: string;
    beginn: string;
    rhythmus: Rhythmus;
    anzahl: string;
  }>(() => ({
    staffMemberId: vorbelegung.person ?? '',
    art: 'home_visit',
    locationId: '',
    ersterTag: vorbelegung.datum ?? heute,
    beginn: vorbelegung.beginn ?? '',
    rhythmus: 'woechentlich',
    anzahl: '1',
  }));

  // Die Person aus dem Kalender geht vor „ich" (KAL-05): Wer in Tims Spalte
  // tippt, plant für Tim.
  const [staffMemberId, setStaffMemberId] = useState(vorbelegt.staffMemberId);
  const [art, setArt] = useState<AppointmentType>(vorbelegt.art);
  const [locationId, setLocationId] = useState(vorbelegt.locationId);
  const [ersterTag, setErsterTag] = useState(vorbelegt.ersterTag);
  const [beginn, setBeginn] = useState(vorbelegt.beginn);
  const [rhythmus, setRhythmus] = useState<Rhythmus>(vorbelegt.rhythmus);
  /** Als Text, damit ein geleertes Feld leer bleibt und nicht „0" zeigt (TER-06). */
  const [anzahl, setAnzahl] = useState(vorbelegt.anzahl);

  /** Die Liste, sobald ein Vorschlag steht. `null` heißt „noch keiner". */
  const [liste, setListe] = useState<Serientermin[] | null>(null);
  /** Die Zeile im Fenster „Termin n ändern“ (Design-Rollout B2). */
  const [bearbeitet, setBearbeitet] = useState<number | null>(null);
  /**
   * Befunde **samt dem Vorschlag, zu dem sie gehören**. `null` heißt „noch
   * nicht geprüft".
   *
   * Der Stempel ist der Kern (UX-012): Eine Prüfung läuft über den Server und
   * braucht ihre Zeit. Wer in dieser Zeit ein Datum ändert, bekam vorher die
   * Antwort auf die **alte** Liste zurück — und weil nur die Länge verglichen
   * wurde, galt sie als gültiger Befund für die neue. „Alle drei Termine sind
   * planbar" konnte damit eine Aussage über eine Liste sein, die es nicht mehr
   * gab. Der Stempel verwirft eine überholte Antwort, statt sie einzusetzen.
   */
  const [befunde, setBefunde] = useState<{
    fuer: string;
    werte: (SlotConflict | null)[];
  } | null>(null);
  /** Feldfehler des Vorschlags - am Feld und in der Zusammenfassung (TER-06). */
  const [fehler, setFehler] = useState<Partial<Record<Serienfeld, string>>>({});
  const [pruefungsstand, setPruefungsstand] = useState<{
    nummer: number;
    fehler: Formularfehler[];
  }>({ nummer: 0, fehler: [] });

  const patient = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => fetchPatient(patientId!),
    enabled: Boolean(patientId),
    retry: false,
  });

  const kontingent = useQuery({
    queryKey: ['treatment-basis-slots', grundlageId],
    queryFn: () => fetchTreatmentBasisSlots(grundlageId!),
    enabled: Boolean(grundlageId),
    retry: false,
  });

  const therapeuten = useQuery({
    queryKey: ['assignable-therapists'],
    queryFn: fetchAssignableTherapists,
    retry: false,
  });

  const standorte = useQuery({ queryKey: ['locations'], queryFn: fetchLocations, retry: false });

  /**
   * Die behandelnde Person, sobald feststeht, wer zuordenbar ist - wie im
   * Terminformular (UX-003, KAL-05).
   *
   * Eine Person aus der Adresszeile bleibt, wenn sie zuordenbar ist, und
   * fällt sonst weg: Ein Wert ohne passende Option sähe aus wie eine
   * getroffene Wahl. Ist niemand gewählt, wird die angemeldete Person
   * vorbelegt, sofern sie zuordenbar ist.
   */
  useEffect(() => {
    const zuordenbar = therapeuten.data;
    if (!zuordenbar) return;
    const vorbelegen = (bisher: string) => {
      if (bisher !== '') {
        return zuordenbar.some((t) => t.staff_member_id === bisher) ? bisher : '';
      }
      const ich = zuordenbar.find((t) => t.staff_member_id === user.staffMemberId);
      return ich ? ich.staff_member_id : bisher;
    };
    setStaffMemberId(vorbelegen);
    setVorbelegt((bisher) => ({ ...bisher, staffMemberId: vorbelegen(bisher.staffMemberId) }));
  }, [therapeuten.data, user.staffMemberId]);

  useEffect(() => {
    const nurEiner = standorte.data?.length === 1 ? standorte.data[0] : undefined;
    if (!nurEiner) return;
    setLocationId((bisher) => (bisher === '' ? nurEiner.id : bisher));
    setVorbelegt((bisher) =>
      bisher.locationId === '' ? { ...bisher, locationId: nurEiner.id } : bisher,
    );
  }, [standorte.data]);

  // Die noch planbaren Termine sind der Vorschlag für die Anzahl — genau dafür
  // schlägt man eine Verordnung im Alltag auf. Ist nichts mehr planbar, bleibt
  // es bei einem Termin: Seit CAL-022 darf auch über die Grundlage hinaus
  // geplant werden, und die Seite sagt daneben, was dabei ungedeckt bleibt.
  const offen = kontingent.data?.remaining ?? 0;
  useEffect(() => {
    if (offen <= 0) return;
    const vorschlag = String(Math.min(offen, SERIE_HOECHSTZAHL));
    setAnzahl(vorschlag);
    setVorbelegt((bisher) => ({ ...bisher, anzahl: vorschlag }));
  }, [offen]);

  const geaendert =
    liste !== null ||
    staffMemberId !== vorbelegt.staffMemberId ||
    art !== vorbelegt.art ||
    locationId !== vorbelegt.locationId ||
    ersterTag !== vorbelegt.ersterTag ||
    beginn !== vorbelegt.beginn ||
    rhythmus !== vorbelegt.rhythmus ||
    anzahl !== vorbelegt.anzahl;

  // Die Serie kennt keinen Entwurf: Die Rückfrage bietet nur Verwerfen und
  // Bleiben an (ANN-046, TER-05).
  const { freigeben, schutz } = useTextverlustschutz({
    ungespeichert: geaendert,
    texte: SERIENTEXTE,
  });

  /**
   * Wofür ein Befund gilt: die behandelnde Person und jede Zeile der Liste.
   *
   * Beides geht in die serverseitige Prüfung ein — eine andere Person hat
   * andere Arbeitszeiten und andere Überschneidungen.
   */
  function stempel(person: string, termine: Serientermin[]): string {
    return [person, ...termine.map((t) => `${t.datum} ${t.beginn}`)].join('|');
  }

  const pruefung = useMutation({
    mutationFn: (auftrag: { person: string; termine: Serientermin[] }) =>
      checkAppointmentSlots(auftrag.person, auftrag.termine),
    onSuccess: (werte, auftrag) =>
      setBefunde({ fuer: stempel(auftrag.person, auftrag.termine), werte }),
  });

  /** Startet eine Prüfung für genau diesen Stand. */
  function pruefen(termine: Serientermin[]) {
    if (termine.length === 0) return;
    pruefung.mutate({ person: staffMemberId, termine });
  }

  const anlegen = useMutation({
    mutationFn: (eingabe: { termine: Serientermin[]; bestaetigt: boolean }) => {
      const werte: AppointmentFormValues = {
        staff_member_id: staffMemberId,
        appointment_type: art,
        date: eingabe.termine[0]?.datum ?? '',
        start_time: eingabe.termine[0]?.beginn ?? '',
        end_time: fensterEnde(eingabe.termine[0]?.beginn ?? ''),
        location_id: locationId,
      };
      return createAppointmentSeries(
        patientId!,
        grundlageId!,
        werte,
        eingabe.termine,
        eingabe.bestaetigt,
      );
    },
    onSuccess: async (angelegt) => {
      // Die Schlüssel sind genau die, unter denen die Akte ihre Listen führt.
      // `patient-upcoming` war keiner davon (UX-012): Der Abschnitt „Nächste
      // Termine" heißt `patient-upcoming-appointments` und blieb deshalb nach
      // dem Anlegen auf dem alten Stand — die eben erzeugte Serie fehlte dort,
      // bis jemand neu lud.
      await tageslageNeuLaden(queryClient);
      await queryClient.invalidateQueries({ queryKey: ['patient-upcoming-appointments'] });
      await queryClient.invalidateQueries({ queryKey: ['patient-appointments', patientId] });
      await queryClient.invalidateQueries({ queryKey: ['patient-next-appointment', patientId] });
      // Verplant ist nicht genutzt, aber verplant zählt gegen das offene
      // Kontingent (ANN-038) - beide Zählungen sind jetzt veraltet.
      await queryClient.invalidateQueries({
        queryKey: ['patient-treatment-basis-slots', patientId],
      });
      await queryClient.invalidateQueries({ queryKey: ['treatment-basis-slots', grundlageId] });
      // Zurück, wo das Anlegen begann (TER-03, KAL-05) - aus dem Kalender in
      // den Kalender, sonst in die Terminliste der Akte. Die Bestätigung reist
      // im Verlauf mit, nicht in der Adresse (TER-04).
      freigeben();
      void navigate(leseRueckweg(suche, `${akte}/termine`), {
        replace: true,
        state: { meldung: `${termineWort(angelegt)} angelegt.` },
      });
    },
  });

  /** Jede Änderung an der Liste macht den Befund gegenstandslos. */
  function listeSetzen(neu: Serientermin[] | null) {
    setListe(neu);
    setBefunde(null);
    if (anlegen.isError) anlegen.reset();
  }

  /** Nimmt den Fehler eines Feldes zurück, sobald es geändert wird. */
  function feldGeaendert(feld: Serienfeld) {
    if (fehler[feld]) setFehler((bisher) => ({ ...bisher, [feld]: undefined }));
  }

  function vorschlagen(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const gefunden: Partial<Record<Serienfeld, string>> = {};
    if (staffMemberId === '') {
      gefunden.person = therapeuten.isError
        ? 'Bitte zuerst die Liste der Personen erneut laden.'
        : 'Bitte eine behandelnde Person wählen.';
    }
    if (art === 'practice' && locationId === '') {
      gefunden.standort = 'Für Praxistermine ist ein Standort erforderlich.';
    }
    if (!ersterTag) gefunden.ersterTag = 'Bitte das Datum des ersten Termins wählen.';
    if (!beginn) gefunden.beginn = 'Bitte einen Beginn wählen.';
    else if (fensterEnde(beginn) === '') {
      gefunden.beginn = 'Der Termin reicht über Mitternacht. Bitte einen früheren Beginn wählen.';
    }
    const zahl = gueltigeAnzahl(anzahl);
    if (zahl === null) {
      gefunden.anzahl = `Bitte eine Zahl von 1 bis ${SERIE_HOECHSTZAHL} eingeben.`;
    }

    if (zahl === null || Object.keys(gefunden).length > 0) {
      setFehler(gefunden);
      setPruefungsstand((bisher) => ({
        nummer: bisher.nummer + 1,
        fehler: alsFormularfehler(SERIENFELDER, SERIENFELD_BESCHRIFTUNG, gefunden, serienfeldId),
      }));
      return;
    }

    setFehler({});
    setPruefungsstand((bisher) => ({ ...bisher, fehler: [] }));
    const termine = serienTermine(ersterTag, beginn, rhythmus, zahl);
    listeSetzen(termine);
    pruefen(termine);
  }

  function zeileSetzen(index: number, feld: 'datum' | 'beginn', wert: string) {
    if (!liste) return;
    listeSetzen(liste.map((t, i) => (i === index ? { ...t, [feld]: wert } : t)));
  }

  function zeileEntfernen(index: number) {
    if (!liste) return;
    listeSetzen(liste.filter((_, i) => i !== index));
  }

  function absenden(bestaetigt: boolean) {
    if (!liste || liste.length === 0 || anlegen.isPending) return;
    anlegen.mutate({ termine: liste, bestaetigt });
  }

  /**
   * Zurück auf diese Seite nach dem Abstecher in die Stammdaten (TER-15).
   *
   * Tag, Beginn und Person reisen mit, ebenso der eigene Rückweg. Ein
   * Vorschlag mit einzeln geänderten Zeilen reist nicht mit - deshalb fragt
   * der Schutz vorher nach, wenn es einen gibt.
   */
  function rueckkehrAdresse(): string {
    const felder: TerminVorbelegung = {};
    if (ersterTag) felder.datum = ersterTag;
    if (beginn) felder.beginn = beginn;
    if (staffMemberId) felder.person = staffMemberId;
    const teile = new URLSearchParams(schreibeTerminVorbelegung(felder));
    const eingehend = suche.get(RUECKWEG_PARAM);
    if (istInternerPfad(eingehend)) teile.set(RUECKWEG_PARAM, eingehend);
    const text = teile.toString();
    return `${akte}/verordnungen/${grundlageId ?? ''}/serie${text ? `?${text}` : ''}`;
  }

  // Der Rückweg steht in jedem Zustand der Seite (ZST-08). Er folgt dem
  // mitgereisten Weg - aus dem Kalender zurück in den Kalender (TER-03).
  const kopf = <Rueckweg standard={akte} beschriftung="Zurück zur Akte" />;
  const abbrechenZiel = leseRueckweg(suche, akte);

  // Ersetzt wird die Seite nur, solange es keine Daten gibt: Ein
  // gescheitertes Nachladen nimmt Vorschlag und Liste nicht mehr mit
  // (ZST-03). Ein Ladefehler ist kein „Nicht gefunden" (TER-11).
  if (!patient.data || !kontingent.data) {
    if (patient.isPending || kontingent.isPending) {
      return (
        <>
          {kopf}
          <LoadingState label="Behandlungsgrundlage wird geladen …" />
        </>
      );
    }
    return (
      <>
        {kopf}
        {patient.isError && !patient.data ? (
          <ErrorState
            title="Die Patientendaten konnten nicht geladen werden."
            description={VERBINDUNG_PRUEFEN}
            onErneut={() => void patient.refetch()}
          />
        ) : !patient.data ? (
          <ErrorState
            title="Nicht gefunden"
            description="Diese Akte gibt es nicht oder sie ist für Ihren Zugang nicht freigegeben."
          />
        ) : (
          // Ohne Zahlen gibt es keine Serie. Die Schnittstelle unterscheidet
          // eine fehlende von einer nicht ladbaren Grundlage nicht.
          <ErrorState
            title="Die Zahlen der Grundlage konnten nicht geladen werden."
            description={VERBINDUNG_PRUEFEN}
            onErneut={() => void kontingent.refetch()}
          />
        )}
      </>
    );
  }

  const patientDaten = patient.data;
  const zahlen = kontingent.data;
  // Geprüft ist nur, was zu genau diesem Stand geprüft wurde - nicht, was
  // zufällig dieselbe Anzahl Zeilen hat.
  const geprueft =
    befunde !== null && liste !== null && befunde.fuer === stempel(staffMemberId, liste);
  const werte = geprueft ? befunde.werte : [];
  const hindernisse = werte.filter(istHinderlich).length;
  const randzeiten = werte.filter((b) => b === 'outside_working_hours').length;
  const geplant = gueltigeAnzahl(anzahl);
  // Die Zeile, deren Datum oder Beginn gerade im Fenster geändert wird. Eine
  // entfernte Zeile schließt das Fenster von selbst.
  const offeneZeile = liste && bearbeitet !== null ? (liste[bearbeitet] ?? null) : null;

  return (
    <>
      {kopf}

      {/* Nur der Name; „alles oder nichts" sagt die Prüfmeldung dort, wo es
          zählt (UX-005g). */}
      {/* Eine Angabe, kein Satz: ohne Punkt wie überall (Design-Review T8). */}
      <PageHeader title="Dauertermin anlegen" description={`Für ${fullName(patientDaten)}`} />

      {patient.isError || kontingent.isError ? (
        <NachladeHinweis
          className="mb-6"
          laeuft={patient.isFetching || kontingent.isFetching}
          onErneut={() => {
            if (patient.isError) void patient.refetch();
            if (kontingent.isError) void kontingent.refetch();
          }}
        />
      ) : null}

      {/* Dieselben Wörter wie an der Grundlagenkarte der Akte (TER-09,
          ANN-064): „Mögliche Termine" statt „Verordnet" - beim Selbstzahler
          ist nichts verordnet -, „Noch planbar" statt „Offen". Als Kacheln,
          höchstens vier (DESIGN.md „Welcher Baustein wann“): am Telefon zwei
          nebeneinander statt fünf Zeilen untereinander. */}
      <Section titel="Termine der Grundlage">
        <TileGrid spalte="kachel">
          <Tile label="Mögliche Termine">
            {zahlen.prescribed}
            {/* „Genutzt" nur, wo tatsächlich etwas verbraucht ist (ANN-064). */}
            {zahlen.used > 0 ? ` · ${zahlen.used} genutzt` : ''}
          </Tile>
          {/* CAL-022: Was schon jetzt über die Grundlage hinausgeht, steht
              hier - sonst plant jemand weiter, ohne es zu wissen. */}
          <Tile
            label="Zugeordnet"
            ton={zahlen.uncovered > 0 ? 'warnung' : 'neutral'}
            zusatz={
              zahlen.uncovered > 0 ? (
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>
                    {`${zahlen.covered} von ${zahlen.planned} gedeckt · ${zahlen.uncovered} ohne Deckung`}
                  </span>
                  <Deckungszeichen gedeckt={false} />
                </span>
              ) : undefined
            }
          >
            {zahlen.planned === 0 ? 'Noch keiner' : zahlen.planned}
          </Tile>
          <Tile label="Noch planbar">
            {zahlen.remaining === 0
              ? 'Nichts mehr – jeder mögliche Termin ist genutzt oder verplant'
              : `${zahlen.remaining} ${zahlen.remaining === 1 ? 'Behandlung' : 'Behandlungen'}`}
          </Tile>
          {zahlen.frequency_note ? (
            <Tile label="Frequenz laut Grundlage">{zahlen.frequency_note}</Tile>
          ) : null}
        </TileGrid>
      </Section>

      {/* Erster Schritt: der Vorschlag aus Person, Ort und Rhythmus - als
          Formularvorlage in Gruppen (DESIGN.md „Formular“). */}
      <form onSubmit={vorschlagen} noValidate className="max-w-formular mt-8">
        {/* Sind alle Angaben berichtigt, verschwindet der Kasten (TER-06). */}
        <Fehlerzusammenfassung
          key={pruefungsstand.nummer}
          fehler={Object.values(fehler).some(Boolean) ? pruefungsstand.fehler : []}
        />

        <Section titel="Person und Ort">
          {/* Feldabstand wie in jedem anderen Formular (TOK-15). */}
          <Feldgruppe>
            <div className="flex flex-col gap-2">
              <Select
                label="Behandelnde Person *"
                feldId={serienfeldId('person')}
                value={staffMemberId}
                error={fehler.person}
                onChange={(e) => {
                  setStaffMemberId(e.target.value);
                  feldGeaendert('person');
                  listeSetzen(null);
                }}
              >
                <option value="">
                  {therapeuten.isPending ? 'Wird geladen …' : 'Bitte wählen …'}
                </option>
                {(therapeuten.data ?? []).map((t) => (
                  <option key={t.staff_member_id} value={t.staff_member_id}>
                    {t.display_name}
                  </option>
                ))}
              </Select>
              {therapeuten.isError ? (
                <Listenfehler
                  text="Die Personen konnten nicht geladen werden."
                  onErneut={() => void therapeuten.refetch()}
                />
              ) : null}
            </div>

            <Select
              label="Terminart *"
              value={art}
              onChange={(e) => setArt(e.target.value as AppointmentType)}
            >
              {(Object.keys(appointmentTypeLabels) as AppointmentType[]).map((typ) => (
                <option key={typ} value={typ}>
                  {appointmentTypeLabels[typ]}
                </option>
              ))}
            </Select>

            {art === 'practice' ? (
              <div className="flex flex-col gap-2">
                <Select
                  label="Standort *"
                  feldId={serienfeldId('standort')}
                  value={locationId}
                  error={fehler.standort}
                  onChange={(e) => {
                    setLocationId(e.target.value);
                    feldGeaendert('standort');
                  }}
                >
                  <option value="">
                    {standorte.isPending ? 'Wird geladen …' : 'Bitte wählen …'}
                  </option>
                  {(standorte.data ?? []).map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </Select>
                {standorte.isError ? (
                  <Listenfehler
                    text="Die Standorte konnten nicht geladen werden."
                    onErneut={() => void standorte.refetch()}
                  />
                ) : null}
              </div>
            ) : art === 'home_visit' ? (
              <UebernommeneAdresse
                street={patientDaten.street}
                houseNumber={patientDaten.house_number}
                postalCode={patientDaten.postal_code}
                city={patientDaten.city}
                // Der Abstecher in die Stammdaten und zurück auf diese Seite
                // (TER-15), wie in der Terminanlage.
                ergaenzenZiel={mitRueckweg(`${akte}/bearbeiten`, rueckkehrAdresse())}
              />
            ) : null}
          </Feldgruppe>
        </Section>

        <Section titel="Rhythmus">
          <Feldgruppe>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-end">
              <Field
                label="Erster Termin am *"
                type="date"
                feldId={serienfeldId('ersterTag')}
                value={ersterTag}
                error={fehler.ersterTag}
                min={heute || undefined}
                onChange={(e) => {
                  setErsterTag(e.target.value);
                  feldGeaendert('ersterTag');
                }}
              />
              <Field
                label="Beginn *"
                type="time"
                feldId={serienfeldId('beginn')}
                value={beginn}
                error={fehler.beginn}
                step={user.appointmentGridMinutes ? user.appointmentGridMinutes * 60 : undefined}
                // Ohne „Praxisraster: N Minuten" und ohne „Fenster: 60 Minuten":
                // Beides erklärte das System, nicht die Eingabe; der Fehler bei
                // einem Beginn außerhalb des Rasters bleibt (UX-005g, wie im
                // Terminformular).
                onChange={(e) => {
                  setBeginn(e.target.value);
                  feldGeaendert('beginn');
                }}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-end">
              <Select
                label="Rhythmus *"
                value={rhythmus}
                onChange={(e) => setRhythmus(e.target.value as Rhythmus)}
              >
                {(Object.keys(rhythmen) as Rhythmus[]).map((key) => (
                  <option key={key} value={key}>
                    {rhythmen[key].label}
                  </option>
                ))}
              </Select>
              <Field
                label="Anzahl Termine *"
                type="number"
                inputMode="numeric"
                feldId={serienfeldId('anzahl')}
                min={1}
                max={SERIE_HOECHSTZAHL}
                value={anzahl}
                error={fehler.anzahl}
                // Die Grenze ändert die Eingabe; der Satz zur Vorbelegung
                // erklärte nur, woher die Zahl kommt (DESIGN.md Regel 6).
                hint={`Höchstens ${SERIE_HOECHSTZAHL} je Vorgang.`}
                onChange={(e) => {
                  setAnzahl(e.target.value);
                  feldGeaendert('anzahl');
                }}
              />
            </div>

            {geplant !== null && geplant > zahlen.remaining ? (
              <Statusmeldung ton="warnung">
                Geplant {geplant === 1 ? 'ist' : 'sind'} {termineWort(geplant)}, noch planbar{' '}
                {zahlen.remaining === 1 ? 'ist' : 'sind'} {zahlen.remaining}. Das ist zulässig – die
                Grundlage deckt dann nicht alle Termine ab.
              </Statusmeldung>
            ) : null}
          </Feldgruppe>
        </Section>

        {/* Die Rückfrage vor dem Weggehen steht dort, wo gearbeitet wird
            (TER-05). */}
        {schutz}

        {/* Ein Hauptknopf je Ansicht (DESIGN.md Regel 4): Vor dem Vorschlag ist
            das Vorschlagen die Haupthandlung, danach das Anlegen. */}
        <Formularfuss>
          <Button
            type="submit"
            variant={liste ? 'secondary' : 'primary'}
            disabled={pruefung.isPending}
          >
            {pruefung.isPending ? 'Wird geprüft …' : 'Termine vorschlagen'}
          </Button>
          {/* „Abbrechen“ leise am Ende des Fusses (DESIGN.md „Formular“,
              Design-Review T8) - dorthin, wohin auch der Rückweg führt. Mit
              einer Liste steht es im Fuss darunter. */}
          {liste && liste.length > 0 ? null : (
            <ButtonLink to={abbrechenZiel} variant="quiet">
              Abbrechen
            </ButtonLink>
          )}
        </Formularfuss>
      </form>

      {liste ? (
        <div className="max-w-formular mt-8">
          {/* Zweiter Schritt: die Vorschläge als Zeilen (DESIGN.md Regel 3).
              Ein Tipp auf die Zeile öffnet Datum und Beginn dieses einen
              Termins; der Befund des Servers steht als Zeichen und Wort an der
              Zeile (Regel 5). */}
          <Section titel={`Vorgeschlagene Termine (${liste.length})`}>
            {pruefung.isError ? (
              <div className="mb-4">
                <ErrorState
                  title="Die Termine konnten nicht geprüft werden."
                  description="Bitte die Verbindung prüfen und die Liste mit „Erneut prüfen“ noch einmal prüfen lassen."
                />
              </div>
            ) : null}

            {liste.length === 0 ? (
              <EmptyState
                inKarte
                title="Es ist kein Termin mehr übrig."
                description="Bitte oben einen neuen Vorschlag erzeugen."
              />
            ) : (
              <ListRows>
                {liste.map((termin, index) => {
                  const befund = werte[index] ?? null;
                  return (
                    <ListRow
                      key={index}
                      zeit={termin.beginn || '–'}
                      titel={
                        <>
                          {/* Die Nummer für Vorlesesoftware und das Fenster
                              „Termin 2 ändern“; sichtbar trägt die Zeile das
                              Datum. */}
                          <span className="sr-only">Termin {index + 1}:</span>{' '}
                          {istIsoDatum(termin.datum) ? tagMitWochentag(termin.datum) : 'Ohne Datum'}
                        </>
                      }
                      // Kein „bis HH:MM Uhr" je Zeile: Das Ende folgt aus dem
                      // Fenster und ist für alle gleich (UX-005g).
                      meta={
                        befund ? (
                          <span className="mt-1 inline-flex">
                            <Badge ton={istHinderlich(befund) ? 'kritisch' : 'warnung'}>
                              {slotConflictLabels[befund]}
                            </Badge>
                          </span>
                        ) : undefined
                      }
                      onClick={() => setBearbeitet(index)}
                    />
                  );
                })}
              </ListRows>
            )}

            {/* Gebietstag der Adresse (PRX-002): warnt, sperrt nichts. */}
            {art === 'home_visit' && liste.length > 0 ? (
              <TerritoryHint postalCode={patientDaten.postal_code} slots={liste} />
            ) : null}

            {liste.length > 0 ? (
              <div className="mt-4">
                {!geprueft ? (
                  <Statusmeldung ton="warnung">
                    Die Liste wurde geändert und ist noch nicht geprüft.
                  </Statusmeldung>
                ) : hindernisse > 0 ? (
                  <Statusmeldung ton="fehler">
                    {hindernisse} von {liste.length} Terminen {hindernisse === 1 ? 'ist' : 'sind'}{' '}
                    so nicht planbar. Weil die Serie alles oder nichts ist, muss jeder davon erst
                    geändert oder entfernt werden.
                  </Statusmeldung>
                ) : randzeiten > 0 ? (
                  <Statusmeldung ton="warnung">
                    {termineWort(randzeiten)} {randzeiten === 1 ? 'liegt' : 'liegen'} außerhalb der
                    hinterlegten Arbeitszeit. Das Anlegen fragt dann noch einmal nach.
                  </Statusmeldung>
                ) : (
                  <Statusmeldung ton="erfolg">
                    {liste.length === 1
                      ? 'Der Termin ist planbar.'
                      : `Alle ${liste.length} Termine sind planbar.`}
                  </Statusmeldung>
                )}
              </div>
            ) : null}
          </Section>

          {/* Rückfrage und Fehler als Fenster (FIX-016). */}
          {istAusserhalbArbeitszeit(anlegen.error) ? (
            <ArbeitszeitRueckfrage
              onBestaetigen={() => absenden(true)}
              onAbbrechen={() => anlegen.reset()}
              laeuft={anlegen.isPending}
              beschriftung="Serie trotzdem anlegen"
            />
          ) : anlegen.isError ? (
            <Hinweisfenster titel={SPEICHERFEHLER_TITEL} onSchliessen={() => anlegen.reset()}>
              {speicherfehlerText(anlegen.error.message, SPEICHERFEHLER_TITEL)}
            </Hinweisfenster>
          ) : null}

          {liste.length > 0 ? (
            <Formularfuss>
              <Button
                type="button"
                onClick={() => absenden(false)}
                disabled={anlegen.isPending || !geprueft || hindernisse > 0}
              >
                {anlegen.isPending ? 'Wird angelegt …' : `${termineWort(liste.length)} anlegen`}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={pruefung.isPending}
                onClick={() => pruefen(liste)}
              >
                Erneut prüfen
              </Button>
              <ButtonLink to={abbrechenZiel} variant="quiet">
                Abbrechen
              </ButtonLink>
            </Formularfuss>
          ) : null}

          {offeneZeile && bearbeitet !== null ? (
            <Dialogfenster
              titel={`Termin ${bearbeitet + 1} ändern`}
              onSchliessen={() => setBearbeitet(null)}
            >
              {/* Jede Änderung gilt sofort für die Liste und verlangt eine neue
                  Prüfung - wie vorher an der Zeile selbst. */}
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                  label={`Datum ${bearbeitet + 1}`}
                  type="date"
                  value={offeneZeile.datum}
                  min={heute || undefined}
                  onChange={(e) => zeileSetzen(bearbeitet, 'datum', e.target.value)}
                />
                <Field
                  label={`Beginn ${bearbeitet + 1}`}
                  type="time"
                  step={user.appointmentGridMinutes ? user.appointmentGridMinutes * 60 : undefined}
                  value={offeneZeile.beginn}
                  onChange={(e) => zeileSetzen(bearbeitet, 'beginn', e.target.value)}
                />
              </div>
              <div className="mt-6 flex flex-col gap-3 *:w-full sm:flex-row sm:*:w-auto">
                <Button type="button" data-autofocus onClick={() => setBearbeitet(null)}>
                  Fertig
                </Button>
                <Button
                  type="button"
                  variant="quiet"
                  onClick={() => {
                    zeileEntfernen(bearbeitet);
                    setBearbeitet(null);
                  }}
                >
                  Aus der Serie entfernen
                </Button>
              </div>
            </Dialogfenster>
          ) : null}
        </div>
      ) : null}
      {/* Keine Fußnote zu Einzelterminen und organisatorischen Angaben mehr:
          Sie erklärte das System, nicht die Serie (UX-005g). */}
    </>
  );
}

/** Wochentag und Datum eines Kalendertags: „Mi, 12.05.2027“ (wie KAL-B03). */
function tagMitWochentag(tag: string): string {
  const wochentag = new Intl.DateTimeFormat('de-DE', { weekday: 'short', timeZone: 'UTC' }).format(
    new Date(`${tag}T00:00:00Z`),
  );
  return `${wochentag}, ${formatDate(tag)}`;
}
