import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Anrufknoepfe } from '@/components/ui/Anrufknoepfe';
import { STATUSZEICHEN } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { GefuehrterAblauf } from '@/components/ui/GefuehrterAblauf';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Textlink } from '@/components/ui/Textlink';
import { beginne, kannZurueck, weiter, zurueck, type Abfolge } from '@/components/ui/abfolge';
import { EINGABETEXTE, useTextverlustschutz } from '@/app/Textverlustschutz';
import { fetchAppointment, recordNoShow, type Appointment } from './api';
import {
  AUSFALL_PARAMETER,
  FRAGE,
  WARTEZEIT_MS,
  ausfallAusAdresse,
  ausfallInAdresse,
  darfVermerken,
  folgeBis,
  gewartet,
  minutenSekunden,
  naechsteSeite,
  niemandStand,
  type AusfallStand,
  type NiemandSeite,
} from './niemandOeffnet';
import { dayKey, formatLocalTime } from '@/lib/datum';
import { fetchDayPlan, rufnummern } from '@/features/day-plan/api';

/**
 * Was der Ablauf vom Termin braucht. Die Übersicht kennt den Bearbeitungsstand
 * (`updated_at`) nicht - dann liest der Ablauf ihn unmittelbar vor dem
 * Vermerk, wie der Haken (`TerminAbschliessen`).
 */
export type NiemandOeffnetTermin = Pick<
  Appointment,
  'id' | 'patient_id' | 'staff_member_id' | 'starts_at' | 'organization_time_zone'
> & {
  updated_at?: string;
  /** Wessen Tür: der Kopf des Fensters nennt die Person (DESIGN.md Regel 6). */
  patient_given_name?: string | null;
  patient_family_name?: string | null;
};

/**
 * Die Rufnummern der Patient:in für den Anruf (UX-005b), groß genug für den
 * Daumen vor der Tür.
 *
 * Der Termin selbst trägt keine Rufnummer - die Sicht ist organisatorisch
 * knapp gehalten. Die Tagesliste (`list_day_plan`, UX-001) hat sie, und zwar
 * genau für diesen Zweck: den Besuch, der an der Tür zu scheitern droht.
 * Gelesen wird sie erst, wenn der Ablauf offen ist, und unter demselben
 * Schlüssel wie in der Übersicht - wer von dort kommt, wartet nicht.
 */
function useRufnummern(appointment: NiemandOeffnetTermin) {
  const tag = dayKey(appointment.starts_at, appointment.organization_time_zone);
  const abfrage = useQuery({
    queryKey: ['day-plan', tag, appointment.staff_member_id],
    queryFn: () => fetchDayPlan(tag, appointment.staff_member_id),
    retry: false,
  });
  const nummernAus = (plan: Awaited<ReturnType<typeof fetchDayPlan>>) => {
    const eintrag = plan.find((termin) => termin.id === appointment.id);
    return eintrag ? rufnummern(eintrag) : [];
  };
  return { abfrage, nummernAus };
}

/**
 * Im Inhalt nur, was gegen den Anruf steht: Laden, Fehler, keine Nummer -
 * mit dem Weg zu den Stammdaten. Die Nummern selbst stehen im Fuß.
 */
function Rufnummern({ appointment }: { appointment: NiemandOeffnetTermin }) {
  const { abfrage, nummernAus } = useRufnummern(appointment);
  const stammdaten = appointment.patient_id ? (
    <Textlink alleinstehend to={`/patienten/${appointment.patient_id}/stammdaten`}>
      Zu den Stammdaten
    </Textlink>
  ) : undefined;

  return (
    <Abfragezustand
      abfrage={abfrage}
      laden="Rufnummer wird geladen …"
      fehler="Die Rufnummer konnte nicht geladen werden."
      ausweg={stammdaten}
      leer={{
        wenn: (plan) => nummernAus(plan).length === 0,
        titel: 'Keine Rufnummer hinterlegt.',
        aktion: stammdaten,
      }}
    >
      {() => null}
    </Abfragezustand>
  );
}

/**
 * Der Anruf als Hauptknopf im Fuß (BEF-176): Ein Tipp ohne Anruf soll nicht
 * gleich zum Warten führen. Unter demselben Schlüssel wie im Inhalt gelesen.
 */
function Anrufe({ appointment }: { appointment: NiemandOeffnetTermin }) {
  const { abfrage, nummernAus } = useRufnummern(appointment);
  const nummern = abfrage.data ? nummernAus(abfrage.data) : [];
  return <Anrufknoepfe nummern={nummern} hauptknopf fokusbeginn ohneNummer={null} />;
}

/**
 * Die sichtbare 15-Minuten-Uhr (Auftrag C1, Analyse „Alltag unterwegs“
 * Rang 9). Sie läuft ab dem Tipp auf „Niemand öffnet?“ und sagt nach Ablauf,
 * dass die Zeit um ist (ANN-479). Die Uhr startet erst mit dem Tipp, nicht bei
 * der Ankunft - wer schon vorher gewartet hat, sagt es ausdrücklich.
 */
function Wartezeit({ seit, onUm }: { seit: number; onUm: (um: boolean) => void }) {
  const [jetzt, setJetzt] = useState(() => Date.now());
  useEffect(() => {
    const takt = window.setInterval(() => setJetzt(Date.now()), 1000);
    return () => window.clearInterval(takt);
  }, []);
  const { vergangen, um } = gewartet(seit, jetzt);
  useEffect(() => onUm(um), [um, onUm]);
  return (
    <div>
      <p role="timer" className="text-ink text-liste font-semibold tabular-nums">
        {um ? '15 Minuten um' : `Gewartet ${minutenSekunden(vergangen)} von 15:00`}
      </p>
      <ProgressBar wert={vergangen} von={WARTEZEIT_MS} />
    </div>
  );
}

/** Die Rückfrage vor dem Weggehen spricht vom Vermerk, nicht von „Text“. */
const VERMERKTEXTE = {
  ...EINGABETEXTE,
  bezeichnung: 'Noch nicht vermerkt',
  zeile: {
    weitergehen: 'Noch nicht als „nicht angetroffen“ vermerkt.',
    abmelden: 'Noch nicht vermerkt – abmelden?',
    bleiben: 'Weiter',
  },
};

/**
 * Das Fenster des Ablaufs: drei Seiten, eine Frage je Seite (ANN-573).
 * Geklingelt → angerufen (Rufnummer als Knopf) → gewartet: dort läuft die
 * Uhr, und erst nach 15 Minuten - oder mit „schon vorher gewartet“ - wird
 * vermerkt. Die beiden anderen Fälle stehen auf der ersten Seite (ADR-018
 * Punkt 9.3): Wer vor der Tür steht, hat sie vor sich; die Frage ist nur, was
 * dahinter passiert ist.
 */
function NiemandOeffnetFenster({
  appointment,
  seit,
  startSeite,
  wege,
  onSeite,
  onVermerkt,
  onSchliessen,
}: {
  appointment: NiemandOeffnetTermin;
  seit: number;
  /** Nach einem Neuladen die Seite aus der Adresse, sonst das Klingeln. */
  startSeite: NiemandSeite;
  wege?: { ohneBehandlung: string; absagen: string } | undefined;
  onSeite: (seite: NiemandSeite) => void;
  onVermerkt: () => void;
  onSchliessen: () => void;
}) {
  const queryClient = useQueryClient();
  const [abfolge, setAbfolge] = useState<Abfolge<NiemandSeite>>(() => {
    // Die Folge bis zur gespeicherten Seite, damit „← Zurück“ weiter führt.
    const [erste = 'geklingelt', ...rest] = folgeBis(startSeite);
    return rest.reduce((stand, naechste) => weiter(stand, naechste), beginne(erste));
  });
  const [um, setUm] = useState(false);
  const [schonVorher, setSchonVorher] = useState(false);
  const seite = abfolge.seite;

  function wechseln(neu: Abfolge<NiemandSeite>) {
    setAbfolge(neu);
    onSeite(neu.seite);
  }

  function zurueckGehen() {
    const vorher = zurueck(abfolge);
    if (vorher) wechseln(vorher);
  }

  const { freigeben, schutz } = useTextverlustschutz({
    // Bestätigtes geht beim Weggehen verloren - auf der ersten Seite nichts.
    ungespeichert: kannZurueck(abfolge),
    kompakt: true,
    texte: VERMERKTEXTE,
    schrittZurueck: kannZurueck(abfolge) ? zurueckGehen : undefined,
  });

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
      freigeben();
      onVermerkt();
    },
  });

  function bestaetigt() {
    const naechste = naechsteSeite(seite);
    if (naechste) wechseln(weiter(abfolge, naechste));
  }

  const darf = darfVermerken(um, schonVorher);
  const uhrzeit = formatLocalTime(appointment.starts_at, appointment.organization_time_zone);
  const name = [appointment.patient_given_name, appointment.patient_family_name]
    .filter(Boolean)
    .join(' ');

  return (
    <GefuehrterAblauf
      titel={FRAGE[seite]}
      objekt={`${name || 'Hausbesuch'} · ${uhrzeit} Uhr`}
      schliessen="Abbrechen"
      onSchliessen={onSchliessen}
      seite={seite}
      stand={niemandStand(seite)}
      onZurueck={kannZurueck(abfolge) ? zurueckGehen : undefined}
      schutz={schutz}
      abschluss={seite === 'gewartet'}
      fuss={
        seite === 'geklingelt' ? (
          <Button className="w-full" onClick={bestaetigt} data-autofocus>
            Ja, geklingelt
          </Button>
        ) : seite === 'angerufen' ? (
          // Der Anruf ist die Haupthandlung, die Antworten danach sekundär
          // (BEF-176, wie BEF-192 in „Tag umplanen“).
          <div className="flex flex-col gap-2">
            <Anrufe appointment={appointment} />
            <Button variant="secondary" className="w-full" onClick={bestaetigt}>
              Angerufen, niemand erreicht
            </Button>
            {/* Geht doch jemand ran, findet der Besuch statt: zurück zur Tür. */}
            <Button variant="quiet" className="w-full" onClick={onSchliessen}>
              Erreicht – Besuch findet statt
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {!um ? (
              <Checkbox
                label="Schon vorher 15 Minuten gewartet"
                checked={schonVorher}
                onChange={(event) => setSchonVorher(event.target.checked)}
                // Solange die Uhr läuft, ist der Knopf gesperrt; der Fokus
                // beginnt beim Haken, der ihn öffnen kann.
                data-autofocus
              />
            ) : null}
            {vermerken.isError ? (
              <Statusmeldung ton="fehler">{vermerken.error.message}</Statusmeldung>
            ) : null}
            {!darf ? (
              <span id="vermerk-wartet" className="sr-only">
                Die 15 Minuten sind noch nicht um.
              </span>
            ) : null}
            <Button
              className="w-full"
              disabled={!darf || vermerken.isPending}
              aria-describedby={!darf ? 'vermerk-wartet' : undefined}
              onClick={() => vermerken.mutate()}
              {...(um ? { 'data-autofocus': true } : {})}
            >
              {vermerken.isPending ? 'Wird vermerkt …' : 'Als „nicht angetroffen“ vermerken'}
            </Button>
          </div>
        )
      }
    >
      {seite === 'geklingelt' ? (
        // Die beiden anderen Fälle, je mit ihrer Folge (ADR-018 Punkt 9). Der
        // dritte - vorher abgesagt - bleibt als eine Zeile mit dem Weg; die
        // 24-Stunden-Regel erklärt die Absage-Rückfrage selbst (ANN-198).
        // Die Wege stehen für sich mit 44 px Tippziel (DESIGN.md Grundsatz 3),
        // nicht im Satz.
        <div className="text-ink flex flex-col gap-3 text-sm">
          <div>
            <p>Tür geöffnet, aber keine Behandlung? Dann ohne Ausfallhonorar:</p>
            {wege ? (
              <Textlink alleinstehend to={wege.ohneBehandlung}>
                Ohne Behandlung festhalten
              </Textlink>
            ) : (
              <p>„Ohne Behandlung“ am Termin.</p>
            )}
          </div>
          <div>
            <p>Vorher abgesagt?</p>
            {wege ? (
              <Textlink alleinstehend to={wege.absagen}>
                Termin absagen
              </Textlink>
            ) : (
              <p>„Termin absagen“ am Termin.</p>
            )}
          </div>
        </div>
      ) : seite === 'angerufen' ? (
        <Rufnummern appointment={appointment} />
      ) : (
        <div className="flex flex-col gap-4">
          <Wartezeit seit={seit} onUm={setUm} />
          <ListRows rahmen={false} beschriftung="Protokoll">
            <ListRow titel="An der Tür geklingelt" status={<Erledigt />} />
            <ListRow titel="Angerufen, niemand erreicht" status={<Erledigt />} />
            <ListRow
              titel="15 Minuten gewartet"
              status={
                darf ? (
                  <Erledigt />
                ) : (
                  // Zeichen und Wort (DESIGN.md Regel 5), wie „wartet“ am Abzeichen.
                  <span className="text-ink-muted text-sm">
                    <span aria-hidden="true">{STATUSZEICHEN.wartet} </span>Uhr läuft
                  </span>
                )
              }
            />
          </ListRows>
          <p className="text-ink text-sm">
            Danach gilt der Termin als „nicht angetroffen“ und löst ein Ausfallhonorar aus. Ein
            Irrtum lässt sich über „Termin wieder öffnen“ zurücknehmen.
          </p>
        </div>
      )}
    </GefuehrterAblauf>
  );
}

/** Ein bestätigter Schritt als Zeichen und Wort (DESIGN.md Regel 5). */
function Erledigt() {
  return (
    <span className="text-positiv text-sm font-medium">
      <span aria-hidden="true">✓ </span>Bestätigt
    </span>
  );
}

/**
 * „Niemand öffnet?“ - der geführte Ablauf am Hausbesuch (UX-005b, CAL-018,
 * Überholung 6).
 *
 * ADR-018 Fassung 3 Punkt 9 verlangt, dass die Oberfläche **erklärend** durch
 * die Szenarien führt: welcher Fall vorliegt, was daraus folgt, welche Angabe
 * fehlt. Der Regelfall ist der Hauptknopf „Dokumentieren und abschließen“
 * daneben; dieser Knopf öffnet den Ablauf für den Fall, dass niemand aufmacht.
 * Seit Überholung 6 ein Fenster mit einer Frage je Seite statt einer
 * aufgeklappten Fläche mit drei Haken (ANN-573); die Uhr läuft ab dem ersten
 * Tipp und läuft weiter, wenn das Fenster zwischendurch zugeht. Uhrstart und
 * offene Seite stehen in der Adresse (`ausfallAusAdresse`): Lädt das Telefon
 * die App nach dem Anruf neu, führt der nächste Tipp zurück auf dieselbe Seite
 * mit derselben Uhr (Praxis-Review Überholung 6).
 *
 * Vermerkt wird mit allen drei Schritten (Pflichtangabe nach ADR-018 Punkt 9);
 * ein Irrtum lässt sich über „Termin wieder öffnen“ zurücknehmen. Verbindlich
 * prüft der Server (`record_no_show`, ADR-004).
 */
export function HomeVisitFlow({
  appointment,
  melden,
  wege,
  ausloeser = 'Niemand öffnet?',
  ausloeserVariante = 'secondary',
  ausloeserZusatz,
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
  /**
   * Für Vorlesesoftware hinter dem sichtbaren Wort: wessen Termin („für Erika
   * Beispiel um 10:00 Uhr“). In der Übersicht stehen mehrere „Ausfall“
   * untereinander (UEB-10).
   */
  ausloeserZusatz?: string | undefined;
  /**
   * Die beiden anderen Fälle als Wege, wo die Seite sie nicht selbst trägt
   * (die Übersicht); ohne Angabe nennen die Sätze die Knöpfe am Termin.
   */
  wege?: { ohneBehandlung: string; absagen: string };
}) {
  const [suche, setSuche] = useSearchParams();
  // Die Uhr beginnt mit dem ersten Tipp und läuft weiter, wenn das Fenster
  // zwischendurch zugeht (ANN-479) - auch über ein Neuladen hinweg.
  const gemerkt = ausfallAusAdresse(suche.get(AUSFALL_PARAMETER), appointment.id);
  const [offen, setOffen] = useState<{ seit: number; seite: NiemandSeite } | null>(null);

  function merken(stand: AusfallStand | null) {
    setSuche(
      (bisher) => {
        const naechste = new URLSearchParams(bisher);
        if (stand) naechste.set(AUSFALL_PARAMETER, ausfallInAdresse(appointment.id, stand));
        else naechste.delete(AUSFALL_PARAMETER);
        return naechste;
      },
      { replace: true },
    );
  }

  return (
    <>
      <Button
        type="button"
        variant={ausloeserVariante}
        groesse="kompakt"
        aria-haspopup="dialog"
        onClick={() => {
          const stand = {
            seit: gemerkt?.seit ?? Date.now(),
            seite: gemerkt?.seite ?? 'geklingelt',
          };
          merken(stand);
          setOffen(stand);
        }}
      >
        {ausloeser}
        {ausloeserZusatz ? (
          <>
            {' '}
            <span className="sr-only">{ausloeserZusatz}</span>
          </>
        ) : null}
      </Button>

      {offen ? (
        <NiemandOeffnetFenster
          appointment={appointment}
          seit={offen.seit}
          startSeite={offen.seite}
          wege={wege}
          onSeite={(seite) => merken({ seit: offen.seit, seite })}
          onSchliessen={() => {
            // Die Uhr bleibt, die Seite nicht: Wer abbricht, klingelt neu.
            merken({ seit: offen.seit, seite: null });
            setOffen(null);
          }}
          onVermerkt={() => {
            merken(null);
            setOffen(null);
            melden('Als „nicht angetroffen“ vermerkt – das Ausfallhonorar ist vorgemerkt.');
          }}
        />
      ) : null}
    </>
  );
}
