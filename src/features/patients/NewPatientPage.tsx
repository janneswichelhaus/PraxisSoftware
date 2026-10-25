import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Hinweisfenster } from '@/components/ui/Dialogfenster';
import { Fehlerzusammenfassung } from '@/components/ui/Fehlerzusammenfassung';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { Textlink } from '@/components/ui/Textlink';
import { BEGRIFFE } from '@/lib/begriffe';
import { weiterMitEnter } from '@/lib/weiterMitEnter';
import { alsFormularfehler } from '@/lib/formularfehler';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { leseRueckweg } from '@/lib/rueckweg';
import { EINGABETEXTE, useTextverlustschutz } from '@/app/Textverlustschutz';
import { formatDate } from '@/lib/datum';
import { mitRueckweg } from '@/lib/rueckweg';
import {
  createPatient,
  findPossibleDuplicates,
  leereStammdaten,
  patientMasterDataSchema,
  type PatientSearchHit,
  type StammdatenFeld,
} from './api';
import { PatientMasterDataFields } from './PatientMasterDataFields';
import {
  STAMMDATEN_BESCHRIFTUNG,
  STAMMDATEN_REIHENFOLGE,
  stammdatenFeldId,
} from './stammdatenfelder';
import { fetchAssignableTherapists } from '@/features/staff/api';

/** Der Vorgang heißt hier wie in der Liste und in der Kopfsuche (PAT-21). */
const ANLEGEN = `${BEGRIFFE.patientIn} anlegen`;

/**
 * Anlage einer neuen Patient:in.
 *
 * Die Prüfung im Formular dient der Bedienbarkeit. Verbindlich sind
 * Berechtigung, Organisationszuordnung und Normalisierung in der
 * Serverfunktion `create_patient` (ADR-004).
 *
 * **Eingaben gehen nicht still verloren (PAT-02).** Siebzehn Felder standen
 * nur im Arbeitsspeicher der Seite; ein Tipp auf die Tableiste, die Kopfsuche
 * oder den Rückweg, ein Wischen zurück oder ein Neuladen verwarf eine halbe
 * Aufnahme ohne Frage. Der Schutz der Dokumentation fragt jetzt auch hier -
 * mit den Sätzen für Formulare und, weil es keinen Entwurf gibt, nur mit
 * „Verwerfen und weitergehen" und „Hier bleiben" (ANN-046).
 */
export function NewPatientPage() {
  const [werte, setWerte] = useState<Record<StammdatenFeld, string>>(leereStammdaten);
  const [fehler, setFehler] = useState<Partial<Record<StammdatenFeld, string>>>({});
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [suche] = useSearchParams();
  const absendenRef = useRef<HTMLButtonElement>(null);
  const [fokusAufAbsenden, setFokusAufAbsenden] = useState(false);
  // PRX-015: mögliche Dubletten - ein Hinweis, keine Sperre (ANN-145). Wer
  // ihn gesehen hat und trotzdem anlegt, wird nicht ein zweites Mal gefragt,
  // solange Name und Geburtsdatum gleich bleiben.
  const [dubletten, setDubletten] = useState<PatientSearchHit[] | null>(null);
  const [geprueftFuer, setGeprueftFuer] = useState<string | null>(null);
  const [pruefung, setPruefung] = useState<'bereit' | 'laeuft'>('bereit');

  /**
   * Der Abstecher aus einem laufenden Vorgang (UX-012).
   *
   * „Die Person steht noch gar nicht in der Kartei" passiert beim Anlegen
   * eines Termins ständig. Vorher war das eine Sackgasse: Kartei öffnen,
   * anlegen, zurückfinden, von vorn beginnen. Kommt ein Rückweg mit, führt
   * das Anlegen dorthin zurück — und nimmt die neue Kennung mit, damit der
   * begonnene Vorgang sie sofort verwenden kann.
   */
  const zurueck = leseRueckweg(suche, '/patienten');

  const ungespeichert = STAMMDATEN_REIHENFOLGE.some(
    (feld) => werte[feld] !== leereStammdaten[feld],
  );
  const { freigeben, schutz } = useTextverlustschutz({ ungespeichert, texte: EINGABETEXTE });

  // Auswahl für die feste Therapeut:in (PAT-005). Schlägt die Abfrage fehl,
  // bleibt das Formular bedienbar; das Feld sagt dann, warum die Liste fehlt
  // (PAT-20).
  const therapeuten = useQuery({
    queryKey: ['assignable-therapists'],
    queryFn: fetchAssignableTherapists,
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: createPatient,
    onSuccess: async (patientId) => {
      await queryClient.invalidateQueries({ queryKey: ['patient-overview'] });
      const trenner = zurueck.includes('?') ? '&' : '?';
      // Gespeichert: Der eigene Weg hinaus ist kein Verlust (ANN-046).
      freigeben();
      void navigate(
        zurueck === '/patienten'
          ? `/patienten/${patientId}`
          : `${zurueck}${trenner}patient=${patientId}`,
        { replace: true },
      );
    },
  });

  // K11: Die Aufnahme am Telefon beginnt mit dem Namen - ohne Tipp ins erste
  // Feld (ANN-543). Die Seite hat nur diese eine Aufgabe; das Feld trägt
  // seine Beschriftung, Vorlesesoftware sagt sie an.
  useEffect(() => {
    document.getElementById(stammdatenFeldId('given_name'))?.focus();
  }, []);

  // Nach dem Fehlerfenster steht der Fokus wieder auf dem Knopf, mit dem es
  // weitergeht - nicht auf dem Seitenanfang, 2000 px darüber (PAT-03). Erst
  // nach dem Schließen: Solange das Fenster offen ist, ist die Seite gesperrt.
  useEffect(() => {
    if (!fokusAufAbsenden) return;
    absendenRef.current?.focus();
    setFokusAufAbsenden(false);
  }, [fokusAufAbsenden]);

  function setzen(feld: StammdatenFeld, wert: string) {
    setWerte((bisher) => ({ ...bisher, [feld]: wert }));
    if (fehler[feld]) setFehler((bisher) => ({ ...bisher, [feld]: undefined }));
    if (feld === 'given_name' || feld === 'family_name' || feld === 'date_of_birth') {
      setDubletten(null);
    }
  }

  async function absenden(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Schutz gegen mehrfaches Absenden: solange ein Vorgang läuft, wird kein
    // zweiter gestartet. Der Button ist zusätzlich deaktiviert.
    if (mutation.isPending || pruefung === 'laeuft') return;

    const ergebnis = patientMasterDataSchema.safeParse(werte);
    if (!ergebnis.success) {
      const gefunden: Partial<Record<StammdatenFeld, string>> = {};
      for (const problem of ergebnis.error.issues) {
        const feld = problem.path[0] as StammdatenFeld | undefined;
        if (feld && !gefunden[feld]) gefunden[feld] = problem.message;
      }
      setFehler(gefunden);
      return;
    }

    setFehler({});

    // PRX-015: Vor dem ersten Anlegen mit diesen Angaben auf Dubletten
    // prüfen. Scheitert die Prüfung, wird angelegt - sie ist ein Hinweis, kein
    // Tor; die Suche in der Kopfleiste bleibt der zweite Blick.
    const schluessel = `${werte.given_name}|${werte.family_name}|${werte.date_of_birth}`;
    if (geprueftFuer !== schluessel) {
      setPruefung('laeuft');
      try {
        const treffer = await findPossibleDuplicates(
          werte.given_name,
          werte.family_name,
          werte.date_of_birth || null,
        );
        setGeprueftFuer(schluessel);
        if (treffer.length > 0) {
          setDubletten(treffer);
          return;
        }
      } catch {
        // Ohne Prüfung weiter: siehe oben.
      } finally {
        setPruefung('bereit');
      }
    }
    mutation.mutate(ergebnis.data);
  }

  return (
    <>
      <Rueckweg standard="/patienten" />

      {/* UX-005e: Ohne Erklärsatz - der Titel sagt, was hier entsteht, und
          das Sternchen erklärt sich am Feld. */}
      <PageHeader title="Patient:in anlegen" />

      <form
        onKeyDown={weiterMitEnter}
        onSubmit={(event) => void absenden(event)}
        noValidate
        className="max-w-formular"
      >
        <Fehlerzusammenfassung
          fehler={alsFormularfehler(
            STAMMDATEN_REIHENFOLGE,
            STAMMDATEN_BESCHRIFTUNG,
            fehler,
            stammdatenFeldId,
          )}
        />

        <PatientMasterDataFields
          werte={werte}
          fehler={fehler}
          onChange={setzen}
          therapeutinnen={therapeuten.data ?? []}
          therapeutinnenStand={
            therapeuten.isPending ? 'laedt' : therapeuten.isError ? 'fehler' : 'bereit'
          }
          kurz
        />

        {/* Die Rückfrage vor dem Weggehen steht dort, wo gearbeitet wird -
            über den Knöpfen (PAT-02). */}
        {schutz}

        {/* Eine Meldung ist eine Zeile mit Linie links, kein Kasten mit
            eigener Überschrift (DESIGN.md Regel 2) - sie steht direkt über dem
            Knopf, der sie auslöste. */}
        {dubletten && dubletten.length > 0 ? (
          <div
            aria-labelledby="dubletten-titel"
            role="alert"
            className="border-warnung bg-warnung-soft mt-8 border-l-4 py-3 pr-4 pl-4"
          >
            <p id="dubletten-titel" className="text-ink text-liste font-semibold">
              Vielleicht schon in der Kartei
            </p>
            <p className="text-ink-muted mt-1 text-sm">
              Gleicher Nachname und gleiches Geburtsdatum oder gleicher Vorname. Ist es dieselbe
              Person, bitte die vorhandene Akte öffnen statt eine zweite anzulegen.
            </p>
            <ul className="mt-1 flex flex-col">
              {dubletten.map((treffer) => (
                <li key={treffer.id}>
                  <Textlink
                    alleinstehend
                    to={mitRueckweg(`/patienten/${treffer.id}`, '/patienten')}
                  >
                    {treffer.given_name} {treffer.family_name}
                    {treffer.date_of_birth ? `, geb. ${formatDate(treffer.date_of_birth)}` : ''}
                  </Textlink>
                </li>
              ))}
            </ul>
            <p className="text-ink mt-1 text-sm">
              Eine andere Person mit ähnlichen Angaben? Dann „{ANLEGEN}“ noch einmal tippen.
            </p>
          </div>
        ) : null}

        <Formularfuss>
          <Button
            ref={absendenRef}
            type="submit"
            disabled={mutation.isPending || pruefung === 'laeuft'}
          >
            {mutation.isPending
              ? 'Wird angelegt …'
              : pruefung === 'laeuft'
                ? 'Wird geprüft …'
                : ANLEGEN}
          </Button>
          {/* Ein Seitenwechsel ist ein Link (UIK-13) - und läuft damit durch
              dieselbe Rückfrage wie jeder andere Weg hinaus. Leise, wie jedes
              Abbrechen am Formularende (DESIGN.md, Formular). */}
          <ButtonLink to={zurueck} variant="quiet">
            Abbrechen
          </ButtonLink>
        </Formularfuss>
      </form>

      {/* Ein Fehlschlag kann nicht neben dem Knopf stehen, der ihn auslöst: Am
          Telefon lag der Kasten oben im Formular, rund 2000 px über dem Knopf,
          und niemand sah ihn. Deshalb als Fenster über dem Inhalt (ANN-058,
          PAT-03, ZST-10). */}
      {mutation.isError ? (
        <Hinweisfenster
          titel="Die Patient:in konnte nicht angelegt werden."
          onSchliessen={() => {
            mutation.reset();
            setFokusAufAbsenden(true);
          }}
        >
          Die Eingaben stehen noch im Formular. Bitte die Verbindung prüfen und erneut versuchen.
        </Hinweisfenster>
      ) : null}
      {/* UX-005e: Kein Dauersatz unter dem Formular, der das System erklärt -
          klinische Angaben haben hier ohnehin kein Feld. */}
    </>
  );
}
