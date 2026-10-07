import { useId } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Section } from '@/components/ui/Section';
import { BEREICHSNAME, einstiegSchluessel, ladeEinstieg, type Plattformzugang } from './api';
import { PLATTFORM_PFAD } from './pfade';
import {
  SCHRIFTGROESSEN,
  SCHRIFTGROESSE_NAME,
  useSchriftgroesse,
  type Schriftgroesse,
} from './schriftgroesse';
import { datum } from './zeit';

/**
 * „Ich → Einstellungen" (POR-020; DSN-001 4.1, Abschnitt 5 „Ich";
 * `IDEA-QSN-005`, `IDEA-QSN-006`).
 *
 * Zwei Dinge: die Schriftgröße auf diesem Gerät (ANN-267) und - die
 * sichtbare Coach-Kontrolle - was die Praxis für die Person eingestellt hat.
 * Heute ist das der Einstieg (POR-019); wer übersprungen hat, steht dort
 * ohne Namen (ADR-023 Punkt 22). Weitere Einstellungen kommen mit den Loops,
 * die sie brauchen (Benachrichtigungen ADR-024, Check-in TRK-EPIC-001,
 * Anrede D6).
 */
export function Einstellungen({ zugaenge }: { zugaenge: Plattformzugang[] }) {
  const [groesse, setzen] = useSchriftgroesse();
  return (
    <>
      <Link
        to={`${PLATTFORM_PFAD}/ich`}
        className="text-ink-muted hover:text-ink mb-4 inline-flex min-h-11 items-center text-sm"
      >
        ← Zu „Ich“
      </Link>
      <h1 className="text-accent text-h3 font-bold">Einstellungen</h1>
      <Section titel="Schriftgröße" rahmen>
        <Schriftwahl groesse={groesse} onWahl={setzen} />
        <p className="text-ink-muted mt-3 max-w-prose text-sm">
          Gilt nur auf diesem Gerät. Auf einem anderen Gerät stellen Sie sie dort ein.
        </p>
      </Section>
      <Section titel="Was die Praxis für Sie eingestellt hat" rahmen>
        <ul className="flex flex-col gap-4">
          <li>
            <p className="text-ink text-base font-medium">Anrede</p>
            <p className="text-ink text-base">Die Praxis spricht Sie mit „Sie“ an.</p>
          </li>
          {zugaenge.map((z) => (
            <EinstiegStand key={z.access_id} zugang={z} mehrere={zugaenge.length > 1} />
          ))}
        </ul>
      </Section>
    </>
  );
}

function Schriftwahl({
  groesse,
  onWahl,
}: {
  groesse: Schriftgroesse;
  onWahl: (groesse: Schriftgroesse) => void;
}) {
  const name = useId();
  return (
    <fieldset>
      <legend className="sr-only">Schriftgröße</legend>
      <div className="flex flex-col gap-2">
        {SCHRIFTGROESSEN.map((s) => (
          <label
            key={s}
            className="border-line has-[:checked]:border-accent has-[:checked]:bg-accent-soft rounded-button flex min-h-12 cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 border px-4 py-2"
          >
            <input
              type="radio"
              name={name}
              value={s}
              checked={groesse === s}
              onChange={() => onWahl(s)}
              className="size-5 shrink-0"
            />
            <span className="text-ink text-base">{SCHRIFTGROESSE_NAME[s]}</span>
            {groesse === s ? <span className="text-ink-muted ml-auto text-sm">gewählt</span> : null}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Der Einstieg je Zugang: beendet oder von der Praxis übersprungen. */
function EinstiegStand({ zugang, mehrere }: { zugang: Plattformzugang; mehrere: boolean }) {
  const { data } = useQuery({
    queryKey: einstiegSchluessel(zugang.access_id),
    queryFn: () => ladeEinstieg(zugang.access_id),
    retry: false,
  });
  if (!data || (!data.skipped_at && !data.finished_at)) return null;
  const bereich = mehrere
    ? ` – ${zugang.access_kind === 'self' ? BEREICHSNAME[zugang.relationship_kind] : `für ${zugang.represented_name ?? 'eine andere Person'}`}`
    : '';
  return (
    <li>
      <p className="text-ink text-base font-medium">Einstieg{bereich}</p>
      <p className="text-ink text-base">
        {data.skipped_at
          ? `Die Praxis hat den Einstieg am ${datum(data.skipped_at)} für Sie übersprungen. Ihre Einwilligungen hat sie dabei nicht berührt.`
          : `Sie haben den Einstieg am ${datum(data.finished_at!)} beendet.`}
      </p>
    </li>
  );
}
