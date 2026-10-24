import { useEffect, useId } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { Disclosure } from '@/components/ui/Card';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Section } from '@/components/ui/Section';
import { PasskeyAbschnitt, PinAbschnitt } from '@/features/auth/einrichtung/AnmeldungVerwalten';
import { Benachrichtigungen } from './Benachrichtigungen';
import { BEREICHSNAME, einstiegSchluessel, type Plattformzugang } from './api';
import { usePlattformApi } from './einsicht';
import { BENACHRICHTIGUNGEN_ANKER, PLATTFORM_PFAD } from './pfade';
import {
  SCHRIFTGROESSEN,
  SCHRIFTGROESSE_NAME,
  useSchriftgroesse,
  type Schriftgroesse,
} from './schriftgroesse';
import { useWahl } from './wahl';
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
  // „Mitteilungen einschalten“ auf der Übersicht führt zu den
  // Benachrichtigungen (ANN-702). Der Router rollt nicht von selbst zum Anker.
  const zuDenBenachrichtigungen = useLocation().hash === `#${BENACHRICHTIGUNGEN_ANKER}`;
  const gewaehlt = useWahl(zugaenge.filter((z) => z.readable));
  useEffect(() => {
    if (!zuDenBenachrichtigungen) return;
    document.getElementById(BENACHRICHTIGUNGEN_ANKER)?.scrollIntoView?.({ block: 'start' });
  }, [zuDenBenachrichtigungen]);
  return (
    <>
      <Rueckweg standard={`${PLATTFORM_PFAD}/ich`} beschriftung="Ich" />
      <PageHeader title="Einstellungen" />
      <Section titel="Schriftgröße" rahmen>
        <Schriftwahl groesse={groesse} onWahl={setzen} />
        <p className="text-ink-muted mt-2 max-w-prose text-sm">Gilt nur auf diesem Gerät.</p>
      </Section>
      <Benachrichtigungen
        zugaenge={zugaenge}
        aufgeklappt={zuDenBenachrichtigungen ? gewaehlt?.access_id : undefined}
      />
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

/**
 * Drei Größen als Auswahlknöpfe ohne eigenen Rahmen: Sie stehen schon in der
 * Karte des Abschnitts (DESIGN.md, Regel 2 - kein Kasten im Kasten). Kein
 * `Segment`: Drei Knöpfe nebeneinander passen bei „Sehr groß" und 200 %
 * Vergrößerung nicht in 188 px; untereinander bricht nichts.
 */
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
      <div className="flex flex-col">
        {SCHRIFTGROESSEN.map((s) => (
          <label key={s} className="flex min-h-12 cursor-pointer items-center gap-3">
            <input
              type="radio"
              name={name}
              value={s}
              checked={groesse === s}
              onChange={() => onWahl(s)}
              className="border-line-strong text-accent focus-visible:outline-accent size-5 shrink-0"
            />
            <span className="text-ink text-base">{SCHRIFTGROESSE_NAME[s]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Der Einstieg je Zugang: beendet oder von der Praxis übersprungen. */
function EinstiegStand({ zugang, mehrere }: { zugang: Plattformzugang; mehrere: boolean }) {
  const api = usePlattformApi();
  const { data } = useQuery({
    queryKey: einstiegSchluessel(zugang.access_id),
    queryFn: () => api.ladeEinstieg(zugang.access_id),
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
