import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Vollseite } from '@/app/Vollseite';
import { ANMELDESAETZE } from '../anmeldefehler';
import { PIN_LAENGE, gibMitPinFrei, hatPin } from '../appPin';
import { useFokusNachWechsel } from '../fokus';
import { PasskeyFehler, anmeldenMitPasskey, passkeyMoeglich } from '../passkey';
import { SPERRFRISTEN, type Sperrgrund } from './sperrstand';

/**
 * Die Sperrseite (ADR-025 Fassung 2, Punkte 3, 7 und 11).
 *
 * Ohne Namen, ohne Akte, ohne Termin - auch die E-Mail-Adresse steht nicht da.
 * Freigegeben wird **immer zuerst mit dem Passkey** des eigenen Kontos. Die
 * App-PIN ist nur der Rückweg, wenn der Passkey nicht klappt: Sie erscheint
 * erst auf „Passkey klappt nicht?“, und keine Uhr wechselt den Weg (Jannes,
 * 2026-10-10). Ein Kennwort gibt es hier nicht, auch nicht für Testkonten
 * (Punkt 15).
 *
 * Liefert der Passkey ein anderes Konto, ist das ein Kontowechsel und keine
 * Freigabe (Punkt 7): Der `SessionProvider` räumt, und `App` hängt die
 * Sperre mit der Kennung neu ein - eine festgehaltene Seite fällt weg.
 *
 * Nach fünf falschen PINs ist die Sitzung verbraucht (ANN-324): Die Seite
 * sagt es und führt zur Anmeldung.
 */
type Ansicht = 'passkey' | 'pin' | 'verbraucht';

const PIN_FELD = 'sperre-pin';

function restSatz(uebrig: number): string {
  if (uebrig === 1) return 'Die PIN passt nicht. Noch ein Versuch, danach ist die Sitzung beendet.';
  return `Die PIN passt nicht. Noch ${uebrig} Versuche.`;
}

export function Sperrseite({
  grund,
  haelt,
  onEntsperrt,
  onAbmelden,
}: {
  grund: Sperrgrund;
  /** Eine Seite mit ungesichertem Text wartet verborgen (Punkt 4). */
  haelt: boolean;
  onEntsperrt: () => void;
  onAbmelden: () => void;
}) {
  const passkeyGeht = passkeyMoeglich();
  const [ansicht, setAnsicht] = useState<Ansicht>(
    grund === 'verbraucht' ? 'verbraucht' : 'passkey',
  );
  const [pinDa, setPinDa] = useState<boolean | null>(null);
  const [pin, setPin] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const fehlerkasten = useRef<HTMLDivElement>(null);
  const passkeyKnopf = useRef<HTMLButtonElement>(null);
  useFokusNachWechsel(fehler, () => (fehler ? fehlerkasten.current : null));

  // Ob es eine PIN gibt, fragt die Seite den Server - auch gesperrt erlaubt.
  useEffect(() => {
    let aktiv = true;
    hatPin().then(
      (da) => {
        if (aktiv) setPinDa(da);
      },
      () => {
        // Ohne Antwort bleibt der Rückweg verborgen; der Passkey geht trotzdem.
        if (aktiv) setPinDa(false);
      },
    );
    return () => {
      aktiv = false;
    };
  }, []);

  // Ohne Passkey-fähigen Browser geht es direkt zur PIN, sobald es eine gibt.
  useEffect(() => {
    if (!passkeyGeht && pinDa && ansicht === 'passkey') setAnsicht('pin');
  }, [passkeyGeht, pinDa, ansicht]);

  // Der Fokus steht dort, wo es weitergeht.
  useEffect(() => {
    if (ansicht === 'pin') document.getElementById(PIN_FELD)?.focus();
    if (ansicht === 'passkey') passkeyKnopf.current?.focus();
  }, [ansicht]);

  async function mitPasskey() {
    setFehler(null);
    setLaeuft(true);
    try {
      await anmeldenMitPasskey();
      onEntsperrt();
    } catch (grundDesFehlers) {
      setFehler(
        grundDesFehlers instanceof PasskeyFehler
          ? grundDesFehlers.message
          : ANMELDESAETZE.keineVerbindung,
      );
    } finally {
      setLaeuft(false);
    }
  }

  async function mitPin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pin.length !== PIN_LAENGE) return;
    setFehler(null);
    setLaeuft(true);
    try {
      const ergebnis = await gibMitPinFrei(pin);
      setPin('');
      if (ergebnis.art === 'frei') onEntsperrt();
      else if (ergebnis.art === 'verbraucht') setAnsicht('verbraucht');
      else setFehler(restSatz(ergebnis.versucheUebrig));
    } catch {
      // Ein Funkloch ist keine falsche PIN (BEF-047) und zählt keinen Versuch.
      setFehler(ANMELDESAETZE.keineVerbindung);
    } finally {
      setLaeuft(false);
    }
  }

  const anlass =
    grund === 'hoechstdauer'
      ? `Nach ${SPERRFRISTEN.hoechstMinuten} Minuten ist eine erneute Freigabe nötig.`
      : grund === 'inaktiv'
        ? `Nach ${SPERRFRISTEN.inaktivMinuten} Minuten ohne Bedienung hat sich die Anwendung gesperrt.`
        : 'Die Anwendung hat sich gesperrt.';

  if (ansicht === 'verbraucht') {
    return (
      <Vollseite
        titel="Gesperrt"
        kleingedrucktes="Die Sperre schützt die Daten, wenn das Gerät in falsche Hände gerät."
      >
        <ErrorState
          title="Zu viele falsche PINs. Die Sitzung ist beendet."
          description={
            haelt
              ? 'Bitte mit dem Passkey neu anmelden. Die Eingabe, die sich nicht sichern ließ, ist nicht erhalten.'
              : 'Bitte mit dem Passkey neu anmelden.'
          }
        />
        <Button className="mt-4 w-full" onClick={onAbmelden}>
          Zur Anmeldung
        </Button>
      </Vollseite>
    );
  }

  return (
    <Vollseite
      titel="Gesperrt"
      einleitung={`${anlass} Mit Ihrem Passkey geht es an derselben Stelle weiter.`}
      kleingedrucktes={
        haelt
          ? 'Eine Eingabe ließ sich nicht sichern. Sie steht nach dem Entsperren wieder da – bitte dann speichern. Wer sich mit einem anderen Konto anmeldet, verwirft sie.'
          : 'Offene Texte wurden vor der Sperre als Entwurf gesichert. Die Sperre schützt die Daten, wenn das Gerät liegen bleibt.'
      }
    >
      {fehler ? (
        <div ref={fehlerkasten} tabIndex={-1} className="mb-4">
          <ErrorState title={fehler} />
        </div>
      ) : null}

      {ansicht === 'passkey' ? (
        <div className="flex flex-col gap-3">
          {passkeyGeht ? (
            <Button ref={passkeyKnopf} disabled={laeuft} onClick={() => void mitPasskey()}>
              {laeuft ? 'Wird geprüft …' : 'Mit Passkey entsperren'}
            </Button>
          ) : (
            <p className="text-ink-muted text-sm leading-relaxed">
              Dieser Browser unterstützt keine Passkeys.
            </p>
          )}
          {pinDa ? (
            <Button
              variant="quiet"
              onClick={() => {
                setFehler(null);
                setAnsicht('pin');
              }}
            >
              Passkey klappt nicht?
            </Button>
          ) : null}
        </div>
      ) : (
        <form onSubmit={(event) => void mitPin(event)} noValidate className="flex flex-col gap-4">
          {passkeyGeht ? null : (
            <p className="text-ink-muted text-sm leading-relaxed">
              Dieser Browser unterstützt keine Passkeys. Entsperren geht hier mit der PIN.
            </p>
          )}
          <Field
            label="PIN"
            hint="Die PIN der Anwendung, nicht die des Telefons."
            type="password"
            geheimnis="PIN"
            name="pin"
            inputMode="numeric"
            autoComplete="off"
            maxLength={PIN_LAENGE}
            feldId={PIN_FELD}
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, PIN_LAENGE))}
          />
          <Button type="submit" disabled={laeuft || pin.length !== PIN_LAENGE}>
            {laeuft ? 'Wird geprüft …' : 'Mit PIN entsperren'}
          </Button>
          {passkeyGeht ? (
            <Button
              type="button"
              variant="quiet"
              onClick={() => {
                setFehler(null);
                setPin('');
                setAnsicht('passkey');
              }}
            >
              Doch mit Passkey
            </Button>
          ) : null}
        </form>
      )}

      <Button variant="quiet" className="mt-3 w-full" onClick={onAbmelden}>
        Mit anderem Konto anmelden
      </Button>
    </Vollseite>
  );
}
