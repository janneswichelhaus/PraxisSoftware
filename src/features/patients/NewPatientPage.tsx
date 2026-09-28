import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Hinweisfenster } from '@/components/ui/Dialogfenster';
import { Fehlerzusammenfassung } from '@/components/ui/Fehlerzusammenfassung';
import { BEGRIFFE } from '@/lib/begriffe';
import { alsFormularfehler } from '@/lib/formularfehler';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { leseRueckweg } from '@/lib/rueckweg';
import { fetchAssignableTherapists } from '@/features/appointments/api';
import { EINGABETEXTE, useTextverlustschutz } from '@/features/documentation/Textverlustschutz';
import {
  createPatient,
  leereStammdaten,
  patientMasterDataSchema,
  type StammdatenFeld,
} from './api';
import { PatientMasterDataFields } from './PatientMasterDataFields';
import {
  STAMMDATEN_BESCHRIFTUNG,
  STAMMDATEN_REIHENFOLGE,
  stammdatenFeldId,
} from './stammdatenfelder';

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
      await queryClient.invalidateQueries({ queryKey: ['patients'] });
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
  }

  function absenden(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Schutz gegen mehrfaches Absenden: solange ein Vorgang läuft, wird kein
    // zweiter gestartet. Der Button ist zusätzlich deaktiviert.
    if (mutation.isPending) return;

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
    mutation.mutate(ergebnis.data);
  }

  return (
    <>
      <Rueckweg standard="/patienten" />

      <PageHeader
        title="Neue:r Patient:in"
        description="Stammdaten für die Aufnahme in die Praxis. Mit * markierte Felder sind erforderlich."
      />

      <form onSubmit={absenden} noValidate className="max-w-xl">
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
        />

        {/* Die Rückfrage vor dem Weggehen steht dort, wo gearbeitet wird -
            über den Knöpfen (PAT-02). */}
        {schutz}

        <div className="mt-8 flex flex-wrap gap-3">
          <Button ref={absendenRef} type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Wird angelegt …' : ANLEGEN}
          </Button>
          {/* Ein Seitenwechsel ist ein Link (UIK-13) - und läuft damit durch
              dieselbe Rückfrage wie jeder andere Weg hinaus. */}
          <ButtonLink to={zurueck} variant="secondary">
            Abbrechen
          </ButtonLink>
        </div>
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

      <p className="text-ink-muted mt-10 max-w-prose text-xs leading-relaxed">
        Es werden ausschließlich organisatorische Stammdaten erfasst. Klinische Angaben und ein
        Portalzugang entstehen hier nicht.
      </p>
    </>
  );
}
