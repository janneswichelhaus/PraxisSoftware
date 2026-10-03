import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Hinweisfenster } from '@/components/ui/Dialogfenster';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Fehlerzusammenfassung } from '@/components/ui/Fehlerzusammenfassung';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { alsFormularfehler } from '@/lib/formularfehler';
import { leseRueckweg } from '@/lib/rueckweg';
import { fetchLocations } from '@/features/appointments/api';
import { EINGABETEXTE, useTextverlustschutz } from '@/features/documentation/Textverlustschutz';
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

const TITEL = 'Stammdaten bearbeiten';

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
 *
 * Wie beim Anlegen fragt die Seite, bevor ungespeicherte Änderungen verloren
 * gehen (ORG-03, ANN-046): ungespeichert ist, was vom gelesenen Stand abweicht.
 */
function EditStaffForm({ staff, privat }: { staff: StaffMember; privat: boolean }) {
  const ausgang = useMemo(() => staffToFormValues(staff), [staff]);
  const [werte, setWerte] = useState<Record<StaffFeld, string>>(ausgang);
  const [fehler, setFehler] = useState<Partial<Record<StaffFeld, string>>>({});
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [suche] = useSearchParams();
  const speichernRef = useRef<HTMLButtonElement>(null);
  const [fokusAufSpeichern, setFokusAufSpeichern] = useState(false);

  const standorte = useQuery({ queryKey: ['locations'], queryFn: fetchLocations, retry: false });

  // Zurück in den Datensatz - oder dorthin, woher die Bearbeitung kam (ORG-24).
  const zurueck = leseRueckweg(suche, `/praxis/team/${staff.id}`);

  const ungespeichert = staffReihenfolge(privat).some((feld) => werte[feld] !== ausgang[feld]);
  const { freigeben, schutz } = useTextverlustschutz({ ungespeichert, texte: EINGABETEXTE });

  const mutation = useMutation({
    mutationFn: (values: StaffMasterDataValues) => updateStaffMember(staff.id, values, privat),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['staff-members'] });
      await queryClient.invalidateQueries({ queryKey: ['staff-member', staff.id] });
      // Gespeichert: Der eigene Weg hinaus ist kein Verlust (ANN-046).
      freigeben();
      void navigate(zurueck, { replace: true });
    },
  });

  // Nach dem Fehlerfenster steht der Fokus wieder auf „Änderungen speichern"
  // - erst nach dem Schließen, solange ist die Seite gesperrt.
  useEffect(() => {
    if (!fokusAufSpeichern) return;
    speichernRef.current?.focus();
    setFokusAufSpeichern(false);
  }, [fokusAufSpeichern]);

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
      <PageHeader
        title={TITEL}
        description={`${fullName(staff)} · Mit * markierte Felder sind erforderlich.`}
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
          bisherigerStandort={staff.primary_location_name}
          onStandorteErneut={() => void standorte.refetch()}
          privat={privat}
          onChange={setzen}
        />

        {/* Die Rückfrage vor dem Weggehen steht dort, wo gearbeitet wird -
            über den Knöpfen. */}
        {schutz}

        <div className="mt-8 flex flex-wrap gap-3">
          <Button ref={speichernRef} type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Wird gespeichert …' : 'Änderungen speichern'}
          </Button>
          {/* Ein Seitenwechsel ist ein Link (UIK-13) - und läuft damit durch
              dieselbe Rückfrage wie jeder andere Weg hinaus. */}
          <ButtonLink to={zurueck} variant="secondary">
            Abbrechen
          </ButtonLink>
        </div>
      </form>

      {/* Ein Fehlschlag kann nicht neben dem Knopf stehen, der ihn auslöst:
          Der Kasten lag oben im Formular, weit über dem Knopf (ORG-15,
          ZST-10). Deshalb als Fenster über dem Inhalt (ANN-058). */}
      {mutation.isError ? (
        <Hinweisfenster
          titel="Die Stammdaten konnten nicht gespeichert werden."
          onSchliessen={() => {
            mutation.reset();
            setFokusAufSpeichern(true);
          }}
        >
          Die Eingaben stehen noch im Formular. Bitte die Verbindung prüfen und erneut speichern.
        </Hinweisfenster>
      ) : null}

      <p className="text-ink-muted mt-10 max-w-prose text-xs leading-relaxed">
        Der Beschäftigungsstatus wird hier nicht verändert.
      </p>
    </>
  );
}

export function EditStaffMemberPage({ user }: { user: CurrentUser }) {
  const { staffMemberId = '' } = useParams<{ staffMemberId: string }>();

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['staff-member', staffMemberId],
    queryFn: () => fetchStaffMember(staffMemberId),
    enabled: Boolean(staffMemberId),
    retry: false,
  });

  return (
    <>
      {/* Der Rückweg steht vor jedem Zustand - auch im Fehlerfall gibt es
          einen Weg hinaus (ORG-24, ZST-08). */}
      <Rueckweg
        standard={`/praxis/team/${staffMemberId}`}
        beschriftung={data ? `Zurück zu ${fullName(data)}` : 'Zurück zu den Stammdaten'}
      />

      {data ? (
        <EditStaffForm staff={data} privat={canManageStaffPrivateDetails(user.roles)} />
      ) : (
        <>
          <PageHeader title={TITEL} />
          {isPending ? <LoadingState label="Mitarbeiterdaten werden geladen …" /> : null}
          {isError ? (
            <ErrorState
              title="Die Mitarbeiterdaten konnten nicht geladen werden."
              description="Bitte die Verbindung prüfen und später erneut versuchen."
              onErneut={() => void refetch()}
            />
          ) : null}
          {data === null ? (
            <ErrorState
              title="Nicht gefunden"
              description="Diese Person gibt es nicht oder sie ist für Ihren Zugang nicht freigegeben."
            />
          ) : null}
        </>
      )}
    </>
  );
}
