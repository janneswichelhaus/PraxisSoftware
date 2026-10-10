import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Fehlerzusammenfassung } from '@/components/ui/Fehlerzusammenfassung';
import { Hinweisfenster } from '@/components/ui/Dialogfenster';
import { EINGABETEXTE, useTextverlustschutz } from '@/features/documentation/Textverlustschutz';
import type { Formularfehler } from '@/lib/formularfehler';
import {
  AppointmentFormFields,
  ArbeitszeitRueckfrage,
} from '@/features/appointments/AppointmentFormFields';
import {
  appointmentFormSchema,
  fensterEnde,
  fetchAssignableTrainers,
  fetchLocations,
  istAusserhalbArbeitszeit,
  istVergangenheit,
  liegtInVergangenheit,
  type AppointmentFormField,
  type AppointmentFormValues,
} from '@/features/appointments/api';
import {
  speicherfehlerText,
  terminFehlerliste,
  terminFeldfehler,
} from '@/features/appointments/terminformular';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';

/** Die Felder, an denen sich eine Eingabe von der Vorbelegung unterscheiden kann. */
const FELDER: readonly AppointmentFormField[] = [
  'staff_member_id',
  'appointment_type',
  'date',
  'start_time',
  'end_time',
  'location_id',
];

const TERMINTEXTE = { ...EINGABETEXTE, bezeichnung: 'Ungespeicherter Trainingstermin' };

export interface Bestaetigung {
  /** Außerhalb der Arbeitszeit, ausdrücklich bestätigt (CAL-005). */
  bestaetigt: boolean;
  /** Ein Tag vor dem heutigen, ausdrücklich bestätigt (FIX-019). */
  vergangenheit: boolean;
}

/**
 * Die Felder eines Trainingstermins - fürs Anlegen und fürs Verschieben
 * (TRN-004).
 *
 * Dieselben Felder, dieselbe Längenwahl und dieselben Rückfragen wie am
 * Behandlungstermin (`AppointmentFormFields`, ANN-056, CAL-005, FIX-019). Anders
 * ist nur die Personenauswahl: Zugeordnet wird, wer die Rolle
 * Trainingsbetreuung hat (ANN-176) - verbindlich prüft der Server.
 *
 * Beim Hausbesuch kommt die Anschrift aus dem Kontakt der Trainingskund:in,
 * nie aus einer Akte (ANN-177). Das Formular nennt sie nicht: Sie zu zeigen
 * hieße, die protokollierte Detailansicht ein zweites Mal zu öffnen.
 */
export function TrainingTerminFormular({
  startwerte,
  startMinuten,
  heute,
  rasterMinuten,
  vorFeldern,
  bereit = true,
  absendeText,
  laeuftText,
  fehlerTitel,
  abbrechenZiel,
  onSpeichern,
  onGespeichert,
}: {
  startwerte: Record<AppointmentFormField, string>;
  startMinuten: number;
  /** Der laufende Praxistag, für die Vorabfrage zur Vergangenheit. */
  heute: string;
  rasterMinuten: number | null;
  /** Felder davor - beim Anlegen Kund:in und Vereinbarung. */
  vorFeldern?: ReactNode;
  /** Ist alles gewählt, was vor den Feldern steht? Sonst kein Absenden. */
  bereit?: boolean;
  absendeText: string;
  laeuftText: string;
  fehlerTitel: string;
  abbrechenZiel: string;
  onSpeichern: (werte: AppointmentFormValues, bestaetigung: Bestaetigung) => Promise<string>;
  onGespeichert: (ergebnis: string) => void;
}) {
  const [werte, setWerte] = useState(startwerte);
  const [vorbelegt, setVorbelegt] = useState(startwerte);
  const [fehler, setFehler] = useState<Partial<Record<AppointmentFormField, string>>>({});
  const [pruefung, setPruefung] = useState<{ nummer: number; fehler: Formularfehler[] }>({
    nummer: 0,
    fehler: [],
  });
  const [fensterMinuten, setFensterMinuten] = useState(startMinuten);
  const [dauerGueltig, setDauerGueltig] = useState(true);
  const [vorfrage, setVorfrage] = useState<AppointmentFormValues | null>(null);

  const betreuung = useQuery({
    queryKey: ['assignable-trainers'],
    queryFn: fetchAssignableTrainers,
    retry: false,
  });
  const standorte = useQuery({ queryKey: ['locations'], queryFn: fetchLocations, retry: false });

  // Ein einziger Standort ist keine Entscheidung - er wird vorausgewählt.
  useEffect(() => {
    const nurEiner = standorte.data?.length === 1 ? standorte.data[0] : undefined;
    if (nurEiner) {
      const vorwaehlen = (bisher: Record<AppointmentFormField, string>) =>
        bisher.location_id === '' ? { ...bisher, location_id: nurEiner.id } : bisher;
      setWerte(vorwaehlen);
      setVorbelegt(vorwaehlen);
    }
  }, [standorte.data]);

  // Eine Person, die nicht zugeordnet werden kann, sähe gewählt aus, ohne es
  // zu sein - die Auswahl wird geleert. Gibt es genau eine, ist sie gewählt.
  useEffect(() => {
    const zuordenbar = betreuung.data;
    if (!zuordenbar) return;
    const vorbelegen = (bisher: Record<AppointmentFormField, string>) => {
      if (bisher.staff_member_id !== '') {
        return zuordenbar.some((t) => t.staff_member_id === bisher.staff_member_id)
          ? bisher
          : { ...bisher, staff_member_id: '' };
      }
      return zuordenbar.length === 1
        ? { ...bisher, staff_member_id: zuordenbar[0]!.staff_member_id }
        : bisher;
    };
    setWerte(vorbelegen);
    setVorbelegt(vorbelegen);
  }, [betreuung.data]);

  const geaendert =
    fensterMinuten !== startMinuten ||
    !dauerGueltig ||
    FELDER.some((feld) => werte[feld] !== vorbelegt[feld]);
  const { freigeben, schutz } = useTextverlustschutz({
    ungespeichert: geaendert,
    texte: TERMINTEXTE,
  });

  const mutation = useMutation({
    mutationFn: (eingabe: { werte: AppointmentFormValues } & Bestaetigung) =>
      onSpeichern(eingabe.werte, {
        bestaetigt: eingabe.bestaetigt,
        vergangenheit: eingabe.vergangenheit,
      }),
    onSuccess: (ergebnis) => {
      freigeben();
      onGespeichert(ergebnis);
    },
  });

  function setzen(feld: AppointmentFormField, wert: string) {
    setWerte((bisher) =>
      feld === 'start_time'
        ? {
            ...bisher,
            start_time: wert,
            end_time: dauerGueltig ? fensterEnde(wert, fensterMinuten) : '',
          }
        : { ...bisher, [feld]: wert },
    );
    if (fehler[feld]) setFehler((bisher) => ({ ...bisher, [feld]: undefined }));
    if (mutation.isError) mutation.reset();
  }

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
    if (betreuung.isError && !gefunden.staff_member_id) {
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

  return (
    <form onSubmit={absenden} noValidate className="max-w-xl">
      <Fehlerzusammenfassung
        key={pruefung.nummer}
        fehler={Object.values(fehler).some(Boolean) ? pruefung.fehler : []}
      />

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
          beschriftung={`${absendeText} – trotzdem`}
        />
      ) : istAusserhalbArbeitszeit(mutation.error) ? (
        <ArbeitszeitRueckfrage
          vergangenheit={mutation.variables?.vergangenheit ?? false}
          onBestaetigen={() => bestaetigen({ bestaetigt: true })}
          onAbbrechen={() => mutation.reset()}
          laeuft={mutation.isPending}
          beschriftung={`${absendeText} – trotzdem`}
        />
      ) : istVergangenheit(mutation.error) ? (
        <ArbeitszeitRueckfrage
          arbeitszeit={false}
          vergangenheit
          onBestaetigen={() => bestaetigen({ vergangenheit: true })}
          onAbbrechen={() => mutation.reset()}
          laeuft={mutation.isPending}
          beschriftung={`${absendeText} – trotzdem`}
        />
      ) : mutation.isError ? (
        <Hinweisfenster titel={fehlerTitel} onSchliessen={() => mutation.reset()}>
          {speicherfehlerText(mutation.error.message, fehlerTitel)}
        </Hinweisfenster>
      ) : null}

      {vorFeldern}

      <AppointmentFormFields
        werte={werte}
        fehler={fehler}
        onChange={setzen}
        therapeuten={betreuung.data ?? []}
        personBeschriftung="Betreuende Person *"
        personenListe={{
          laedt: betreuung.isPending,
          fehlgeschlagen: betreuung.isError,
          erneut: () => void betreuung.refetch(),
        }}
        standorte={standorte.data ?? []}
        standortListe={{
          laedt: standorte.isPending,
          fehlgeschlagen: standorte.isError,
          erneut: () => void standorte.refetch(),
        }}
        rasterMinuten={rasterMinuten ?? undefined}
        fensterMinuten={fensterMinuten}
        onFensterMinuten={(minuten) => {
          if (minuten !== null) setFensterMinuten(minuten);
          setDauerGueltig(minuten !== null);
          setWerte((bisher) => ({ ...bisher, end_time: fensterEnde(bisher.start_time, minuten) }));
          if (fehler.end_time) setFehler(({ end_time: _entfaellt, ...rest }) => rest);
          if (mutation.isError) mutation.reset();
        }}
        laengeHinweis="Die Dauer ist frei im Raster der Praxis."
        hausbesuch={
          <p className="text-ink-muted text-sm">
            Die Anschrift kommt aus dem Kontakt der Trainingskund:in – Straße mit Hausnummer, PLZ
            und Ort.
          </p>
        }
      />

      {schutz}

      <div className="mt-8 flex flex-wrap gap-3">
        <Button type="submit" disabled={mutation.isPending || !bereit}>
          {mutation.isPending ? laeuftText : absendeText}
        </Button>
        <ButtonLink to={abbrechenZiel} variant="secondary">
          Abbrechen
        </ButtonLink>
      </div>

      <Kleingedrucktes className="mt-10">
        Am Termin stehen nur organisatorische Angaben. Was in der Einheit passiert, gehört nicht
        hierher.
      </Kleingedrucktes>
    </form>
  );
}
