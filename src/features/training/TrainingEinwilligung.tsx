import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/Badge';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
import { formatDate } from '@/lib/datum';
import { todayInTimeZone } from '@/features/appointments/api';
import {
  listTrainingConsents,
  recordTrainingConsent,
  trainingConsentKey,
  trainingConsentState,
  type TrainingConsentRecord,
} from './api';

/**
 * Einwilligung zu Angaben zur Gesundheit im Training (POR-017; ADR-021
 * Punkt 4: im Training trägt Art. 9 Abs. 2 lit. h nicht, es braucht die
 * ausdrückliche Einwilligung).
 *
 * Eine Zeile mit dem Stand und, für wer das Verhältnis schreibt, der
 * Vermerk vom Papier. Die Kund:in erteilt und widerruft auch selbst auf der
 * Plattform; ein Widerruf löscht nichts selbst (ANN-264) - was mit den
 * bisherigen Angaben geschieht, klärt die Praxis mit ihr.
 */
export function TrainingEinwilligung({
  relationshipId,
  darfSchreiben,
  zeitzone,
}: {
  relationshipId: string;
  darfSchreiben: boolean;
  zeitzone: string;
}) {
  const vermerke = useQuery({
    queryKey: trainingConsentKey(relationshipId),
    queryFn: () => listTrainingConsents(relationshipId),
  });

  return (
    <Section titel="Einwilligung" rahmen>
      {vermerke.isPending ? (
        <LoadingState label="Einwilligung wird geladen …" />
      ) : vermerke.isError ? (
        <ErrorState
          title="Die Einwilligung konnte nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => void vermerke.refetch()}
        />
      ) : (
        <Inhalt
          relationshipId={relationshipId}
          stand={trainingConsentState(vermerke.data)}
          darfSchreiben={darfSchreiben}
          zeitzone={zeitzone}
        />
      )}
    </Section>
  );
}

function standZeichen(stand: TrainingConsentRecord | null) {
  if (!stand) return <Badge ton="neutral">Nicht erteilt</Badge>;
  const plattform = stand.source === 'platform' ? ' (Plattform)' : '';
  return stand.record_kind === 'consent_granted' ? (
    <Badge ton="positiv">
      Erteilt am {formatDate(stand.occurred_on)}
      {plattform}
    </Badge>
  ) : (
    <Badge ton="warnung">
      Widerrufen am {formatDate(stand.occurred_on)}
      {plattform}
    </Badge>
  );
}

function Inhalt({
  relationshipId,
  stand,
  darfSchreiben,
  zeitzone,
}: {
  relationshipId: string;
  stand: TrainingConsentRecord | null;
  darfSchreiben: boolean;
  zeitzone: string;
}) {
  const queryClient = useQueryClient();
  const heute = todayInTimeZone(zeitzone);
  const [tag, setTag] = useState(heute);
  const erteilt = stand?.record_kind === 'consent_granted';
  const art = erteilt ? 'consent_withdrawn' : 'consent_granted';
  const vermerken = useMutation({
    mutationFn: () => recordTrainingConsent(relationshipId, art, tag),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: trainingConsentKey(relationshipId) }),
  });
  const von =
    stand?.source === 'platform'
      ? stand.representative_name
        ? `Auf der Plattform von ${stand.representative_name} (rechtliche Vertretung).`
        : 'Auf der Plattform von der Person selbst.'
      : null;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-ink text-liste font-medium">Angaben zur Gesundheit</span>
        {standZeichen(stand)}
      </div>
      {von ? <p className="text-ink-muted mt-1 text-sm">{von}</p> : null}
      {stand?.record_kind === 'consent_withdrawn' ? (
        <p className="text-ink-muted mt-1 text-sm">
          Keine neuen Angaben zur Gesundheit festhalten. Was mit den bisherigen geschieht, mit der
          Person klären.
        </p>
      ) : null}
      {darfSchreiben ? (
        <div className="mt-3">
          <Rueckfrage
            ausloeser={erteilt ? 'Widerruf vermerken' : 'Einwilligung vermerken'}
            bestaetigen={erteilt ? 'Widerruf vermerken' : 'Einwilligung vermerken'}
            bestaetigenLaeuft="Wird vermerkt …"
            fehler={vermerken.error?.message}
            onBestaetigen={() => vermerken.mutateAsync()}
            onAbbrechen={() => setTag(heute)}
          >
            <p>
              {erteilt
                ? 'Die Person hat ihre Einwilligung widerrufen, etwa schriftlich oder im Gespräch.'
                : 'Die Person hat auf Papier unterschrieben. Vermerkt wird nur das Datum; das Blatt bleibt Papier.'}
            </p>
            <div className="mt-3 max-w-60">
              <Field
                label={erteilt ? 'Widerrufen am' : 'Unterschrieben am'}
                type="date"
                max={heute}
                value={tag}
                onChange={(event) => setTag(event.target.value)}
              />
            </div>
          </Rueckfrage>
        </div>
      ) : null}
    </>
  );
}
