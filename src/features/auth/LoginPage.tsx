import { useContext, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { ErrorState } from '@/components/ui/Feedback';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Vollseite } from '@/app/Vollseite';
import { getSupabase } from '@/lib/supabase';
import { fordereKennwortMailAn } from '@/features/account/api';
import { VerbindungError } from '@/features/auth/linkEinloesen';
import { ANMELDESAETZE, anmeldesatz } from './anmeldefehler';
import { useFokusNachWechsel } from './fokus';
import { SessionContext } from './sessionContext';

/** Das Feld, in das der Fokus beim Öffnen von „Kennwort vergessen" springt. */
const ADRESSFELD = 'kennwort-vergessen-adresse';

/**
 * Kann die Eingabe eine Adresse sein? (AUTH-11)
 *
 * Dieselbe Formprüfung wie beim Einladen eines Zugangs
 * (`StaffAccountSection`): etwas, ein @, etwas, ein Punkt, etwas. Sie sagt
 * nichts über ein Konto - nur, ob ein Tippfehler wie „praxis,invalid" die
 * Anfrage ins Leere schicken würde. Der Anmeldedienst lehnte so etwas ab, und
 * die Seite meldete trotzdem „unterwegs".
 */
function istAdresse(wert: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(wert);
}

/**
 * Kennwort vergessen (STAFF-004a).
 *
 * Die Bestätigung ist immer dieselbe und sagt bewusst nicht, ob es zu dieser
 * Adresse ein Konto gibt - sonst wäre das Formular ein Verzeichnis der
 * Mitarbeitenden dieser Praxis. Aus demselben Grund wird ein Fehler des
 * Anmeldedienstes hier nicht unterschieden: Auch „unbekannte Adresse" wäre
 * eine Auskunft.
 *
 * Seit UXR-002 nennt sie die Adresse, für die angefordert wurde, und bietet
 * einen Weg zurück (AUTH-11): Ein Tippfehler fiel sonst erst auf, wenn die
 * Mail nie kam - und korrigieren ließ er sich nur durch Neuladen.
 */
function KennwortVergessen({ voreingestellteAdresse }: { voreingestellteAdresse: string }) {
  const [offen, setOffen] = useState(false);
  const [email, setEmail] = useState('');
  const [angefordertFuer, setAngefordertFuer] = useState<string | null>(null);
  const [formfehler, setFormfehler] = useState<string | null>(null);
  const [nichtErreichbar, setNichtErreichbar] = useState(false);
  const [pending, setPending] = useState(false);
  const ausloeser = useRef<HTMLButtonElement>(null);
  const bestaetigung = useRef<HTMLDivElement>(null);
  const fehlermeldung = useRef<HTMLDivElement>(null);

  // Der Fokus geht dorthin, wo es weitergeht (AUTH-06): ins Feld, auf die
  // Bestätigung, nach „Abbrechen" zurück auf „Kennwort vergessen?".
  const ansicht = angefordertFuer !== null ? 'gesendet' : offen ? 'offen' : 'zu';
  useFokusNachWechsel(ansicht, () => {
    if (ansicht === 'offen') return document.getElementById(ADRESSFELD);
    if (ansicht === 'gesendet') return bestaetigung.current;
    return ausloeser.current;
  });
  useFokusNachWechsel(nichtErreichbar, () => (nichtErreichbar ? fehlermeldung.current : null));

  if (angefordertFuer !== null) {
    return (
      <div ref={bestaetigung} tabIndex={-1} className="mt-6 flex flex-col items-start gap-2">
        <Statusmeldung>
          Angefordert für {angefordertFuer}. Falls für diese Adresse ein Zugang besteht, ist eine
          Mail zum Zurücksetzen unterwegs. Bitte auch den Spam-Ordner ansehen.
        </Statusmeldung>
        <Button
          type="button"
          variant="quiet"
          groesse="kompakt"
          onClick={() => {
            setAngefordertFuer(null);
            setOffen(true);
          }}
        >
          Andere Adresse eingeben
        </Button>
      </div>
    );
  }

  if (!offen) {
    // Ein Knopf, kein Link: Er öffnet einen Abschnitt, er führt nirgends hin.
    // In der Hauptfarbe wie jeder leise Knopf (UIK-14, AUTH-12) - bis UXR-002
    // stand er grau und unterstrichen da.
    return (
      <Button
        ref={ausloeser}
        type="button"
        variant="quiet"
        groesse="kompakt"
        className="mt-4 self-start"
        onClick={() => {
          setEmail(voreingestellteAdresse);
          setNichtErreichbar(false);
          setFormfehler(null);
          setOffen(true);
        }}
      >
        Kennwort vergessen?
      </Button>
    );
  }

  async function absenden(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const adresse = email.trim();
    if (!istAdresse(adresse)) {
      setFormfehler('Bitte eine gültige E-Mail-Adresse angeben.');
      document.getElementById(ADRESSFELD)?.focus();
      return;
    }
    setPending(true);
    setNichtErreichbar(false);
    try {
      await fordereKennwortMailAn(adresse);
      setAngefordertFuer(adresse);
    } catch (fehler) {
      // Ein nicht erreichbarer Dienst wird benannt: Sonst wartet jemand auf
      // eine Mail, die nie kommt (R3-008). Jeder andere Fehlschlag bleibt
      // ohne eigene Meldung - er könnte verraten, ob es das Konto gibt.
      if (fehler instanceof VerbindungError) setNichtErreichbar(true);
      else setAngefordertFuer(adresse);
    } finally {
      setPending(false);
    }
  }

  return (
    // Ohne eigene Überschrift läse sich der Abschnitt wie eine zweite Zeile
    // des Anmeldeformulars - zwei E-Mail-Felder untereinander, ohne dass klar
    // wäre, wofür das zweite da ist. Die Überschrift kommt aus `Section`
    // (AUTH-12, TOK-05).
    <div className="border-line mt-8 border-t pt-6">
      <Section titel="Kennwort vergessen">
        <form
          onSubmit={(event) => void absenden(event)}
          noValidate
          aria-label="Kennwort vergessen"
          className="flex flex-col gap-3"
        >
          <Field
            label="E-Mail-Adresse des Zugangs"
            feldId={ADRESSFELD}
            hint="Wir schicken einen Link, mit dem ein neues Kennwort gesetzt wird."
            type="email"
            name="reset_email"
            autoComplete="username"
            required
            value={email}
            error={formfehler ?? undefined}
            onChange={(event) => {
              setEmail(event.target.value);
              setFormfehler(null);
            }}
          />
          <div className="flex flex-wrap gap-3">
            <Button type="submit" variant="secondary" disabled={pending || email.trim() === ''}>
              {pending ? 'Wird gesendet …' : 'Link anfordern'}
            </Button>
            <Button type="button" variant="quiet" onClick={() => setOffen(false)}>
              Abbrechen
            </Button>
          </div>

          {nichtErreichbar ? (
            <div ref={fehlermeldung} tabIndex={-1}>
              <Statusmeldung ton="fehler">
                Der Anmeldedienst ist gerade nicht erreichbar. Bitte später erneut versuchen.
              </Statusmeldung>
            </div>
          ) : null}
        </form>
      </Section>
    </div>
  );
}

/**
 * Anmeldung über Supabase Auth.
 *
 * Fehlermeldungen sind bewusst unspezifisch: Sie unterscheiden nicht zwischen
 * "Konto existiert nicht" und "Kennwort falsch", damit die Anmeldemaske keine
 * Auskunft darüber gibt, wer ein Konto in dieser Praxis hat. Was sie seit
 * BEF-047 nennt, ist die Lage des Dienstes und ein Sitzungsende von außen.
 */
export function LoginPage() {
  // Ohne `SessionProvider` (Tests, Vorschauen) gibt es kein Sitzungsende.
  const endeVonAussen = useContext(SessionContext)?.endeVonAussen ?? false;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const fehlerkasten = useRef<HTMLDivElement>(null);

  // Der Anmeldeknopf ist gesperrt, solange die Anmeldung läuft, und nahm dabei
  // den Fokus mit. Erscheint danach ein Fehler, steht der Fokus dort (AUTH-06).
  useFokusNachWechsel(error, () => (error ? fehlerkasten.current : null));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    // Leere Felder gehen nicht erst zum Dienst: Seine Antwort darauf hieß
    // bisher „Kennwort prüfen", obwohl keins eingegeben war.
    if (email.trim() === '' || password === '') {
      setError(ANMELDESAETZE.leer);
      return;
    }
    setPending(true);
    try {
      const { error: signInError } = await getSupabase().auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) setError(anmeldesatz(signInError, ANMELDESAETZE.pruefen));
    } catch {
      setError(ANMELDESAETZE.keineVerbindung);
    } finally {
      setPending(false);
    }
  }

  return (
    // Die Anmeldemaske ist die Haustür — hier steht die Marke selbst, nicht
    // ihr Name als Text (`Vollseite`, MARKE-001).
    <Vollseite
      titel="Anmelden"
      einleitung="Zugang ausschließlich für Mitarbeitende und Patient:innen der Praxis."
      kleingedrucktes="Zugänge werden von der Praxis vergeben. Jede Person benötigt ein eigenes Konto; geteilte Zugänge sind nicht zulässig."
    >
      <form
        onSubmit={(event) => void handleSubmit(event)}
        noValidate
        className="flex flex-col gap-4"
      >
        {/* Kein Grund, kein Name (BEF-047): Was eine Sperre oder ein
            anderes Gerät ausgelöst hat, steht nicht auf einer Seite, die
            jeder am Gerät sieht. */}
        {endeVonAussen ? (
          <Statusmeldung ton="warnung">{ANMELDESAETZE.sitzungBeendet}</Statusmeldung>
        ) : null}

        {error ? (
          <div ref={fehlerkasten} tabIndex={-1}>
            <ErrorState title={error} />
          </div>
        ) : null}

        <Field
          label="E-Mail-Adresse"
          type="email"
          name="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Field
          label="Kennwort"
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        <Button type="submit" disabled={pending} className="mt-2">
          {pending ? 'Anmeldung läuft …' : 'Anmelden'}
        </Button>
      </form>

      <KennwortVergessen voreingestellteAdresse={email} />
    </Vollseite>
  );
}
