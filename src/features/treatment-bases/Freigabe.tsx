import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { StatusMark } from '@/components/ui/StatusMark';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import {
  grundlagenZustandLabels,
  grundlagenZustandTon,
  releaseTreatmentBasisForBilling,
  withdrawTreatmentBasisFromBilling,
  type TreatmentBasisKontingent,
} from './api';

/** Der Tag eines Zeitpunkts in der Zeitzone der Praxis: „13.05.2027“. */
function tagVon(zeitpunkt: string, zeitzone: string | null): string {
  const datum = new Date(zeitpunkt);
  if (Number.isNaN(datum.getTime())) return '—';
  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'medium',
    ...(zeitzone ? { timeZone: zeitzone } : {}),
  }).format(datum);
}

/**
 * Was nach einer Freigabe neu zu laden ist: der Termin (Abrechnungslage), die
 * Zahlen der Grundlagen in der Akte und die Patientenliste.
 */
function nachladen(queryClient: ReturnType<typeof useQueryClient>, patientId: string | null) {
  void queryClient.invalidateQueries({ queryKey: ['appointment'] });
  void queryClient.invalidateQueries({ queryKey: ['patient-overview'] });
  if (patientId) {
    void queryClient.invalidateQueries({ queryKey: ['patient-treatment-basis-slots', patientId] });
  }
}

/**
 * „In die Abrechnung stellen“ (B7, BEF-157): Ist die Grundlage vollständig
 * erbracht und dokumentiert, schlägt die App die Freigabe vor; ein Tipp
 * bestätigt. Danach sind Doku, Zeitpunkt und Anzahl der Termine gesperrt
 * (ANN-515). Verbindlich prüft der Server Recht und Stand.
 *
 * Sekundär: Der eine Hauptknopf der Ansicht bleibt, wo er ist („Fertig“, der
 * nächste Weg). Ohne eigene Fläche und ohne Erklärsatz (DESIGN.md Regeln 2
 * und 6): Den Stand nennt die Zeile darüber - nur wo keine steht (nach dem
 * Haken in der Übersicht), sagt `mitStand` ihn als Zeichen und Wort.
 */
export function FreigabeVorschlag({
  treatmentBasisId,
  patientId,
  mitStand = false,
}: {
  treatmentBasisId: string;
  patientId: string | null;
  /** „Verordnung vollständig“ über dem Knopf - wo keine Zeile den Stand nennt. */
  mitStand?: boolean;
}) {
  const queryClient = useQueryClient();
  const freigabe = useMutation({
    mutationFn: () => releaseTreatmentBasisForBilling(treatmentBasisId),
    onSuccess: () => nachladen(queryClient, patientId),
  });

  if (freigabe.isSuccess) {
    return (
      <Rueckmeldung>In die Abrechnung gestellt. Doku und Termine sind jetzt gesperrt.</Rueckmeldung>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2">
      {mitStand ? <StatusMark ton="positiv">Verordnung vollständig</StatusMark> : null}
      {freigabe.isError ? (
        <Statusmeldung ton="fehler">{freigabe.error.message}</Statusmeldung>
      ) : null}
      <Button
        type="button"
        variant="secondary"
        groesse="kompakt"
        className="self-start"
        disabled={freigabe.isPending}
        aria-busy={freigabe.isPending || undefined}
        onClick={() => {
          if (freigabe.isPending) return;
          freigabe.mutate();
        }}
      >
        {freigabe.isPending ? 'Wird gestellt …' : 'In die Abrechnung stellen'}
      </Button>
    </div>
  );
}

/**
 * Der Stand nach der Freigabe, mit dem Weg zurück (Akte): „Zurückholen“ hebt
 * die Sperre auf, solange keine Rechnung zur Grundlage besteht. Ohne
 * `darfZurueckholen` nur der Stand.
 */
export function FreigabeStand({
  treatmentBasisId,
  patientId,
  freigegebenAm,
  abgerechnet,
  darfZurueckholen,
  zeitzone,
}: {
  treatmentBasisId: string;
  patientId: string | null;
  /** Zeitpunkt der Freigabe (timestamptz). */
  freigegebenAm: string;
  abgerechnet: boolean;
  darfZurueckholen: boolean;
  /** Zeitzone der Praxis für den Tag der Freigabe. */
  zeitzone: string | null;
}) {
  const queryClient = useQueryClient();
  const zurueck = useMutation({
    mutationFn: () => withdrawTreatmentBasisFromBilling(treatmentBasisId),
    onSuccess: () => nachladen(queryClient, patientId),
  });

  if (zurueck.isSuccess) {
    return <Rueckmeldung>Zurückgeholt. Doku und Termine lassen sich wieder ändern.</Rueckmeldung>;
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <StatusMark ton="positiv">
        {abgerechnet ? 'Abgerechnet' : `In der Abrechnung seit ${tagVon(freigegebenAm, zeitzone)}`}
      </StatusMark>
      {zurueck.isError ? <Statusmeldung ton="fehler">{zurueck.error.message}</Statusmeldung> : null}
      {darfZurueckholen && !abgerechnet ? (
        <Button
          type="button"
          variant="quiet"
          groesse="kompakt"
          disabled={zurueck.isPending}
          aria-busy={zurueck.isPending || undefined}
          onClick={() => {
            if (zurueck.isPending) return;
            zurueck.mutate();
          }}
        >
          {zurueck.isPending ? 'Wird zurückgeholt …' : 'Aus der Abrechnung zurückholen'}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Die Zeile „Abrechnung“ einer Grundlage in der Akte (B1, B7): Zustand als
 * Zeichen und Wort, was erbracht und dokumentiert ist, und der Weg - in die
 * Abrechnung stellen, sobald nichts mehr offen ist (auch vor dem letzten
 * verordneten Termin, wenn die Behandlung früher endet), oder zurückholen.
 */
export function AbrechnungDerGrundlage({
  kontingent,
  patientId,
  darfZurueckholen,
  zeitzone,
}: {
  kontingent: TreatmentBasisKontingent;
  patientId: string;
  darfZurueckholen: boolean;
  zeitzone: string | null;
}) {
  const zustand = kontingent.state;
  if (!zustand) return null;
  if (kontingent.released_at) {
    return (
      <FreigabeStand
        treatmentBasisId={kontingent.treatment_basis_id}
        patientId={patientId}
        freigegebenAm={kontingent.released_at}
        abgerechnet={kontingent.invoiced === true}
        darfZurueckholen={darfZurueckholen}
        zeitzone={zeitzone}
      />
    );
  }
  return (
    <div className="flex flex-col items-start gap-2">
      <StatusMark ton={grundlagenZustandTon[zustand]}>
        {grundlagenZustandLabels[zustand]}
      </StatusMark>
      {zustand === 'abgerechnet' ? null : (
        <span className="text-ink-muted text-sm">
          {kontingent.performed ?? 0} von {kontingent.prescribed} erbracht ·{' '}
          {kontingent.documented ?? 0} dokumentiert
        </span>
      )}
      {kontingent.can_release ? (
        <FreigabeVorschlag treatmentBasisId={kontingent.treatment_basis_id} patientId={patientId} />
      ) : null}
    </div>
  );
}
