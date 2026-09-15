import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Fehlerzusammenfassung } from '@/components/ui/Fehlerzusammenfassung';
import { alsFormularfehler } from '@/lib/formularfehler';
import { fetchLocations } from '@/features/appointments/api';
import { fullName } from '@/features/patients/api';
import { canManageStaffPrivateDetails, type CurrentUser } from '@/features/session/types';
import {
  fetchStaffMember,
  staffMasterDataSchema,
  staffToFormValues,
  updateStaffMember,
  type StaffFeld,
  type StaffMasterDataValues,
  type StaffMember,
} from './api';
import { StaffMasterDataFields } from './StaffMasterDataFields';
import { STAFF_BESCHRIFTUNG, staffFeldId, staffReihenfolge } from './mitarbeiterfelder';

/**
 * Formular für die Änderung der Mitarbeiterstammdaten.
 *
 * Vorbefüllt aus dem gelesenen Datensatz. Der Beschäftigungsstatus ist bewusst
 * kein Eingabefeld: er hat einen eigenen Vorgang mit eigener Rückfrage.
 *
 * Für eine Rolle ohne Zugriff auf die Privatangaben - seit E10 pflegt auch das
 * Office Stammdaten - kämen diese Felder leer an, und ein Speichern würde sie
 * löschen. Deshalb entfällt der Abschnitt für sie vollständig, und die RPC
 * bekommt für ihn `null`: der Server lässt die gespeicherten Werte dann stehen
 * (ANN-024). Verbindlich prüft in jedem Fall der Server.
 */
function EditStaffForm({ staff, privat }: { staff: StaffMember; privat: boolean }) {
  const [werte, setWerte] = useState<Record<StaffFeld, string>>(() => staffToFormValues(staff));
  const [fehler, setFehler] = useState<Partial<Record<StaffFeld, string>>>({});
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const standorte = useQuery({ queryKey: ['locations'], queryFn: fetchLocations, retry: false });

  const zurueck = `/praxis/team/${staff.id}`;

  const mutation = useMutation({
    mutationFn: (values: StaffMasterDataValues) => updateStaffMember(staff.id, values, privat),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['staff-members'] });
      await queryClient.invalidateQueries({ queryKey: ['staff-member', staff.id] });
      void navigate(zurueck, { replace: true });
    },
  });

  function setzen(feld: StaffFeld, wert: string) {
    setWerte((bisher) => ({ ...bisher, [feld]: wert }));
    if (fehler[feld]) setFehler((bisher) => ({ ...bisher, [feld]: undefined }));
  }

  function absenden(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
        to={zurueck}
        className="text-ink-muted hover:text-ink mb-4 inline-flex min-h-11 items-center text-sm"
      >
        ← Zurück zum Datensatz
      </Link>

      <PageHeader
        title="Stammdaten bearbeiten"
        description={`${fullName(staff)} · Mit * markierte Felder sind erforderlich.`}
      />

      <form onSubmit={absenden} noValidate className="max-w-xl">
        {mutation.isError ? (
          <div className="mb-6">
            <ErrorState
              title="Die Stammdaten konnten nicht gespeichert werden."
              description="Bitte erneut versuchen. Sind Sie noch angemeldet und berechtigt?"
            />
          </div>
        ) : null}

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
          privat={privat}
          onChange={setzen}
        />

        <div className="mt-8 flex flex-wrap gap-3">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Wird gespeichert …' : 'Änderungen speichern'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => void navigate(zurueck)}>
            Abbrechen
          </Button>
        </div>
      </form>

      <p className="text-ink-subtle mt-10 max-w-prose text-xs leading-relaxed">
        Änderungen werden protokolliert - erfasst werden dabei nur die Namen der geänderten Felder,
        keine Inhalte. Der Beschäftigungsstatus wird hier nicht verändert.
      </p>
    </>
  );
}

export function EditStaffMemberPage({ user }: { user: CurrentUser }) {
  const { staffMemberId } = useParams<{ staffMemberId: string }>();

  const { data, isPending, isError } = useQuery({
    queryKey: ['staff-member', staffMemberId],
    queryFn: () => fetchStaffMember(staffMemberId!),
    enabled: Boolean(staffMemberId),
    retry: false,
  });

  return (
    <>
      {isPending ? <LoadingState label="Mitarbeiterdaten werden geladen …" /> : null}
      {isError ? <ErrorState title="Die Mitarbeiterdaten konnten nicht geladen werden." /> : null}
      {data === null ? (
        <ErrorState
          title="Nicht gefunden"
          description="Dieser Datensatz existiert nicht oder ist für Ihren Zugang nicht freigegeben."
        />
      ) : null}
      {data ? (
        <EditStaffForm staff={data} privat={canManageStaffPrivateDetails(user.roles)} />
      ) : null}
    </>
  );
}
