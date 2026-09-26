import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { DetailRow } from '@/components/ui/DetailList';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import {
  canReadTreatmentNote,
  canWriteTreatmentNote,
  type CurrentUser,
} from '@/features/session/types';
import { formatDate } from '@/lib/datum';
import {
  berichtAnlegen,
  berichteQueryKey,
  empfehlungDerVerordnung,
  type Berichtszeile,
} from './api';

/**
 * Die Empfehlung zum Verordnungsende, wie sie an der Verordnung steht — aus
 * dem jüngsten abgeschlossenen Bericht, **mit Quelle und Datum** (ANN-014).
 * Die Anwendung schreibt, ergänzt und bewertet sie nicht.
 */
export function EmpfehlungAusBericht({
  berichte,
  verordnungId,
}: {
  berichte: readonly Berichtszeile[];
  verordnungId: string;
}) {
  const quelle = empfehlungDerVerordnung(berichte, verordnungId);
  if (!quelle?.recommendation) return null;
  const herkunft = [
    quelle.recommendation_by_name,
    quelle.recommendation_on ? formatDate(quelle.recommendation_on) : null,
    'aus dem Therapiebericht',
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <DetailRow label="Empfehlung der Therapeut:in zum Verordnungsende">
      <span className="whitespace-pre-line">{quelle.recommendation}</span>
      <span className="text-ink-muted mt-0.5 block text-xs">{herkunft}</span>
    </DetailRow>
  );
}

/**
 * Die Therapieberichte an einer Verordnung und der Weg zu einem neuen (DOK-005).
 *
 * Ein Entwurf führt zum Weiterschreiben, ein abgeschlossener Bericht zum
 * Druckblatt. Office liest und druckt, schreibt aber nicht (ADR-004 Punkt 3,
 * ADR-016 Punkt 1) — der Knopf fehlt dort, verbindlich prüft es der Server.
 */
export function BerichteDerVerordnung({
  patientId,
  verordnungId,
  berichte,
  user,
}: {
  patientId: string;
  verordnungId: string;
  berichte: readonly Berichtszeile[];
  user: CurrentUser;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const darfSchreiben = canWriteTreatmentNote(user.roles);
  const eigene = berichte.filter((b) => b.treatment_basis_id === verordnungId);

  const anlegen = useMutation({
    mutationFn: () => berichtAnlegen(verordnungId),
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: berichteQueryKey(patientId) });
      void navigate(`/patienten/${patientId}/berichte/${id}`);
    },
  });

  if (!canReadTreatmentNote(user.roles)) return null;
  if (eigene.length === 0 && !darfSchreiben) return null;

  return (
    <div className="border-line mt-3 border-t pt-3">
      <p className="text-ink text-sm font-medium">Therapiebericht an die Verordner:in</p>
      {eigene.length > 0 ? (
        <ul className="mt-1 flex flex-col">
          {eigene.map((bericht) => {
            const entwurf = bericht.status === 'entwurf';
            const ziel =
              entwurf && darfSchreiben
                ? `/patienten/${patientId}/berichte/${bericht.id}`
                : `/patienten/${patientId}/berichte/${bericht.id}/druck`;
            return (
              <li key={bericht.id}>
                <Link
                  to={ziel}
                  className="text-accent inline-flex min-h-11 items-center text-sm hover:underline"
                >
                  {entwurf
                    ? `Entwurf${bericht.author_name ? ` von ${bericht.author_name}` : ''}`
                    : `Bericht vom ${formatDate(bericht.completed_on)}${
                        bericht.completed_by_name ? ` · ${bericht.completed_by_name}` : ''
                      }`}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
      {darfSchreiben ? (
        <div className="mt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => anlegen.mutate()}
            disabled={anlegen.isPending}
          >
            {anlegen.isPending ? 'Wird angelegt …' : 'Therapiebericht schreiben'}
          </Button>
          {anlegen.isError ? (
            <Statusmeldung ton="fehler" className="mt-2">
              {anlegen.error.message}
            </Statusmeldung>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
