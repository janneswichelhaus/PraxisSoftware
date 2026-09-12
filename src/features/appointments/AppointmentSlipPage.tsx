import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { fetchPatient, fullName } from '@/features/patients/api';
import {
  fetchAppointmentSlip,
  formatLocalDate,
  formatLocalTimeRange,
  slipOrt,
  staffName,
} from './api';

/**
 * Terminzettel zum Ausdrucken (CAL-011, `IDEA-PRX-006`).
 *
 * Ein Blatt, das die Patient:in mitnimmt: Datum, Uhrzeit, wo und wer. Kein
 * Status, keine Verordnung, kein Behandlungsinhalt — was nicht darauf gehört,
 * liefert der Server gar nicht erst.
 *
 * **Kein Versand.** Der Zettel wird gedruckt und in die Hand gegeben. Eine
 * Terminliste ist ein Gesundheitsdatum; E-Mail oder SMS setzen einen
 * Dienstleister und eine Einwilligung voraus und hängen an B15 (ANN-039).
 *
 * **Keine Wortmarke.** `marke/README.md` ist dazu ausdrücklich: Die
 * Druckregeln blenden die Kopfzeile aus, und die Marke auf Papier kommt
 * innerhalb der Anwendung erst mit ABR-000 aus den Praxis-Stammdaten. Hier
 * wird deshalb keine zweite Fassung gebaut.
 *
 * Die Druck-Basis aus UI-000 (`@media print` in `src/index.css`) blendet
 * `nav`, `header` und jeden `button` von selbst aus; `.nicht-drucken` nimmt
 * zusätzlich aus, was ein Link ist.
 */
export function AppointmentSlipPage() {
  const { patientId } = useParams<{ patientId: string }>();

  const patient = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => fetchPatient(patientId!),
    enabled: Boolean(patientId),
    retry: false,
  });

  const termine = useQuery({
    queryKey: ['appointment-slip', patientId],
    queryFn: () => fetchAppointmentSlip(patientId!),
    enabled: Boolean(patientId),
    retry: false,
  });

  if (patient.isPending || termine.isPending) {
    return <LoadingState label="Terminzettel wird geladen …" />;
  }
  if (patient.isError || !patient.data || termine.isError) {
    return (
      <ErrorState
        title="Nicht gefunden"
        description="Dieser Datensatz existiert nicht oder ist für Ihren Zugang nicht freigegeben."
      />
    );
  }

  const patientDaten = patient.data;
  const eintraege = termine.data ?? [];

  return (
    <>
      <div className="nicht-drucken">
        <Link
          to={`/patienten/${patientDaten.id}`}
          className="text-ink-muted hover:text-ink mb-4 inline-flex min-h-11 items-center text-sm"
        >
          ← Zurück zur Akte
        </Link>
      </div>

      {/* Bewusst kein PageHeader: Die Überschrift steht auf dem Papier und ist
          an die Patient:in gerichtet, nicht an die bedienende Person. */}
      <section className="max-w-prose">
        <h1 className="text-ink text-xl font-semibold">Ihre nächsten Termine</h1>
        <p className="text-ink-muted mt-1 text-[0.9375rem]">{fullName(patientDaten)}</p>

        {eintraege.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              title="Keine bevorstehenden Termine"
              description="Sobald ein Termin vereinbart ist, steht er hier und lässt sich ausdrucken."
            />
          </div>
        ) : (
          <ul className="divide-line border-line mt-6 divide-y border-t border-b">
            {eintraege.map((eintrag) => (
              <li key={eintrag.id} className="py-3">
                <p className="text-ink text-[0.9375rem] font-medium">
                  {formatLocalDate(eintrag.starts_at, eintrag.organization_time_zone)}
                </p>
                <p className="text-ink mt-0.5 text-[0.9375rem]">
                  {formatLocalTimeRange(
                    eintrag.starts_at,
                    eintrag.ends_at,
                    eintrag.organization_time_zone,
                  )}
                  {' · '}
                  {slipOrt(eintrag)}
                </p>
                <p className="text-ink-muted mt-0.5 text-sm">{staffName(eintrag)}</p>
              </li>
            ))}
          </ul>
        )}

        <p className="text-ink-subtle mt-6 text-xs leading-relaxed">
          Bitte sagen Sie einen Termin rechtzeitig ab, wenn Sie ihn nicht wahrnehmen können.
        </p>
      </section>

      {eintraege.length > 0 ? (
        <div className="mt-8">
          <Button type="button" onClick={() => window.print()}>
            Terminzettel drucken
          </Button>
        </div>
      ) : null}

      <p className="text-ink-subtle nicht-drucken mt-10 max-w-prose text-xs leading-relaxed">
        Der Ausdruck enthält ausschließlich organisatorische Angaben. Er wird nicht versendet — eine
        Terminliste ist ein Gesundheitsdatum und wird persönlich übergeben.
      </p>
    </>
  );
}
