import { useEffect } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { Disclosure } from '@/components/ui/Card';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Section } from '@/components/ui/Section';
import { Wahlreihe } from '@/components/ui/Wahlreihe';
import {
  PasskeyAbschnitt,
  PinAbschnitt,
} from '@/features/core/auth/einrichtung/AnmeldungVerwalten';
import { Benachrichtigungen } from './Benachrichtigungen';
import {
  BEREICHSNAME,
  einstiegSchluessel,
  ladeEinstieg,
  type Einstiegsstand,
  type Plattformzugang,
} from './api';
import { BENACHRICHTIGUNGEN_ANKER, PLATTFORM_PFAD } from './pfade';
import {
  SCHRIFTGROESSEN,
  SCHRIFTGROESSE_NAME,
  useSchriftgroesse,
  type Schriftgroesse,
} from '@/lib/schriftgroesse';
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
        <p className="text-ink-muted mt-3 max-w-prose text-sm">Gilt nur auf diesem Gerät.</p>
      </Section>
      <Benachrichtigungen
        zugaenge={zugaenge}
        aufgeklappt={zuDenBenachrichtigungen ? gewaehlt?.access_id : undefined}
      />
      {/* Anmeldung ohne Kennwort (ADR-025 Fassung 2, Punkte 10 bis 12) - selten gebraucht,
          deshalb auf Abruf (ANN-468); das Technikwort steht hinter der Beschreibung. */}
      <Section titel="Anmeldung" rahmen>
        <p className="text-ink max-w-prose text-base">
          Sie melden sich mit Gesicht, Finger oder Ihrer PIN an und brauchen kein Kennwort.
        </p>
        <div className="mt-3">
          <Disclosure summary="Geräte (Passkeys) und PIN verwalten">
            <PasskeyAbschnitt />
            <PinAbschnitt />
          </Disclosure>
        </div>
      </Section>
      <VonDerPraxis zugaenge={zugaenge} />
    </>
  );
}

/**
 * Die Größe gilt sofort für die ganze Plattform; die Vorschau zeigt sie an einem Satz, wie er auf
 * der Übersicht stünde. Bei „Sehr groß“ und 200 % steht jede Wahl in einer eigenen Zeile.
 */
function Schriftwahl({
  groesse,
  onWahl,
}: {
  groesse: Schriftgroesse;
  onWahl: (groesse: Schriftgroesse) => void;
}) {
  return (
    <>
      <div
        aria-hidden="true"
        className="bg-surface-sunken rounded-button mb-4 flex items-center gap-4 px-4 py-3"
      >
        <span className="text-ink shrink-0 text-3xl leading-none font-semibold whitespace-nowrap">
          Aa
        </span>
        <span className="text-ink text-base">Ihr nächster Besuch: Dienstag um 9:30 Uhr.</span>
      </div>
      <Wahlreihe
        legende="Schriftgröße"
        legendeSichtbar={false}
        gleichgewichtet
        wahlen={SCHRIFTGROESSEN.map((s) => ({ wert: s, text: SCHRIFTGROESSE_NAME[s] }))}
        gewaehlt={groesse}
        onWaehlen={onWahl}
      />
    </>
  );
}

/**
 * Die sichtbare Coach-Kontrolle, heute der Einstieg je Zugang. Ohne Eintrag kein Abschnitt; die
 * Anrede „Sie“ gilt für alle und steht deshalb nicht mehr da (ANN-860).
 */
function VonDerPraxis({ zugaenge }: { zugaenge: Plattformzugang[] }) {
  const staende = useQueries({
    queries: zugaenge.map((z) => ({
      queryKey: einstiegSchluessel(z.access_id),
      queryFn: () => ladeEinstieg(z.access_id),
      retry: false,
    })),
  });
  const zeilen = zugaenge.flatMap((z, i) => {
    const data = staende[i]?.data;
    return data && (data.skipped_at || data.finished_at)
      ? [<EinstiegStand key={z.access_id} zugang={z} stand={data} mehrere={zugaenge.length > 1} />]
      : [];
  });
  if (zeilen.length === 0) return null;
  return (
    <Section titel="Was die Praxis für Sie eingestellt hat" rahmen>
      <DetailList>{zeilen}</DetailList>
    </Section>
  );
}

/** Der Einstieg je Zugang: beendet oder von der Praxis übersprungen. */
function EinstiegStand({
  zugang,
  stand: data,
  mehrere,
}: {
  zugang: Plattformzugang;
  stand: Einstiegsstand;
  mehrere: boolean;
}) {
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
