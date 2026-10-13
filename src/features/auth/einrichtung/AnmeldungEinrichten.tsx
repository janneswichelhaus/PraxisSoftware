import { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/Feedback';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Vollseite } from '@/app/Vollseite';
import { useFokusNachWechsel } from '../fokus';
import { PASSKEY_SAETZE, PasskeyFehler, passkeyEinrichten, passkeyMoeglich } from '../passkey';
import type { Einrichtungsstand } from './einrichtungsstand';
import { PinFestlegen } from './PinFestlegen';

/**
 * Anmeldung einrichten: Passkey und App-PIN (ADR-025 Fassung 2, Punkt 13).
 *
 * Zwei Schritte in fester Reihenfolge: erst der Passkey auf diesem Gerät,
 * dann die PIN. Ohne Passkey ist die Einrichtung nicht abgeschlossen. In
 * Produktion führt kein Weg daran vorbei (`Einrichtungspflicht`); außerhalb
 * der Produktion darf `onSpaeter` den Schritt auslassen (Punkt 15).
 */
export function AnmeldungEinrichten({
  stand,
  onFertig,
  onAbmelden,
  onSpaeter,
}: {
  stand: Einrichtungsstand;
  onFertig: () => void;
  onAbmelden: () => void;
  /** Nur außerhalb der Produktion. */
  onSpaeter?: (() => void) | undefined;
}) {
  const [passkeyDa, setPasskeyDa] = useState(stand.passkeys > 0);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const fehlerkasten = useRef<HTMLDivElement>(null);
  useFokusNachWechsel(fehler, () => (fehler ? fehlerkasten.current : null));
  const geht = passkeyMoeglich();

  async function einrichten() {
    setFehler(null);
    setLaeuft(true);
    try {
      await passkeyEinrichten();
      setPasskeyDa(true);
      if (stand.pin) onFertig();
    } catch (grund) {
      setFehler(grund instanceof PasskeyFehler ? grund.message : PASSKEY_SAETZE.geraet);
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <Vollseite
      titel="Anmeldung einrichten"
      einleitung="Diese Anwendung kennt kein Kennwort: Sie melden sich mit einem Passkey an – Gesicht, Finger oder die Sperre Ihres Telefons."
      kleingedrucktes="Biometrische Merkmale verlassen Ihr Gerät nicht. Der Anmeldedienst speichert nur den öffentlichen Schlüssel des Passkeys, die Anwendung von der PIN nur eine nicht umkehrbare Prüfsumme."
    >
      {fehler ? (
        <div ref={fehlerkasten} tabIndex={-1} className="mb-4">
          <ErrorState title={fehler} />
        </div>
      ) : null}

      <Section titel="1. Passkey">
        {passkeyDa ? (
          <Statusmeldung ton="erfolg">Auf diesem Konto ist ein Passkey eingerichtet.</Statusmeldung>
        ) : geht ? (
          <Button className="w-full" disabled={laeuft} onClick={() => void einrichten()}>
            {laeuft ? 'Wird eingerichtet …' : 'Passkey auf diesem Gerät einrichten'}
          </Button>
        ) : (
          <Statusmeldung ton="warnung">{PASSKEY_SAETZE.nichtUnterstuetzt}</Statusmeldung>
        )}
      </Section>

      {passkeyDa && !stand.pin ? (
        <Section titel="2. PIN" hinweis="Der Rückweg, wenn der Passkey einmal nicht klappt.">
          <PinFestlegen onGesetzt={onFertig} knopf="PIN festlegen und fertig" />
        </Section>
      ) : null}

      <Kleingedrucktes className="mt-6">
        Richten Sie später in „Mein Konto“ einen zweiten Passkey ein, etwa auf dem Rechner. Geht der
        Passkey verloren, gibt Ihnen die Praxis eine neue Einladung.
      </Kleingedrucktes>

      {onSpaeter ? (
        <Button variant="quiet" className="mt-3 w-full" onClick={onSpaeter}>
          Später einrichten (nur Test-Umgebung)
        </Button>
      ) : null}
      <Button variant="quiet" className="mt-3 w-full" onClick={onAbmelden}>
        Abmelden
      </Button>
    </Vollseite>
  );
}
