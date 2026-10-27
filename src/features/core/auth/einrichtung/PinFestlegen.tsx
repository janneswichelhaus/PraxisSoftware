import { useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { useFokusNachWechsel } from '../fokus';
import { ErneutAnmeldenError, PIN_LAENGE, PIN_SAETZE, pinProblem, setzePin } from '../appPin';
import { PasskeyFehler, anmeldenMitPasskey } from '../passkey';
import { getSupabase } from '@/lib/supabase';

const FELD_PIN = 'pin-neu';
const FELD_WIEDERHOLUNG = 'pin-neu-wiederholung';

function nurZiffern(wert: string): string {
  return wert.replace(/\D/g, '').slice(0, PIN_LAENGE);
}

/** Das Ziffernfeld der PIN: 56 hoch, Ziffern 28 mittig mit Laufweite (Handoff 5.2). */
export const ZIFFERNFELD = 'min-h-14 text-center text-[1.75rem] tracking-[0.6em]';

/**
 * Die App-PIN festlegen oder ändern (ADR-025 Punkt 11).
 *
 * Der Server nimmt eine PIN nur kurz nach einer Anmeldung an (ANN-325). Liegt
 * sie länger zurück, bestätigt sich die Person hier mit dem Passkey, und die
 * eingegebene PIN wird danach gesetzt - ohne erneutes Tippen.
 *
 * In der Einrichtung nach der Einladung (`formular`) heißen die Felder wie
 * im Handoff 2026-10-22 (Abschnitt 5.2): „PIN“ und „PIN noch einmal“, groß
 * und mittig wie ein Ziffernfeld. Der Hauptknopf steht dann im Fuß des
 * geführten Ablaufs und sendet über `form` dieses Formular ab.
 *
 * Die Felder bieten die PIN keinem Passwortmanager an (`autocomplete="off"`):
 * Sie liegt nie auf dem Gerät (ADR-025 Punkt 11). Der Handoff nennt
 * `new-password`; das hieße zusammen mit der Adresse davor „Konto anlegen“,
 * und der Manager böte das Speichern an (ANN-689).
 */
export function PinFestlegen({
  onGesetzt,
  knopf = 'PIN festlegen',
  formular,
}: {
  onGesetzt: () => void;
  knopf?: string;
  /** Kennung des Formulars, wenn der Knopf außerhalb steht (Einrichtung). */
  formular?: string;
}) {
  const [pin, setPin] = useState('');
  const [wiederholung, setWiederholung] = useState('');
  const [feldfehler, setFeldfehler] = useState<{
    feld: 'pin' | 'wiederholung';
    satz: string;
  } | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [bestaetigen, setBestaetigen] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const fehlerkasten = useRef<HTMLDivElement>(null);
  useFokusNachWechsel(fehler, () => (fehler ? fehlerkasten.current : null));

  async function setzen() {
    setLaeuft(true);
    setFehler(null);
    try {
      await setzePin(pin);
      setPin('');
      setWiederholung('');
      setBestaetigen(false);
      onGesetzt();
    } catch (grund) {
      if (grund instanceof ErneutAnmeldenError) setBestaetigen(true);
      else setFehler(grund instanceof Error ? grund.message : PIN_SAETZE.nichtGesetzt);
    } finally {
      setLaeuft(false);
    }
  }

  function absenden(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (laeuft) return;
    const problem = pinProblem(pin);
    if (problem) {
      setFeldfehler({ feld: 'pin', satz: PIN_SAETZE[problem] });
      document.getElementById(FELD_PIN)?.focus();
      return;
    }
    if (pin !== wiederholung) {
      setFeldfehler({ feld: 'wiederholung', satz: PIN_SAETZE.ungleich });
      document.getElementById(FELD_WIEDERHOLUNG)?.focus();
      return;
    }
    setFeldfehler(null);
    void setzen();
  }

  async function mitPasskeyBestaetigen() {
    setLaeuft(true);
    setFehler(null);
    // Ein Passkey eines anderen Kontos ist ein Kontowechsel, keine Bestätigung
    // (ADR-025 Punkt 7): Dann wird keine PIN gesetzt (Zweitreview, Befund 5).
    let vorher: string | undefined;
    try {
      vorher = (await getSupabase().auth.getSession()).data.session?.user.id;
      await anmeldenMitPasskey();
    } catch (grund) {
      setFehler(grund instanceof PasskeyFehler ? grund.message : PIN_SAETZE.nichtGesetzt);
      setLaeuft(false);
      return;
    }
    const { data } = await getSupabase().auth.getSession();
    if (!vorher || data.session?.user.id !== vorher) {
      setPin('');
      setWiederholung('');
      setBestaetigen(false);
      setFehler(PIN_SAETZE.anderesKonto);
      setLaeuft(false);
      return;
    }
    await setzen();
  }

  const einrichtung = formular !== undefined;
  const zifferfeld = einrichtung ? ZIFFERNFELD : '';

  return (
    <form
      id={formular}
      onSubmit={absenden}
      noValidate
      aria-label="PIN festlegen"
      className="flex flex-col gap-4"
    >
      {fehler ? (
        <div ref={fehlerkasten} tabIndex={-1}>
          <ErrorState title={fehler} />
        </div>
      ) : null}
      <Field
        label={einrichtung ? 'PIN' : 'Neue PIN'}
        hint={
          einrichtung
            ? 'Nicht die PIN Ihrer Bankkarte.'
            : `${PIN_LAENGE} Ziffern, keine gleichen Ziffern und keine Reihe. Nicht die PIN des Telefons.`
        }
        type="password"
        geheimnis="PIN"
        name="pin-neu"
        inputMode="numeric"
        autoComplete="off"
        className={zifferfeld}
        maxLength={PIN_LAENGE}
        feldId={FELD_PIN}
        value={pin}
        error={feldfehler?.feld === 'pin' ? feldfehler.satz : undefined}
        onChange={(event) => {
          setPin(nurZiffern(event.target.value));
          setFeldfehler(null);
        }}
      />
      <Field
        label={einrichtung ? 'PIN noch einmal' : 'PIN wiederholen'}
        type="password"
        geheimnis="PIN"
        name="pin-neu-wiederholung"
        inputMode="numeric"
        autoComplete="off"
        className={zifferfeld}
        maxLength={PIN_LAENGE}
        feldId={FELD_WIEDERHOLUNG}
        value={wiederholung}
        error={feldfehler?.feld === 'wiederholung' ? feldfehler.satz : undefined}
        onChange={(event) => {
          setWiederholung(nurZiffern(event.target.value));
          setFeldfehler(null);
        }}
      />
      {bestaetigen ? (
        <div className="flex flex-col gap-3">
          <Statusmeldung ton="warnung">{PIN_SAETZE.erneutAnmelden}</Statusmeldung>
          <Button type="button" disabled={laeuft} onClick={() => void mitPasskeyBestaetigen()}>
            {laeuft ? 'Wird geprüft …' : 'Mit Passkey bestätigen'}
          </Button>
        </div>
      ) : einrichtung ? null : (
        <Button type="submit" disabled={laeuft}>
          {laeuft ? 'Wird gespeichert …' : knopf}
        </Button>
      )}
    </form>
  );
}
