import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Hinweisfenster } from '@/components/ui/Dialogfenster';
import { Fehlerzusammenfassung } from '@/components/ui/Fehlerzusammenfassung';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { alsFormularfehler } from '@/lib/formularfehler';
import { RUECKWEG_PARAM, leseRueckweg, mitRueckweg } from '@/lib/rueckweg';
import { fetchLocations } from '@/features/appointments/api';
import { EINGABETEXTE, useTextverlustschutz } from '@/features/documentation/Textverlustschutz';
import { canManageStaffPrivateDetails, type CurrentUser } from '@/features/session/types';
import { createStaffMember, leereStammdaten, staffMasterDataSchema, type StaffFeld } from './api';
import { StaffMasterDataFields } from './StaffMasterDataFields';
import { STAFF_BESCHRIFTUNG, staffFeldId, staffReihenfolge } from './mitarbeiterfelder';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';

/**
 * Anlage eines Mitarbeiterdatensatzes.
 *
 * Die Prüfung im Formular dient der Bedienbarkeit. Verbindlich sind
 * Berechtigung, Organisationszuordnung und Normalisierung in
 * `create_staff_member` (ADR-004).
 *
 * Hier entsteht ausdrücklich kein Benutzerkonto und keine Rolle: Person,
 * Mitarbeiterdatensatz und Zugang sind getrennte Konzepte (ADR-014). Der
 * Zugang wird anschließend am Datensatz eingeladen (STAFF-002b).
 *
 * Die Privatangaben erscheinen nur für Rollen, die sie auch lesen dürfen
 * (ANN-024).
 *
 * **Eingaben gehen nicht still verloren (ORG-03, ZST-05).** Bis zu elf Felder
 * standen nur im Arbeitsspeicher der Seite; ein Tipp auf die Tableiste oder
 * ein Neuladen verwarf sie ohne Frage. Der Schutz der Formulare fragt jetzt
 * auch hier - ohne Entwurf nur mit „Verwerfen und weitergehen" und „Hier
 * bleiben" (ANN-046).
 *
 * **Der Rückweg reist mit (ORG-24).** Die Kopfsuche öffnet diese Seite mit
 * `?zurueck=`; Rückweg und „Abbrechen" führen dorthin zurück, und die neue
 * Person nimmt ihn mit in ihren Datensatz.
 */
export function NewStaffMemberPage({ user }: { user: CurrentUser }) {
  const privat = canManageStaffPrivateDetails(user.roles);
  const [werte, setWerte] = useState<Record<StaffFeld, string>>(leereStammdaten);
  const [fehler, setFehler] = useState<Partial<Record<StaffFeld, string>>>({});
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [suche] = useSearchParams();
  const absendenRef = useRef<HTMLButtonElement>(null);
  const [fokusAufAbsenden, setFokusAufAbsenden] = useState(false);

  const zurueck = leseRueckweg(suche, '/praxis/team');

  const ungespeichert = staffReihenfolge(privat).some(
    (feld) => werte[feld] !== leereStammdaten[feld],
  );
  const { freigeben, schutz } = useTextverlustschutz({ ungespeichert, texte: EINGABETEXTE });

  const standorte = useQuery({ queryKey: ['locations'], queryFn: fetchLocations, retry: false });

  const mutation = useMutation({
    mutationFn: (values: Parameters<typeof createStaffMember>[0]) =>
      createStaffMember(values, privat),
    onSuccess: async (staffMemberId) => {
      await queryClient.invalidateQueries({ queryKey: ['staff-members'] });
      // Gespeichert: Der eigene Weg hinaus ist kein Verlust (ANN-046).
      freigeben();
      void navigate(mitRueckweg(`/praxis/team/${staffMemberId}`, suche.get(RUECKWEG_PARAM)), {
        replace: true,
      });
    },
  });

  // Nach dem Fehlerfenster steht der Fokus wieder auf dem Knopf, mit dem es
  // weitergeht - nicht auf dem Seitenanfang. Erst nach dem Schließen: Solange
  // das Fenster offen ist, ist die Seite gesperrt.
  useEffect(() => {
    if (!fokusAufAbsenden) return;
    absendenRef.current?.focus();
    setFokusAufAbsenden(false);
  }, [fokusAufAbsenden]);

  function setzen(feld: StaffFeld, wert: string) {
    setWerte((bisher) => ({ ...bisher, [feld]: wert }));
    if (fehler[feld]) setFehler((bisher) => ({ ...bisher, [feld]: undefined }));
  }

  function absenden(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Schutz gegen mehrfaches Absenden: solange ein Vorgang läuft, wird kein
    // zweiter gestartet. Der Button ist zusätzlich deaktiviert.
    if (mutation.isPending) return;

    const ergebnis = staffMasterDataSchema.safeParse(werte);
    if (!ergebnis.success) {
      const gefunden: Partial<Record<StaffFeld, string>> = {};
      for (const problem of ergebnis.error.issues) {
        const feld = problem.path[0] as StaffFeld | undefined;
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
      <Rueckweg standard="/praxis/team" beschriftung="Zurück zu den Mitarbeitenden" />

      <PageHeader
        title="Neue:r Mitarbeiter:in"
        description="Stammdaten für die Praxis. Mit * markierte Felder sind erforderlich."
      />

      <form onSubmit={absenden} noValidate className="max-w-xl">
        <Fehlerzusammenfassung
          fehler={alsFormularfehler(
            staffReihenfolge(privat),
            STAFF_BESCHRIFTUNG,
            fehler,
            staffFeldId,
          )}
        />

        <StaffMasterDataFields
          werte={werte}
          fehler={fehler}
          standorte={standorte.data ?? []}
          standorteStand={standorte.isPending ? 'laedt' : standorte.isError ? 'fehler' : 'bereit'}
          onStandorteErneut={() => void standorte.refetch()}
          privat={privat}
          onChange={setzen}
        />

        {/* Die Rückfrage vor dem Weggehen steht dort, wo gearbeitet wird -
            über den Knöpfen. */}
        {schutz}

        <div className="mt-8 flex flex-wrap gap-3">
          <Button ref={absendenRef} type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Wird angelegt …' : 'Mitarbeiter:in anlegen'}
          </Button>
          {/* Ein Seitenwechsel ist ein Link (UIK-13) - und läuft damit durch
              dieselbe Rückfrage wie jeder andere Weg hinaus. */}
          <ButtonLink to={zurueck} variant="secondary">
            Abbrechen
          </ButtonLink>
        </div>
      </form>

      {/* Ein Fehlschlag kann nicht neben dem Knopf stehen, der ihn auslöst: Am
          Telefon lag der Kasten oben im Formular, rund 1000 px über dem Knopf,
          und niemand sah ihn (ORG-15, ZST-10). Deshalb als Fenster über dem
          Inhalt (ANN-058). */}
      {mutation.isError ? (
        <Hinweisfenster
          titel="Die Mitarbeiter:in konnte nicht angelegt werden."
          onSchliessen={() => {
            mutation.reset();
            setFokusAufAbsenden(true);
          }}
        >
          Die Eingaben stehen noch im Formular. Bitte die Verbindung prüfen und erneut versuchen.
        </Hinweisfenster>
      ) : null}

      <Kleingedrucktes className="mt-10">
        Es entstehen die Stammdaten, aber noch kein Zugang zur Anwendung. Für eigene Termine als
        behandelnde Person ist zusätzlich ein Zugang mit der Rolle Therapeut:in oder Teamleitung
        nötig – ihn lädt die Praxisinhaber:in anschließend bei der Person unter „Zugang“ ein.
      </Kleingedrucktes>
    </>
  );
}
