import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Vollseite } from '@/app/Vollseite';
import { GESPERRT_TITEL } from '@/app/tabtitel';
import { SCHLOSS } from '@/app/tuerzeichen';
import { ANMELDESAETZE } from '../anmeldefehler';
import { PIN_LAENGE, gibMitPinFrei, hatPin } from '../appPin';
import { ZIFFERNFELD } from '../einrichtung/PinFestlegen';
import { useFokusNachWechsel } from '../fokus';
import { PasskeyFehler, anmeldenMitPasskey, passkeyMoeglich } from '../passkey';
import { usePasskeyVonSelbst } from '../passkeyVonSelbst';
import { SPERRFRISTEN } from './sperrstand';

/**
 * Die Sperrseite der Plattform (Handoff 2026-10-22, Abschnitt 5.2; ADR-025
 * Fassung 2, Punkte 3, 7 und 11). Die Praxis behält ihre `Sperrseite`.
 *
 * Was gleich bleibt: keine Angaben zur Person - kein Name, keine Adresse,
 * auch nicht der eigene (Punkt 3) -, das Passkey-Fenster öffnet sich von
 * selbst, fünf falsche PINs beenden die Anmeldung (ANN-324), ein Passkey
 * eines anderen Zugangs ist ein Wechsel und keine Freigabe (Punkt 7).
 *
 * Was anders ist: Passkey und PIN stehen als zwei gleich sichtbare Wege
 * nebeneinander; die PIN hat eine eigene Seite mit „Zurück“, damit das Feld
 * über der Tastatur Platz hat. Welche Fassung gilt, entscheidet die Marke
 * des Kontos in der Sitzung (`platform_account`, ANN-687) - gesperrt gibt es
 * keine Daten, aus denen es sich sonst ablesen ließe.
 */

const PIN_FELD = 'sperre-pin';

function restSatz(uebrig: number): string {
  if (uebrig === 1) {
    return 'Die PIN passt nicht. Noch ein Versuch – danach melden Sie sich mit dem Passkey neu an.';
  }
  return `Die PIN passt nicht. Noch ${uebrig} Versuche.`;
}

/** „eine Stunde“ statt „60 Minuten“, wie der Handoff es sagt. */
function dauer(minuten: number): string {
  return minuten === 60 ? 'eine Stunde' : `${minuten} Minuten`;
}

const KLEINGEDRUCKTES = `Die Plattform sperrt sich nach ${SPERRFRISTEN.inaktivMinuten} Minuten ohne Bedienung und spätestens ${dauer(SPERRFRISTEN.hoechstMinuten)} nach der Anmeldung. Das schützt Ihre Daten, wenn das Telefon liegen bleibt.`;

export function PlattformSperrseite({
  haelt,
  onEntsperrt,
  onAbmelden,
  verbrauchtAnfangs = false,
}: {
  /** Eine Seite mit ungesichertem Text wartet verborgen (Punkt 4). */
  haelt: boolean;
  onEntsperrt: () => void;
  onAbmelden: () => void;
  /** Die Anmeldung ist schon verbraucht (fünf falsche PINs). */
  verbrauchtAnfangs?: boolean;
}) {
  const passkeyGeht = passkeyMoeglich();
  const [verbraucht, setVerbraucht] = useState(verbrauchtAnfangs);
  const [pinDa, setPinDa] = useState<boolean | null>(null);
  const [mitPinSeite, setMitPinSeite] = useState(false);
  const [pin, setPin] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  // Getrennt: Ein offenes Passkey-Fenster sperrt die PIN dahinter nicht.
  const [passkeyLaeuft, setPasskeyLaeuft] = useState(false);
  const [pinLaeuft, setPinLaeuft] = useState(false);
  const fehlerkasten = useRef<HTMLDivElement>(null);
  const passkeyKnopf = useRef<HTMLButtonElement>(null);
  const pinKnopf = useRef<HTMLButtonElement>(null);
  useFokusNachWechsel(fehler, () => (fehler ? fehlerkasten.current : null));
  useFokusNachWechsel(mitPinSeite, () =>
    mitPinSeite ? document.getElementById(PIN_FELD) : pinKnopf.current,
  );

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

  // Der Fokus steht dort, wo es nach dem Passkey-Fenster weitergeht.
  useEffect(() => {
    if (verbraucht || pinDa === null) return;
    if (passkeyGeht) passkeyKnopf.current?.focus();
    else pinKnopf.current?.focus();
  }, [pinDa, verbraucht, passkeyGeht]);

  async function mitPasskey(vonSelbst = false) {
    setFehler(null);
    setPasskeyLaeuft(true);
    try {
      await anmeldenMitPasskey();
      onEntsperrt();
    } catch (grund) {
      // Den ungefragten Start schließt man einfach; das ist kein Fehler.
      if (!vonSelbst) {
        setFehler(grund instanceof PasskeyFehler ? grund.message : ANMELDESAETZE.keineVerbindung);
      }
    } finally {
      setPasskeyLaeuft(false);
    }
  }

  usePasskeyVonSelbst(() => mitPasskey(true), passkeyGeht && !verbraucht);

  async function mitPin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pin.length !== PIN_LAENGE || pinLaeuft) return;
    setFehler(null);
    setPinLaeuft(true);
    try {
      const ergebnis = await gibMitPinFrei(pin);
      setPin('');
      if (ergebnis.art === 'frei') onEntsperrt();
      else if (ergebnis.art === 'verbraucht') setVerbraucht(true);
      else setFehler(restSatz(ergebnis.versucheUebrig));
    } catch {
      // Ein Funkloch ist keine falsche PIN (BEF-047) und zählt keinen Versuch.
      setFehler(ANMELDESAETZE.keineVerbindung);
    } finally {
      setPinLaeuft(false);
    }
  }

  const fehlerElement = fehler ? (
    <div ref={fehlerkasten} tabIndex={-1} className="mb-4 focus:outline-none">
      <Statusmeldung ton="fehler">{fehler}</Statusmeldung>
    </div>
  ) : null;

  if (verbraucht) {
    return (
      <Vollseite
        tabtitel={GESPERRT_TITEL}
        zeichen={SCHLOSS}
        zeichenAufMarke
        titel="Bitte neu anmelden"
        einleitung={
          haelt
            ? 'Die PIN wurde zu oft falsch eingegeben. Melden Sie sich mit Ihrem Passkey neu an. Die Eingabe, die sich nicht sichern ließ, ist nicht erhalten.'
            : 'Die PIN wurde zu oft falsch eingegeben. Melden Sie sich mit Ihrem Passkey neu an.'
        }
        kleingedrucktes={KLEINGEDRUCKTES}
      >
        <Button onClick={onAbmelden}>Mit Passkey anmelden</Button>
      </Vollseite>
    );
  }

  if (mitPinSeite) {
    return (
      <Vollseite
        tabtitel={GESPERRT_TITEL}
        oben={
          <div className="-ml-3">
            <Button
              variant="quiet"
              groesse="kompakt"
              onClick={() => {
                setFehler(null);
                setPin('');
                setMitPinSeite(false);
              }}
            >
              ← Zurück
            </Button>
          </div>
        }
        titel="Mit PIN entsperren"
      >
        {fehlerElement}
        <form onSubmit={(event) => void mitPin(event)} noValidate className="flex flex-col gap-6">
          <Field
            label="PIN"
            hint="Die PIN von Own Motion, nicht die Ihres Telefons."
            type="password"
            geheimnis="PIN"
            name="pin"
            inputMode="numeric"
            autoComplete="off"
            maxLength={PIN_LAENGE}
            feldId={PIN_FELD}
            value={pin}
            className={ZIFFERNFELD}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, PIN_LAENGE))}
          />
          <Button type="submit" disabled={pinLaeuft || pin.length !== PIN_LAENGE}>
            {pinLaeuft ? 'Wird geprüft …' : 'Entsperren'}
          </Button>
        </form>
      </Vollseite>
    );
  }

  return (
    <Vollseite
      tabtitel={GESPERRT_TITEL}
      zeichen={SCHLOSS}
      zeichenAufMarke
      titel="Zum Schutz gesperrt"
      einleitung={
        haelt
          ? 'Eine Eingabe ließ sich nicht sichern. Sie steht nach dem Entsperren wieder da – bitte dann speichern. Wer sich mit einem anderen Zugang anmeldet, verwirft sie.'
          : pinDa === false
            ? 'Offene Texte sind als Entwurf gesichert. Entsperren Sie mit Gesicht oder Finger.'
            : 'Offene Texte sind als Entwurf gesichert. Entsperren Sie mit Gesicht, Finger oder Ihrer PIN.'
      }
      kleingedrucktes={KLEINGEDRUCKTES}
    >
      {fehlerElement}
      <div className="flex flex-col gap-3">
        {passkeyGeht ? (
          <Button ref={passkeyKnopf} disabled={passkeyLaeuft} onClick={() => void mitPasskey()}>
            {passkeyLaeuft ? 'Wird geprüft …' : 'Mit Passkey entsperren'}
          </Button>
        ) : (
          <Statusmeldung ton="warnung">
            {pinDa
              ? 'Dieser Browser kann keine Passkeys. Entsperren geht hier mit der PIN.'
              : 'Dieser Browser kann keine Passkeys.'}
          </Statusmeldung>
        )}
        {pinDa ? (
          <Button
            ref={pinKnopf}
            variant={passkeyGeht ? 'secondary' : 'primary'}
            onClick={() => {
              setFehler(null);
              setMitPinSeite(true);
            }}
          >
            Mit PIN entsperren
          </Button>
        ) : null}
        {/* Wer sich anders anmeldet, verwirft eine festgehaltene Eingabe
            (ANN-257): dann erst nach einer Rückfrage (PLATTFORM.md,
            Zerstörendes mit Rückfrage). Ohne sie ist alles als Entwurf
            gesichert, und es geht gleich. */}
        <div className="mt-2 flex flex-col">
          {haelt ? (
            <Rueckfrage
              ausloeser="Mit anderem Zugang anmelden"
              ausloeserVariante="quiet"
              ausloeserBreit
              bestaetigen="Verwerfen und abmelden"
              abbrechen="Zurück"
              onBestaetigen={onAbmelden}
            >
              Die Eingabe, die sich nicht sichern ließ, geht dabei verloren.
            </Rueckfrage>
          ) : (
            <Button variant="quiet" onClick={onAbmelden}>
              Mit anderem Zugang anmelden
            </Button>
          )}
        </div>
      </div>
    </Vollseite>
  );
}
