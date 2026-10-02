import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { DetailRow } from '@/components/ui/DetailList';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { TextArea } from '@/components/ui/TextArea';
import {
  canReadTreatmentNote,
  canWriteTreatmentNote,
  type CurrentUser,
} from '@/features/session/types';
import { formatDate } from '@/lib/datum';
import {
  GRUND_MAX,
  GRUND_MIN,
  berichtAnlegen,
  berichtKorrigieren,
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
 *
 * **Ein angefangener Entwurf geht vor (DOK-11).** Der Knopf „Therapiebericht
 * schreiben“ stand immer da, auch neben einem Entwurf, und legte jedes Mal
 * einen neuen, leeren an - wer weiterschreiben wollte, tippte eher ihn und
 * verteilte den Text auf zwei Entwürfe. Gibt es einen Entwurf, führt der
 * Knopf jetzt zu ihm; ein neuer Bericht bleibt als leiser Weg daneben. Der
 * Bericht ist an der Karte eine seltene Aktion und deshalb kompakt (VER-01).
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
  // Der jüngste Entwurf dieser Verordnung - dorthin führt „Entwurf
  // weiterschreiben“. Die Zeitstempel kommen einheitlich aus PostgREST und
  // lassen sich deshalb als Zeichenkette vergleichen.
  const juengsterEntwurf = eigene
    .filter((b) => b.status === 'entwurf')
    .reduce<Berichtszeile | null>(
      (juengster, b) => (!juengster || b.created_at > juengster.created_at ? b : juengster),
      null,
    );

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
                    ? `${bericht.supersedes_report_id ? 'Korrektur im Entwurf' : 'Entwurf'}${
                        bericht.author_name ? ` von ${bericht.author_name}` : ''
                      }`
                    : `${bericht.supersedes_report_id ? 'Korrektur' : 'Bericht'} vom ${formatDate(
                        bericht.completed_on,
                      )}${bericht.completed_by_name ? ` · ${bericht.completed_by_name}` : ''}`}
                </Link>
                {/* ABN-016 (BEF-104): die Kette, sichtbar an der Verordnung. */}
                {bericht.superseded_by_report_id ? (
                  <span className="text-ink-muted text-sm"> · ersetzt durch Korrektur</span>
                ) : null}
                {bericht.change_reason ? (
                  <span className="text-ink-muted block text-sm">
                    Grund der Korrektur: {bericht.change_reason}
                  </span>
                ) : null}
                {darfSchreiben && !entwurf && !bericht.superseded_by_report_id ? (
                  <Korrigieren
                    patientId={patientId}
                    verordnungId={verordnungId}
                    berichtId={bericht.id}
                    datum={formatDate(bericht.completed_on)}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {darfSchreiben ? (
        <div className="mt-2">
          <div className="flex flex-wrap items-center gap-3">
            {juengsterEntwurf ? (
              <ButtonLink
                to={`/patienten/${patientId}/berichte/${juengsterEntwurf.id}`}
                variant="secondary"
                groesse="kompakt"
              >
                Entwurf weiterschreiben
              </ButtonLink>
            ) : null}
            <Button
              type="button"
              variant="quiet"
              groesse="kompakt"
              onClick={() => anlegen.mutate()}
              disabled={anlegen.isPending}
            >
              {anlegen.isPending
                ? 'Wird angelegt …'
                : juengsterEntwurf
                  ? 'Neuen Bericht anlegen'
                  : 'Therapiebericht schreiben'}
            </Button>
          </div>
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

/**
 * Einen abgeschlossenen Bericht korrigieren (ABN-016, BEF-104): mit Grund, als
 * neuer Bericht derselben Verordnung, der auf den ersetzten verweist. Der
 * ersetzte bleibt unverändert und lesbar.
 */
function Korrigieren({
  patientId,
  verordnungId,
  berichtId,
  datum,
}: {
  patientId: string;
  verordnungId: string;
  berichtId: string;
  datum: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [offen, setOffen] = useState(false);
  const [grund, setGrund] = useState('');
  const [fehler, setFehler] = useState<string | undefined>(undefined);
  const korrigieren = useMutation({
    mutationFn: () => berichtKorrigieren(verordnungId, berichtId, grund),
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: berichteQueryKey(patientId) });
      void navigate(`/patienten/${patientId}/berichte/${id}`);
    },
  });

  if (!offen) {
    return (
      <Button type="button" variant="quiet" groesse="kompakt" onClick={() => setOffen(true)}>
        Korrigieren
      </Button>
    );
  }
  return (
    <form
      noValidate
      className="border-line rounded-card mt-1 mb-2 flex flex-col gap-2 border p-3"
      aria-label={`Bericht vom ${datum} korrigieren`}
      onSubmit={(e) => {
        e.preventDefault();
        if (grund.trim().length < GRUND_MIN) {
          setFehler('Bitte den Grund der Korrektur angeben.');
          return;
        }
        korrigieren.mutate();
      }}
    >
      <TextArea
        label="Grund der Korrektur"
        hint="Der Bericht vom bisherigen Tag bleibt unverändert. Die Korrektur verweist auf ihn und nennt diesen Grund."
        rows={2}
        maxLength={GRUND_MAX}
        required
        error={fehler}
        value={grund}
        onChange={(e) => {
          setGrund(e.target.value);
          setFehler(undefined);
        }}
      />
      {korrigieren.isError ? (
        <Statusmeldung ton="fehler">{korrigieren.error.message}</Statusmeldung>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" groesse="kompakt" disabled={korrigieren.isPending}>
          {korrigieren.isPending ? 'Wird angelegt …' : 'Korrektur anlegen'}
        </Button>
        <Button
          type="button"
          variant="quiet"
          groesse="kompakt"
          onClick={() => {
            setOffen(false);
            setGrund('');
            setFehler(undefined);
          }}
        >
          Abbrechen
        </Button>
      </div>
    </form>
  );
}
