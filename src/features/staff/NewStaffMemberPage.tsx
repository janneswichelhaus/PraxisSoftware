import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/Feedback';
import { fetchLocations } from '@/features/appointments/api';
import { canManageStaffPrivateDetails, type CurrentUser } from '@/features/session/types';
import { createStaffMember, leereStammdaten, staffMasterDataSchema, type StaffFeld } from './api';
import { StaffMasterDataFields } from './StaffMasterDataFields';

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
 * (ANN-022).
 */
export function NewStaffMemberPage({ user }: { user: CurrentUser }) {
  const privat = canManageStaffPrivateDetails(user.roles);
  const [werte, setWerte] = useState<Record<StaffFeld, string>>(leereStammdaten);
  const [fehler, setFehler] = useState<Partial<Record<StaffFeld, string>>>({});
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const standorte = useQuery({ queryKey: ['locations'], queryFn: fetchLocations, retry: false });

  const mutation = useMutation({
    mutationFn: (values: Parameters<typeof createStaffMember>[0]) =>
      createStaffMember(values, privat),
    onSuccess: async (staffMemberId) => {
      await queryClient.invalidateQueries({ queryKey: ['staff-members'] });
      void navigate(`/praxis/team/${staffMemberId}`, { replace: true });
    },
  });

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
      <Link
        to="/praxis/team"
        className="text-ink-muted hover:text-ink mb-4 inline-flex min-h-11 items-center text-sm"
      >
        ← Zurück zum Team
      </Link>

      <PageHeader
        title="Neue:r Mitarbeiter:in"
        description="Stammdaten für die Praxis. Mit * markierte Felder sind erforderlich."
      />

      <form onSubmit={absenden} noValidate className="max-w-xl">
        {mutation.isError ? (
          <div className="mb-6">
            <ErrorState
              title="Der Mitarbeiterdatensatz konnte nicht angelegt werden."
              description="Bitte erneut versuchen. Sind Sie noch angemeldet und berechtigt?"
            />
          </div>
        ) : null}

        <StaffMasterDataFields
          werte={werte}
          fehler={fehler}
          standorte={standorte.data ?? []}
          privat={privat}
          onChange={setzen}
        />

        <div className="mt-8 flex flex-wrap gap-3">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Wird angelegt …' : 'Mitarbeiter:in anlegen'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => void navigate('/praxis/team')}>
            Abbrechen
          </Button>
        </div>
      </form>

      <p className="text-ink-subtle mt-10 max-w-prose text-xs leading-relaxed">
        Es entsteht ein Mitarbeiterdatensatz, aber noch kein Zugang zur Anwendung. Für eigene
        Termine als behandelnde Person ist zusätzlich ein Zugang mit therapeutischer Rolle nötig -
        er wird anschließend auf dem Datensatz eingeladen.
      </p>
    </>
  );
}
