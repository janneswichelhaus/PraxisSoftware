import { useId } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Disclosure } from '@/components/ui/Card';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Section } from '@/components/ui/Section';
import { PasskeyAbschnitt, PinAbschnitt } from '@/features/auth/einrichtung/AnmeldungVerwalten';
import { Benachrichtigungen } from './Benachrichtigungen';
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
 * ohne Namen (ADR-023 Punkt 22). Seit KOM-011 dazu die Benachrichtigungen
 * (ADR-024 Punkt 15). Weitere Einstellungen kommen mit den Loops, die sie
 * brauchen (Check-in TRK-EPIC-001, Anrede D6).
 */
export function Einstellungen({ zugaenge }: { zugaenge: Plattformzugang[] }) {
  const [groesse, setzen] = useSchriftgroesse();
  return (
    <>
      <Rueckweg standard={`${PLATTFORM_PFAD}/ich`} beschriftung="Zu „Ich“" />
      <PageHeader title="Einstellungen" />
      <Section titel="Schriftgröße" rahmen>
        <Schriftwahl groesse={groesse} onWahl={setzen} />
        <p className="text-ink-muted mt-3 max-w-prose text-sm">
          Gilt nur auf diesem Gerät. Auf einem anderen Gerät stellen Sie sie dort ein.
        </p>
      </Section>
      <Benachrichtigungen zugaenge={zugaenge} />
      <Section titel="Was die Praxis für Sie eingestellt hat" rahmen>
        <DetailList>
          <DetailRow label="Anrede">Die Praxis spricht Sie mit „Sie“ an.</DetailRow>
          {zugaenge.map((z) => (
            <EinstiegStand key={z.access_id} zugang={z} mehrere={zugaenge.length > 1} />
          ))}
        </DetailList>
      </Section>
      {/* Anmeldung ohne Kennwort (ADR-025 Fassung 2, Punkte 10 bis 12) - selten
          gebraucht, deshalb auf Abruf (ANN-468). Die Einrichtungspflicht sorgt
          dafür, dass beides im Betrieb schon da ist. */}
      <div className="mt-8">
        <Disclosure inKarte kopf="betont" summary="Passkey und PIN">
          <PasskeyAbschnitt />
          <PinAbschnitt />
        </Disclosure>
      </div>
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
    <DetailRow label={`Einstieg${bereich}`}>
      {data.skipped_at
        ? `Die Praxis hat den Einstieg am ${datum(data.skipped_at)} für Sie übersprungen. Ihre Einwilligungen hat sie dabei nicht berührt.`
        : `Sie haben den Einstieg am ${datum(data.finished_at!)} beendet.`}
    </DetailRow>
  );
}
