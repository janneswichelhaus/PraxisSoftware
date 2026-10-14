import { useEffect, useId, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Textlink } from '@/components/ui/Textlink';
import { kartenAktionKlassen } from '@/components/ui/buttonStile';
import { fetchDayPlan, rufnummern } from '@/features/today/api';
import {
  dayKey,
  fetchAppointment,
  formatLocalDate,
  formatLocalTime,
  patientName,
  recordNoShow,
  type Appointment,
} from './api';

/**
 * Was der Ablauf vom Termin braucht. Die Übersicht kennt den Bearbeitungsstand
 * (`updated_at`) nicht - dann liest der Ablauf ihn unmittelbar vor dem
 * Vermerk, wie der Haken (`TerminAbschliessen`).
 */
export type NiemandOeffnetTermin = Pick<
  Appointment,
  'id' | 'patient_id' | 'staff_member_id' | 'starts_at' | 'organization_time_zone'
> & { updated_at?: string };

/**
 * Das Feld unter dem Knopf: in einer Karte durch eine Linie abgesetzt statt
 * als zweiter Kasten (DESIGN.md Regel 2), sonst ein Kasten wie die
 * Rückfrage - über die ganze Breite unter der Knopfreihe.
 */
function feldKlassen(inKarte: boolean): string {
  return inKarte
    ? 'border-line order-last w-full border-t pt-3'
    : 'border-line-strong bg-surface-sunken rounded-card order-last w-full border p-4';
}

/** Ein Knopf im Feld, der in der schmalen Spalte umbrechen darf; in der Karte linksbündig. */
function umbrechenKlassen(inKarte: boolean): string {
  return inKarte ? 'h-auto min-h-12 py-2 text-left' : 'h-auto min-h-12 py-2';
}

/** Wie lange vor Ort gewartet wird (ADR-018 Punkt 9, Schritt 2). */
const WARTEZEIT_MS = 15 * 60 * 1000;

function minutenSekunden(ms: number): string {
  const sekunden = Math.floor(ms / 1000);
  return `${Math.floor(sekunden / 60)}:${String(sekunden % 60).padStart(2, '0')}`;
}

/**
 * Die sichtbare 15-Minuten-Uhr an der Tür (Auftrag C1, Analyse „Alltag
 * unterwegs“ Rang 9). Sie läuft ab dem Tipp auf „Niemand öffnet?“ und sagt
 * nach Ablauf „bitte bestätigen“ (ANN-479). Angehakt wird von Hand: Die Uhr
 * startet erst mit dem Tipp, nicht bei der Ankunft, und aus dem Haken
 * entsteht eine Forderung gegen die Patientin (ADR-018 Punkt 9,
 * Zweitreview).
 */
function Wartezeit({ seit }: { seit: number }) {
  const [jetzt, setJetzt] = useState(() => Date.now());
  useEffect(() => {
    const takt = window.setInterval(() => setJetzt(Date.now()), 1000);
    return () => window.clearInterval(takt);
  }, []);
  const vergangen = Math.min(WARTEZEIT_MS, Math.max(0, jetzt - seit));
  const abgelaufen = vergangen >= WARTEZEIT_MS;
  return (
    <div className="mb-2 ml-8">
      <p role="timer" className="text-ink text-sm font-semibold tabular-nums">
        {abgelaufen
          ? '15 Minuten um – bitte bestätigen'
          : `Gewartet ${minutenSekunden(vergangen)} von 15:00`}
      </p>
      <ProgressBar wert={vergangen} von={WARTEZEIT_MS} />
    </div>
  );
}

/**
 * Das Protokoll aus Hausbesuch-Szenario 2 (CAL-018, ADR-018 Fassung 3
 * Punkt 9), in der Reihenfolge, in der es vor der Tür abläuft: klingeln,
 * warten, anrufen. Drei Schritte, die nur gemeinsam gelten - und die
 * deshalb einzeln bestätigt werden, denn aus ihnen entsteht eine Forderung
 * gegen eine Patientin.
 */
const PROTOKOLLSCHRITTE = [
  { id: 'geklingelt', label: 'An der Tür geklingelt' },
  { id: 'gewartet', label: '15 Minuten vor Ort gewartet' },
  { id: 'angerufen', label: 'Telefonisch angerufen' },
] as const;

/**
 * Die Rufnummern der Patient:in für den dritten Schritt (UX-005b).
 *
 * Der Termin selbst trägt keine Rufnummer - die Sicht ist organisatorisch
 * knapp gehalten. Die Tagesliste (`list_day_plan`, UX-001) hat sie, und zwar
 * genau für diesen Zweck: den Besuch, der an der Tür zu scheitern droht.
 * Gelesen wird sie erst, wenn der Ablauf offen ist, und unter demselben
 * Schlüssel wie in der Übersicht - wer von dort kommt, wartet nicht.
 */
function Rufnummern({ appointment }: { appointment: NiemandOeffnetTermin }) {
  const tag = dayKey(appointment.starts_at, appointment.organization_time_zone);
  const { data, isPending, isError } = useQuery({
    queryKey: ['day-plan', tag, appointment.staff_member_id],
    queryFn: () => fetchDayPlan(tag, appointment.staff_member_id),
    retry: false,
  });

  if (isPending) {
    return <span className="text-ink-muted text-sm">Rufnummer wird geladen …</span>;
  }
  const eintrag = data?.find((termin) => termin.id === appointment.id);
  const nummern = eintrag ? rufnummern(eintrag) : [];
  if (isError || nummern.length === 0) {
    return (
      <span className="text-ink-muted text-sm">
        {isError ? 'Die Rufnummer konnte nicht geladen werden. ' : 'Keine Rufnummer hinterlegt. '}
        {appointment.patient_id ? (
          <Textlink to={`/patienten/${appointment.patient_id}/stammdaten`}>
            Zu den Stammdaten
          </Textlink>
        ) : null}
      </span>
    );
  }
  return (
    <span className="flex flex-wrap gap-2">
      {nummern.map((nummer) => (
        <a key={nummer.label} href={nummer.href} className={kartenAktionKlassen()}>
          <span className="text-ink-muted">{nummer.label}</span>
          <span className="tabular-nums">{nummer.anzeige}</span>
        </a>
      ))}
    </span>
  );
}

/**
 * „Niemand öffnet?" - der geführte Ablauf am Hausbesuch (UX-005b, CAL-018).
 *
 * ADR-018 Fassung 3 Punkt 9 verlangt, dass die Oberfläche **erklärend** durch
 * die Szenarien führt: welcher Fall vorliegt, was daraus folgt, welche Angabe
 * fehlt. Bis UX-005b stand dafür ein Kasten mit vier Fällen samt Erklärung
 * offen auf jeder Hausbesuchsseite - auch dann, wenn die Tür wie fast immer
 * aufging. Jannes: „Der gesamte Block kann erstmal minimiert werden. Ein
 * Button könnte genügen. Dahinter ein Flussdiagramm, das durch die Schritte
 * führt."
 *
 * Genau das: Der Regelfall ist der Hauptknopf „Dokumentieren und abschließen"
 * daneben. Dieser Knopf öffnet den Ablauf für den Fall, dass niemand
 * aufmacht - drei Schritte in ihrer Reihenfolge, die Rufnummer beim dritten,
 * dann der Vermerk mit seiner Folge. Darunter die beiden anderen Fälle mit je
 * einem Satz: die geöffnete Tür ohne Behandlung und die Absage vorher.
 *
 * Der Vermerk verlangt alle drei Schritte (Pflichtangabe nach ADR-018 Punkt
 * 9); ohne sie schreibt die Seite nichts und sagt, was fehlt. Eine weitere
 * Rückfrage gibt es nicht mehr: Die drei Haken sind die Bestätigung, und ein
 * Irrtum lässt sich über „Termin wieder öffnen" zurücknehmen. Verbindlich
 * prüft der Server (`record_no_show`, ADR-004).
 */
export function HomeVisitFlow({
  appointment,
  melden,
  mitUhr = false,
  wege,
  inKarte = false,
  ausloeser = 'Niemand öffnet?',
  ausloeserVariante = 'secondary',
}: {
  appointment: NiemandOeffnetTermin;
  melden: (text: string) => void;
  /**
   * Der Name des Einstiegs - in der Übersicht „Ausfall“ an Zeile und Karte
   * (B12), im Terminfenster „Niemand öffnet?“.
   */
  ausloeser?: string;
  /** An der Zeile der Übersicht leise, an Karte und Terminfenster mit Rahmen. */
  ausloeserVariante?: 'secondary' | 'quiet';
  /** Die 15-Minuten-Uhr an Schritt 2 - an der Karte der Übersicht (Auftrag C1). */
  mitUhr?: boolean;
  /**
   * Die beiden anderen Fälle als Wege, wo die Seite sie nicht selbst trägt
   * (die Übersicht): ohne Angabe verweisen die Sätze auf die Knöpfe des
   * Terminfensters („oben“, „am Seitenende“).
   */
  wege?: { ohneBehandlung: string; absagen: string };
  /**
   * In einer Karte (die Tageskarte der Übersicht): durch eine Linie
   * abgesetzt statt als zweiter Kasten (DESIGN.md Regel 2).
   */
  inKarte?: boolean;
}) {
  const queryClient = useQueryClient();
  const [offen, setOffen] = useState(false);
  const [seit, setSeit] = useState<number | null>(null);
  const [schritte, setSchritte] = useState<Record<string, boolean>>({});
  const [fehler, setFehler] = useState<string | undefined>(undefined);
  const bereichId = useId();

  const vermerken = useMutation({
    mutationFn: async () => {
      if (appointment.updated_at) {
        await recordNoShow(appointment.id, appointment.updated_at, true);
        return;
      }
      const termin = await fetchAppointment(appointment.id);
      if (!termin) throw new Error('Der Termin wurde nicht gefunden.');
      await recordNoShow(termin.id, termin.updated_at, true);
    },
    onSuccess: () => {
      for (const queryKey of [['appointment', appointment.id], ['appointments'], ['day-plan']]) {
        void queryClient.invalidateQueries({ queryKey });
      }
      melden('Als „nicht angetroffen“ vermerkt – das Ausfallhonorar ist vorgemerkt.');
    },
  });

  function absenden() {
    if (!PROTOKOLLSCHRITTE.every((schritt) => schritte[schritt.id])) {
      setFehler('Bitte alle drei Schritte des Protokolls bestätigen.');
      return;
    }
    setFehler(undefined);
    if (vermerken.isPending) return;
    vermerken.mutate();
  }

  return (
    <>
      <Button
        type="button"
        variant={ausloeserVariante}
        groesse="kompakt"
        aria-expanded={offen}
        aria-controls={bereichId}
        onClick={() => {
          setOffen((bisher) => !bisher);
          setSeit((bisher) => bisher ?? Date.now());
        }}
      >
        {ausloeser}
      </Button>

      {offen ? (
        <section
          id={bereichId}
          aria-label={ausloeser}
          // Ein Kasten wie die Rückfrage: eine Karte, keine Schaltfläche
          // (DS-001), über die ganze Breite unter der Knopfreihe; 16 innen
          // wie die Rückfrage seit dem Design-Handoff vom 2026-10-01.
          className={feldKlassen(inKarte)}
        >
          <p className="text-ink text-sm">
            Drei Schritte, jeder bestätigt. Danach gilt der Termin als „nicht angetroffen“ und löst
            ein Ausfallhonorar aus.
          </p>

          {/* Die Schritte als Reihe: Nummer, Schritt, Haken. Die Nummer ist
              Bild, die Reihenfolge steht in der Liste selbst. */}
          <ol className="mt-3 flex flex-col gap-1">
            {PROTOKOLLSCHRITTE.map((schritt, index) => (
              <li key={schritt.id} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="bg-accent text-surface rounded-pill mt-2.5 inline-flex size-6 shrink-0 items-center justify-center text-xs font-bold"
                >
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <Checkbox
                    label={schritt.label}
                    checked={schritte[schritt.id] ?? false}
                    onChange={(e) => {
                      setSchritte((bisher) => ({ ...bisher, [schritt.id]: e.target.checked }));
                      setFehler(undefined);
                    }}
                  />
                  {schritt.id === 'gewartet' && mitUhr && seit !== null ? (
                    <Wartezeit seit={seit} />
                  ) : null}
                  {schritt.id === 'angerufen' ? (
                    <div className="mb-2 ml-8">
                      <Rufnummern appointment={appointment} />
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>

          {fehler ? (
            <Statusmeldung ton="fehler" className="mt-2">
              {fehler}
            </Statusmeldung>
          ) : vermerken.isError ? (
            <Statusmeldung ton="fehler" className="mt-2">
              {vermerken.error.message}
            </Statusmeldung>
          ) : null}

          {/* Ohne den Satz „Keine Behandlung … Wird unter Abrechnung →
              Leistungen erfasst.": gestrichen im Design-Handoff vom 2026-10-01
              (Abschnitt 1). Die Folge steht schon im Satz über den Schritten. */}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {/* Der Knopf darf in der schmalen Spalte umbrechen - in der Karte
                wie an einer Zeile der Übersicht (B12); breit bleibt er 48 px. */}
            <Button
              type="button"
              disabled={vermerken.isPending}
              onClick={absenden}
              className={umbrechenKlassen(inKarte)}
            >
              {vermerken.isPending ? 'Wird vermerkt …' : 'Als „nicht angetroffen“ vermerken'}
            </Button>
          </div>

          {/* Die beiden anderen Fälle, je mit ihrer Folge (ADR-018 Punkt 9):
              Wer hier steht, hat die Tür vor sich - die Frage ist nur, was
              dahinter passiert ist. */}
          <div className="border-line mt-4 border-t pt-3">
            {/* Der Weg selbst steht seit Zyklus 3 als „Ohne Behandlung" in der
                Aktionsleiste (Design-Handoff 2026-10-01, Abschnitt 6); hier
                bleibt der Fall genannt, damit der Ablauf durch alle drei
                Szenarien führt (ADR-018 Punkt 9). */}
            {wege ? (
              <p className="text-ink-muted max-w-prose text-sm">
                Tür geöffnet, aber keine Behandlung?{' '}
                <Textlink to={wege.ohneBehandlung}>Ohne Behandlung festhalten</Textlink> – der
                Termin gilt als durchgeführt, ohne Ausfallhonorar.
              </p>
            ) : (
              <p className="text-ink-muted max-w-prose text-sm">
                Tür geöffnet, aber keine Behandlung? Dann oben „Ohne Behandlung“ – der Termin gilt
                als durchgeführt, ohne Ausfallhonorar.
              </p>
            )}
            {/* Der dritte Fall bleibt als eine Zeile (ANN-198): Der Handoff
                strich den Satz, ADR-018 Punkt 9.3 verlangt aber, dass die
                Oberfläche durch alle drei Szenarien führt. Die 24-Stunden-Regel
                erklärt die Absage-Rückfrage selbst. */}
            {wege ? (
              <p className="text-ink-muted mt-1 max-w-prose text-sm">
                Vorher abgesagt? Dann am Termin{' '}
                <Textlink to={wege.absagen}>„Termin absagen“</Textlink>.
              </p>
            ) : (
              <p className="text-ink-muted mt-1 max-w-prose text-sm">
                Vorher abgesagt? Dann am Seitenende „Termin absagen“.
              </p>
            )}
          </div>
        </section>
      ) : null}
    </>
  );
}

/**
 * „Nicht angetroffen“ am Praxis- und am Videotermin aus der Übersicht (B12):
 * dieselbe Bestätigung ohne Gebühr wie im Terminfenster
 * (`NichtAngetroffenAktion`, CAL-014c, ANN-055) - an der Praxistür gibt es
 * nichts zu klingeln, und für das Nichtantreffen dort gibt es keine
 * Gebührenregel. Gebaut wie der Ablauf am Hausbesuch: Der Knopf bleibt, das
 * Feld steht darunter über die ganze Breite, damit Zeile und Karte beide
 * Fälle gleich tragen. Der Fokus springt beim Öffnen auf „Ja“ und beim
 * Abbrechen zurück wie bei der Rückfrage.
 *
 * Den Bearbeitungsstand liest sie, wo die Übersicht ihn nicht kennt,
 * unmittelbar vor dem Vermerk. Verbindlich prüft der Server
 * (`record_no_show`, ADR-004).
 */
export function NichtAngetroffenOhneGebuehr({
  appointment,
  melden,
  ausloeser = 'Nicht angetroffen',
  ausloeserVariante = 'secondary',
  inKarte = false,
}: {
  appointment: NiemandOeffnetTermin &
    Pick<Appointment, 'patient_given_name' | 'patient_family_name'>;
  melden: (text: string) => void;
  ausloeser?: string;
  ausloeserVariante?: 'secondary' | 'quiet';
  inKarte?: boolean;
}) {
  const queryClient = useQueryClient();
  const [offen, setOffen] = useState(false);
  const bereichId = useId();
  const ausloeserRef = useRef<HTMLButtonElement>(null);
  const bestaetigenRef = useRef<HTMLButtonElement>(null);
  const zone = appointment.organization_time_zone;

  const vermerken = useMutation({
    mutationFn: async () => {
      const stand = appointment.updated_at ?? (await fetchAppointment(appointment.id))?.updated_at;
      if (!stand) throw new Error('Der Termin wurde nicht gefunden.');
      await recordNoShow(appointment.id, stand, false);
    },
    onSuccess: () => {
      for (const queryKey of [['appointment', appointment.id], ['appointments'], ['day-plan']]) {
        void queryClient.invalidateQueries({ queryKey });
      }
      setOffen(false);
      melden('Als „nicht angetroffen“ vermerkt.');
    },
  });

  useEffect(() => {
    if (offen) bestaetigenRef.current?.focus();
  }, [offen]);

  return (
    <>
      <Button
        ref={ausloeserRef}
        type="button"
        variant={ausloeserVariante}
        groesse="kompakt"
        aria-expanded={offen}
        aria-controls={offen ? bereichId : undefined}
        onClick={() => {
          vermerken.reset();
          setOffen((bisher) => !bisher);
        }}
      >
        {ausloeser}
      </Button>

      {offen ? (
        <section id={bereichId} aria-label={ausloeser} className={feldKlassen(inKarte)}>
          <p className="text-ink max-w-prose text-sm">
            Der Termin am {formatLocalDate(appointment.starts_at, zone)} um{' '}
            {formatLocalTime(appointment.starts_at, zone)} Uhr für {patientName(appointment)} wird
            als „nicht angetroffen“ geführt. Der Zeitraum bleibt belegt. Ein Irrtum lässt sich über
            „Termin wieder öffnen“ zurücknehmen.
          </p>
          {vermerken.isError ? (
            <Statusmeldung ton="fehler" className="mt-2">
              {vermerken.error.message}
            </Statusmeldung>
          ) : null}
          {/* Während der Vorgang läuft, bricht „Abbrechen“ nichts ab - beide
              Knöpfe sind bis zur Antwort gesperrt (wie die Rückfrage). */}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button
              ref={bestaetigenRef}
              type="button"
              disabled={vermerken.isPending}
              onClick={() => {
                if (vermerken.isPending) return;
                vermerken.mutate();
              }}
              className={umbrechenKlassen(inKarte)}
            >
              {vermerken.isPending ? 'Wird vermerkt …' : 'Ja, niemand angetroffen'}
            </Button>
            <Button
              type="button"
              variant="quiet"
              disabled={vermerken.isPending}
              onClick={() => {
                setOffen(false);
                ausloeserRef.current?.focus();
              }}
            >
              Abbrechen
            </Button>
          </div>
        </section>
      ) : null}
    </>
  );
}
