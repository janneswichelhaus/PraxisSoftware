import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Fehlerzusammenfassung } from '@/components/ui/Fehlerzusammenfassung';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { Hinweisfenster } from '@/components/ui/Dialogfenster';
import { EINGABETEXTE, useTextverlustschutz } from '@/app/Textverlustschutz';
import type { Formularfehler } from '@/lib/formularfehler';
import type { AppointmentType } from '@/lib/termin';
import { AppointmentFormFields, ArbeitszeitRueckfrage } from './AppointmentFormFields';
import {
  appointmentFormSchema,
  fensterEnde,
  istAusserhalbArbeitszeit,
  istVergangenheit,
  liegtInVergangenheit,
  type AppointmentFormField,
  type AppointmentFormValues,
} from './api';
import { speicherfehlerText, terminFehlerliste, terminFeldfehler } from './terminformular';
import { ASSIGNEE_LABELS, type AppointmentFormLists } from './useAppointmentFormLists';
import { Wegauskunft } from './Wegauskunft';
import { frageAusFormular, useWegpruefung } from './wegpruefung';

type Werte = Record<AppointmentFormField, string>;

/** Was der Server erst nach ausdrücklicher Bestätigung annimmt. */
export interface Bestaetigung {
  /** Außerhalb der Arbeitszeit. */
  bestaetigt: boolean;
  /** Ein Tag vor dem heutigen. */
  vergangenheit: boolean;
}

/** Der Stand des Formulars für den Abschnitt zum Hausbesuch, den die Seite einsetzt. */
export interface AppointmentFormState {
  werte: Werte;
  fensterMinuten: number;
  dauerGueltig: boolean;
  /** Gibt den nächsten Seitenwechsel frei, etwa einen Abstecher, der alle Eingaben mitnimmt. */
  freigeben: () => void;
}

export interface AppointmentFormTexts {
  absenden: string;
  laeuft: string;
  /** Knopf der Rückfragen; ohne Angabe „<absenden> – trotzdem“. */
  trotzdem?: string;
  fehlerTitel: string;
  /** Der Satz, den die Schnittstelle ohne Grund liefert; ohne Angabe der Titel. */
  standardfehler?: string;
  /** Wie der Schutz vor Verlust das Ungespeicherte nennt. */
  ungespeichert: string;
}

/** Wessen Anschrift „Passt es?“ prüft und welcher bestehende Termin dabei außen vor bleibt. */
export type Wegkontext = Parameters<typeof frageAusFormular>[1] & { zeitzone: string };

const FELDER: readonly AppointmentFormField[] = [
  'staff_member_id',
  'appointment_type',
  'date',
  'start_time',
  'end_time',
  'location_id',
];

/**
 * Das Formular eines Termins mit Person: Behandlung, Training, Beratung, Teilnahme an einer
 * Fehlzeit. Die Prüfung hier ist Bedienkomfort; verbindlich prüft die Serverfunktion (ADR-004).
 */
export function AppointmentForm({
  listen,
  startwerte,
  startMinuten,
  heute,
  rasterMinuten,
  texte,
  abbrechenZiel,
  onSpeichern,
  onGespeichert,
  vorbelegen = true,
  bestehenderTag,
  nurPerson = false,
  arten,
  dauerFest,
  bereit = true,
  vorFeldern,
  hausbesuch,
  weg,
}: {
  listen: AppointmentFormLists;
  startwerte: Werte;
  startMinuten: number;
  /** Der laufende Praxistag, für die Frage vor einem Tag in der Vergangenheit. */
  heute: string;
  rasterMinuten: number | null;
  texte: AppointmentFormTexts;
  abbrechenZiel: string;
  onSpeichern: (werte: AppointmentFormValues, bestaetigung: Bestaetigung) => Promise<string>;
  onGespeichert: (ergebnis: string) => void | Promise<void>;
  /** Einzigen Standort und einzige Person vorwählen, eine nicht zuordenbare Person leeren. */
  vorbelegen?: boolean;
  /** Der gespeicherte Tag: Bleibt er, wird nicht gefragt, sondern die Vergangenheit bestätigt. */
  bestehenderTag?: string | undefined;
  /** Nur die Person ist änderbar; Zeit, Art und Ort gelten für alle Beteiligten (ANN-051). */
  nurPerson?: boolean;
  arten?: readonly AppointmentType[] | undefined;
  /** Die Dauer ist nicht wählbar; dieser Satz steht an ihrer Stelle. */
  dauerFest?: string | undefined;
  /** Ist alles gewählt, was vor den Feldern steht? Sonst wird nicht abgeschickt. */
  bereit?: boolean;
  vorFeldern?: ReactNode;
  hausbesuch: ReactNode | ((stand: AppointmentFormState) => ReactNode);
  /** Ohne Angabe keine Auskunft zu An- und Weiterfahrt. */
  weg?: Wegkontext | undefined;
}) {
  const { personen, standorte } = listen;
  const personBeschriftung = ASSIGNEE_LABELS[listen.group];
  const [werte, setWerte] = useState(startwerte);
  // Was ohne Zutun im Formular steht; erst eine Abweichung davon ist eine Eingabe.
  const [vorbelegt, setVorbelegt] = useState(startwerte);
  const [fehler, setFehler] = useState<Partial<Record<AppointmentFormField, string>>>({});
  // Eigener Stand statt der Feldfehler: Die Nummer holt den Fokus nur beim Absenden zurück.
  const [pruefung, setPruefung] = useState<{ nummer: number; fehler: Formularfehler[] }>({
    nummer: 0,
    fehler: [],
  });
  const [fensterMinuten, setFensterMinuten] = useState(startMinuten);
  const [dauerGueltig, setDauerGueltig] = useState(true);
  const [vorfrage, setVorfrage] = useState<AppointmentFormValues | null>(null);

  // Eine Auswahl ohne Alternative ist keine Entscheidung.
  useEffect(() => {
    const nurEiner = standorte.data?.length === 1 ? standorte.data[0] : undefined;
    if (!vorbelegen || !nurEiner) return;
    const vorwaehlen = (bisher: Werte) =>
      bisher.location_id === '' ? { ...bisher, location_id: nurEiner.id } : bisher;
    setWerte(vorwaehlen);
    setVorbelegt(vorwaehlen);
  }, [standorte.data, vorbelegen]);

  // Ein Wert ohne passende Option sähe gewählt aus, ohne es zu sein; die einzige Person ist gewählt.
  useEffect(() => {
    const zuordenbar = personen.data;
    if (!vorbelegen || !zuordenbar) return;
    const zuordnen = (bisher: Werte) => {
      if (bisher.staff_member_id !== '') {
        return zuordenbar.some((p) => p.staff_member_id === bisher.staff_member_id)
          ? bisher
          : { ...bisher, staff_member_id: '' };
      }
      return zuordenbar.length === 1
        ? { ...bisher, staff_member_id: zuordenbar[0]!.staff_member_id }
        : bisher;
    };
    setWerte(zuordnen);
    setVorbelegt(zuordnen);
  }, [personen.data, vorbelegen]);

  const geaendert =
    fensterMinuten !== startMinuten ||
    !dauerGueltig ||
    FELDER.some((feld) => werte[feld] !== vorbelegt[feld]);
  // Ohne Entwurf: Die Rückfrage bietet nur Verwerfen und Bleiben an (ANN-046).
  const { freigeben, schutz } = useTextverlustschutz({
    ungespeichert: geaendert,
    texte: { ...EINGABETEXTE, bezeichnung: texte.ungespeichert },
  });

  const mutation = useMutation({
    mutationFn: (eingabe: { werte: AppointmentFormValues } & Bestaetigung) =>
      onSpeichern(eingabe.werte, {
        bestaetigt: eingabe.bestaetigt,
        vergangenheit: eingabe.vergangenheit,
      }),
    onSuccess: async (ergebnis) => {
      // Gespeichert ist gespeichert: Der eigene Weg danach ist kein Verlust.
      freigeben();
      await onGespeichert(ergebnis);
    },
  });

  const wegfrage = useMemo(() => (weg ? frageAusFormular(werte, weg) : null), [werte, weg]);
  const wegpruefung = useWegpruefung(wegfrage);

  function setzen(feld: AppointmentFormField, wert: string) {
    setWerte((bisher) =>
      feld === 'start_time'
        ? // Ein leeres Minutenfeld ergibt kein Ende, auch nicht über einen neuen Beginn.
          {
            ...bisher,
            start_time: wert,
            end_time: dauerGueltig ? fensterEnde(wert, fensterMinuten) : '',
          }
        : { ...bisher, [feld]: wert },
    );
    if (fehler[feld]) setFehler((bisher) => ({ ...bisher, [feld]: undefined }));
    // Die Rückfrage galt genau dem abgewiesenen Stand.
    if (mutation.isError) mutation.reset();
  }

  function laengeWechseln(minuten: number | null) {
    if (minuten !== null) setFensterMinuten(minuten);
    setDauerGueltig(minuten !== null);
    setWerte((bisher) => ({ ...bisher, end_time: fensterEnde(bisher.start_time, minuten) }));
    if (fehler.end_time) setFehler(({ end_time: _entfaellt, ...rest }) => rest);
    if (mutation.isError) mutation.reset();
  }

  /** Wiederholt den Vorgang; was schon bestätigt war, bleibt bestätigt. */
  function bestaetigen(zusatz: Partial<Bestaetigung>) {
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
    if (mutation.isPending || !bereit) return;

    const ergebnis = appointmentFormSchema.safeParse(werte);
    const gefunden: Partial<Record<AppointmentFormField, string>> = ergebnis.success
      ? {}
      : terminFeldfehler(ergebnis.error.issues, werte, dauerGueltig);
    // Das Schema kennt nur die behandelnde Person; die Meldung nennt die Person dieses Formulars.
    if (gefunden.staff_member_id) {
      gefunden.staff_member_id = `${personBeschriftung} ist erforderlich.`;
    }
    // Eine gescheiterte Liste sperrt: Die Auswahl sähe sonst getroffen oder leer aus, ohne es zu sein.
    if (personen.isError && !gefunden.staff_member_id) {
      gefunden.staff_member_id = 'Bitte zuerst die Liste der Personen erneut laden.';
    }
    if (
      !nurPerson &&
      werte.appointment_type === 'practice' &&
      standorte.isError &&
      !gefunden.location_id
    ) {
      gefunden.location_id = 'Bitte zuerst die Liste der Standorte erneut laden.';
    }
    if (!ergebnis.success || Object.keys(gefunden).length > 0) {
      setFehler(gefunden);
      setPruefung((bisher) => ({
        nummer: bisher.nummer + 1,
        fehler: terminFehlerliste(gefunden, personBeschriftung),
      }));
      return;
    }

    setFehler({});
    setPruefung((bisher) => ({ ...bisher, fehler: [] }));
    const { date } = ergebnis.data;
    // Erst fragen, dann schreiben; der gespeicherte Tag selbst ist kein Zurücklegen.
    if (heute && liegtInVergangenheit(date, heute) && date !== bestehenderTag) {
      setVorfrage(ergebnis.data);
      return;
    }
    mutation.mutate({
      werte: ergebnis.data,
      bestaetigt: false,
      vergangenheit: date === bestehenderTag && liegtInVergangenheit(date, heute),
    });
  }

  const stand: AppointmentFormState = { werte, fensterMinuten, dauerGueltig, freigeben };
  const trotzdem = texte.trotzdem ?? `${texte.absenden} – trotzdem`;

  return (
    <form onSubmit={absenden} noValidate className="max-w-formular">
      {/* Sind alle Angaben berichtigt, verschwindet der Kasten. */}
      <Fehlerzusammenfassung
        key={pruefung.nummer}
        fehler={Object.values(fehler).some(Boolean) ? pruefung.fehler : []}
      />

      {/* Rückfrage und Fehler als Fenster: Wer am Seitenende abschickt, sieht sie sofort. */}
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
          beschriftung={trotzdem}
        />
      ) : istAusserhalbArbeitszeit(mutation.error) ? (
        <ArbeitszeitRueckfrage
          vergangenheit={mutation.variables?.vergangenheit ?? false}
          onBestaetigen={() => bestaetigen({ bestaetigt: true })}
          onAbbrechen={() => mutation.reset()}
          laeuft={mutation.isPending}
          beschriftung={trotzdem}
        />
      ) : istVergangenheit(mutation.error) ? (
        <ArbeitszeitRueckfrage
          arbeitszeit={false}
          vergangenheit
          onBestaetigen={() => bestaetigen({ vergangenheit: true })}
          onAbbrechen={() => mutation.reset()}
          laeuft={mutation.isPending}
          beschriftung={trotzdem}
        />
      ) : mutation.isError ? (
        <Hinweisfenster titel={texte.fehlerTitel} onSchliessen={() => mutation.reset()}>
          {speicherfehlerText(mutation.error.message, texte.standardfehler ?? texte.fehlerTitel)}
        </Hinweisfenster>
      ) : null}

      {vorFeldern}

      <AppointmentFormFields
        werte={werte}
        fehler={fehler}
        onChange={setzen}
        therapeuten={personen.data ?? []}
        personBeschriftung={`${personBeschriftung} *`}
        personenListe={{
          laedt: personen.isPending,
          fehlgeschlagen: personen.isError,
          erneut: () => void personen.refetch(),
        }}
        nurPerson={nurPerson}
        standorte={standorte.data ?? []}
        standortListe={{
          laedt: standorte.isPending,
          fehlgeschlagen: standorte.isError,
          erneut: () => void standorte.refetch(),
        }}
        arten={arten}
        rasterMinuten={rasterMinuten ?? undefined}
        fensterMinuten={fensterMinuten}
        onFensterMinuten={dauerFest === undefined ? laengeWechseln : undefined}
        laengeHinweis={dauerFest}
        hausbesuch={typeof hausbesuch === 'function' ? hausbesuch(stand) : hausbesuch}
      />

      {/* An- und Weiterfahrt, nur Auskunft - mit dem Angebot, auf die früheste passende Zeit zu gehen. */}
      {weg ? (
        <Wegauskunft
          pruefung={wegpruefung}
          zeitzone={weg.zeitzone}
          verschieben={
            wegfrage
              ? {
                  frage: wegfrage,
                  rasterMinuten,
                  onBeginn: (beginn) => setzen('start_time', beginn),
                }
              : undefined
          }
        />
      ) : null}

      {/* Die Rückfrage vor dem Weggehen steht dort, wo gearbeitet wird. */}
      {schutz}

      {/* Am Telefon untereinander in voller Breite, der Hauptknopf zuerst; Abbrechen ist ein Link. */}
      <Formularfuss>
        <Button type="submit" disabled={mutation.isPending || !bereit}>
          {mutation.isPending ? texte.laeuft : texte.absenden}
        </Button>
        <ButtonLink to={abbrechenZiel} variant="quiet">
          Abbrechen
        </ButtonLink>
      </Formularfuss>
    </form>
  );
}

/** Beim Hausbesuch ohne Akte im Formular: woher die Anschrift kommt. */
export function HomeVisitAddressHint({ source }: { source: 'record' | 'contact' }) {
  return (
    <p className="text-ink-muted text-sm">
      {source === 'record'
        ? 'Die Anschrift kommt aus der Akte – Straße mit Hausnummer, PLZ und Ort.'
        : 'Die Anschrift kommt aus dem Kontakt der Trainingskund:in – Straße mit Hausnummer, PLZ und Ort.'}
    </p>
  );
}
