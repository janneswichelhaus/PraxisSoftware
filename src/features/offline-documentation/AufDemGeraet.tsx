import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { EmptyState, LoadingState } from '@/components/ui/Feedback';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { TextArea } from '@/components/ui/TextArea';
import { telHref } from '@/lib/telefon';
import { appointmentTypeLabels } from '@/features/appointments/api';
import { MAX_ZEICHEN } from '@/features/documentation/api';
import { useSperrsicherung } from '@/features/auth/sitzungssperre/sperrsicherung';
import {
  bearbeitungBeginnen,
  entwurfAmTermin,
  entwurfSchreiben,
  entwurfVerwerfen,
  useEntwuerfe,
  zahlSatz,
  type Entwurf,
  type Entwurfskopf,
} from './entwuerfe';
import { tagesplanLesen, type TagesplanTermin } from './tagesplan';

/**
 * Was auf dem Diensttelefon liegt (OFF-002, OFF-003, ADR-024 Punkte 6 bis 8).
 *
 * Eine Ansicht für beide Lagen: in der Anwendung unter „Auf dem Gerät“ und als
 * lokale Ansicht nach der Freigabe ohne Netz. Sie zeigt den Tagesplan von
 * heute mit genau seiner Feldliste und die Entwürfe auf dem Gerät mit ihrem
 * Zustand. Geschrieben wird hier nur auf das Gerät; übertragen wird anderswo
 * (`PraxisAblage`), nie aus der lokalen Ansicht.
 *
 * `serverwege` gibt es nur in offener Sitzung: Dann führen Konflikte zur
 * Dokumentation des Termins und in die Wege aus ANN-320. Ohne sie bleibt nur
 * Kopieren und ausdrückliches Verwerfen - verloren geht nichts (§13).
 */

export interface Serverwege {
  /** Adresse der Dokumentation eines Termins. */
  zurDokumentation: (terminId: string) => string;
  /** Den Text als Nachtrag-Entwurf an die finalisierte Dokumentation (ANN-320). */
  alsNachtrag: (terminId: string, noteId: string, text: string) => Promise<void>;
  /** Den Text in die Korrektur der finalisierten Dokumentation (ANN-320). */
  inKorrektur: (terminId: string, noteId: string, text: string) => void;
}

/** Wie lange nach dem letzten Tastendruck der Text auf das Gerät geht. */
const SCHREIBEN_NACH_MS = 400;

function uhrzeit(zeitpunkt: string, zeitzone: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: zeitzone,
  }).format(new Date(zeitpunkt));
}

function tagUndUhrzeit(zeitpunkt: string, zeitzone: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: zeitzone,
  }).format(new Date(zeitpunkt));
}

function nameVon(t: TagesplanTermin): string {
  return [t.given_name, t.family_name].filter(Boolean).join(' ') || (t.title ?? 'Termin');
}

function terminartVon(art: string): string {
  return appointmentTypeLabels[art as keyof typeof appointmentTypeLabels] ?? art;
}

function kopfVon(t: TagesplanTermin, zeitzone: string): Entwurfskopf {
  return {
    beginn: t.starts_at,
    ende: t.ends_at,
    zeitzone,
    name: nameVon(t),
    terminart: t.appointment_type,
  };
}

/** Nur an einer Behandlung, die stattfindet, entsteht eine Dokumentation (wie online). */
function dokumentierbar(t: TagesplanTermin): boolean {
  return t.kind === 'therapy' && t.status !== 'cancelled' && t.status !== 'no_show';
}

export function AufDemGeraet({
  besitzer,
  serverwege,
  ohneVerbindung,
}: {
  besitzer: string;
  serverwege?: Serverwege | undefined;
  /** Wahr, wenn gerade nichts übertragen werden kann (lokale Ansicht, Funkloch). */
  ohneVerbindung: boolean;
}) {
  const [offen, setOffen] = useState<{ terminId: string; kopf: Entwurfskopf } | null>(null);
  const plan = useQuery({
    queryKey: ['auf-dem-geraet', 'tagesplan', besitzer],
    queryFn: () => tagesplanLesen(besitzer),
    gcTime: 0,
  });
  const entwuerfe = useEntwuerfe(besitzer);

  if (plan.isPending || entwuerfe === undefined) {
    return <LoadingState label="Wird vom Gerät gelesen …" />;
  }

  if (offen) {
    return (
      <Entwurfsfeld
        besitzer={besitzer}
        terminId={offen.terminId}
        kopf={offen.kopf}
        ohneVerbindung={ohneVerbindung}
        onFertig={() => setOffen(null)}
      />
    );
  }

  const wartend = entwuerfe.filter((e) => e.zustand === 'wartet').length;
  const tagesplan = plan.data ?? null;

  return (
    <div className="flex flex-col gap-2">
      <Statusmeldung ton={entwuerfe.length > 0 ? 'warnung' : 'erfolg'}>
        {wartend > 0
          ? `Noch nicht übertragen: ${zahlSatz(wartend)} auf diesem Gerät.${ohneVerbindung ? ' Übertragen wird, sobald Verbindung besteht und Sie entsperrt haben.' : ''}`
          : entwuerfe.length > 0
            ? 'Nicht alles ist übertragen. Bitte unten ansehen.'
            : 'Alles übertragen. Auf dem Gerät liegt kein Entwurf.'}
      </Statusmeldung>

      {entwuerfe.length > 0 ? (
        <Section titel="Entwürfe auf diesem Gerät">
          <ul className="flex flex-col gap-4">
            {entwuerfe.map((e) => (
              <li key={e.id}>
                <Entwurfskarte
                  besitzer={besitzer}
                  entwurf={e}
                  serverwege={serverwege}
                  onWeiter={() => setOffen({ terminId: e.terminId, kopf: e.kopf })}
                />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section
        titel="Tagesplan von heute"
        hinweis="So, wie er zuletzt mit Verbindung geladen wurde. Änderungen der Praxis seitdem fehlen hier."
      >
        {tagesplan === null || tagesplan.termine.length === 0 ? (
          <EmptyState title="Auf diesem Gerät liegt kein Tagesplan von heute." />
        ) : (
          <ul className="divide-line flex flex-col divide-y">
            {tagesplan.termine.map((t) => {
              const entwurf = entwuerfe.find((e) => e.terminId === t.id && e.zustand === 'wartet');
              return (
                <li key={t.id} className="py-3">
                  <Terminzeile
                    termin={t}
                    zeitzone={tagesplan.zeitzone}
                    entwurf={entwurf}
                    online={
                      !ohneVerbindung && serverwege ? serverwege.zurDokumentation(t.id) : null
                    }
                    onSchreiben={() =>
                      setOffen({ terminId: t.id, kopf: kopfVon(t, tagesplan.zeitzone) })
                    }
                  />
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Terminzeile({
  termin: t,
  zeitzone,
  entwurf,
  online,
  onSchreiben,
}: {
  termin: TagesplanTermin;
  zeitzone: string;
  entwurf: Entwurf | undefined;
  /** Mit Verbindung: die gewohnte Schreibseite statt des Geräts. */
  online: string | null;
  onSchreiben: () => void;
}) {
  const adresse = [
    [t.visit_street, t.visit_house_number].filter(Boolean).join(' '),
    [t.visit_postal_code, t.visit_city].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(', ');
  const abgesagt = t.status === 'cancelled';
  return (
    <div className="flex flex-col gap-1">
      <p className="text-ink font-medium">
        <span className="tabular-nums">
          {uhrzeit(t.starts_at, zeitzone)}–{uhrzeit(t.ends_at, zeitzone)}
        </span>{' '}
        · {nameVon(t)}
        {t.kind === 'therapy' ? (
          <span className="text-ink-muted font-normal"> · {terminartVon(t.appointment_type)}</span>
        ) : null}
        {abgesagt ? <span className="text-ink-muted font-normal"> · abgesagt</span> : null}
      </p>
      {adresse ? <p className="text-ink-muted text-sm">{adresse}</p> : null}
      <div className="mt-1 flex flex-wrap gap-2">
        {[t.phone, t.phone_mobile].filter(Boolean).map((nummer) => (
          <a
            key={nummer}
            href={telHref(nummer!)}
            className="text-accent inline-flex min-h-11 items-center text-sm underline"
          >
            {nummer}
          </a>
        ))}
        {dokumentierbar(t) && online && !entwurf ? (
          <ButtonLink variant="secondary" to={online}>
            Zur Dokumentation
          </ButtonLink>
        ) : null}
        {dokumentierbar(t) && (!online || entwurf) ? (
          <Button variant={entwurf ? 'primary' : 'secondary'} onClick={onSchreiben}>
            {entwurf ? 'Weiterschreiben' : 'Ohne Verbindung schreiben'}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function Entwurfskarte({
  besitzer,
  entwurf: e,
  serverwege,
  onWeiter,
}: {
  besitzer: string;
  entwurf: Entwurf;
  serverwege: Serverwege | undefined;
  onWeiter: () => void;
}) {
  const [kopiert, setKopiert] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  async function kopieren() {
    try {
      await navigator.clipboard.writeText(e.text);
      setKopiert(true);
    } catch {
      setFehler('Kopieren ging nicht. Bitte den Text unten markieren und kopieren.');
    }
  }

  async function nachtrag(noteId: string) {
    if (!serverwege) return;
    setLaeuft(true);
    setFehler(null);
    try {
      await serverwege.alsNachtrag(e.terminId, noteId, e.text);
      await entwurfVerwerfen(besitzer, e.id);
    } catch (grund) {
      setFehler(grund instanceof Error ? grund.message : 'Nicht übernommen.');
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <article className="border-line rounded-card bg-surface border p-4">
      <h3 className="text-ink font-medium">
        {tagUndUhrzeit(e.kopf.beginn, e.kopf.zeitzone)} · {e.kopf.name}
      </h3>
      <p className="text-ink-muted text-sm">
        Auf dem Gerät geschrieben, zuletzt {tagUndUhrzeit(e.geschriebenAm, e.kopf.zeitzone)}
      </p>

      {e.zustand === 'wartet' ? (
        <Statusmeldung ton="warnung" className="mt-2">
          Auf dem Gerät gespeichert, noch nicht übertragen.
        </Statusmeldung>
      ) : null}
      {e.zustand === 'konflikt' ? (
        <Statusmeldung ton="warnung" className="mt-2">
          {e.vorhanden?.status === 'final'
            ? 'Am Termin gibt es schon eine finalisierte Dokumentation. Ihr Text wurde nicht eingemischt.'
            : 'Am Termin gibt es schon einen Entwurf. Ihr Text wurde nicht eingemischt.'}
        </Statusmeldung>
      ) : null}
      {e.zustand === 'abgewiesen' ? (
        <Statusmeldung ton="fehler" className="mt-2">
          {e.grund ?? 'Nicht übertragen.'} Der Text bleibt hier, bis Sie ihn verwerfen.
        </Statusmeldung>
      ) : null}

      <p className="text-ink bg-surface-sunken rounded-field mt-3 p-3 text-sm whitespace-pre-wrap select-text">
        {e.text}
      </p>

      {fehler ? (
        <Statusmeldung ton="fehler" className="mt-2">
          {fehler}
        </Statusmeldung>
      ) : null}
      {kopiert ? (
        <Statusmeldung ton="erfolg" className="mt-2">
          Text kopiert.
        </Statusmeldung>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {e.zustand === 'wartet' ? <Button onClick={onWeiter}>Weiterschreiben</Button> : null}
        {e.zustand === 'konflikt' && serverwege && e.vorhanden ? (
          <>
            {e.vorhanden.status === 'final' ? (
              <>
                <Button disabled={laeuft} onClick={() => void nachtrag(e.vorhanden!.id)}>
                  {laeuft ? 'Wird übernommen …' : 'Als Nachtrag übernehmen'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => serverwege.inKorrektur(e.terminId, e.vorhanden!.id, e.text)}
                >
                  In Korrektur übernehmen
                </Button>
              </>
            ) : null}
            <ButtonLink variant="secondary" to={serverwege.zurDokumentation(e.terminId)}>
              Zur Dokumentation des Termins
            </ButtonLink>
          </>
        ) : null}
        {e.zustand !== 'wartet' ? (
          <Button variant="secondary" onClick={() => void kopieren()}>
            Text kopieren
          </Button>
        ) : null}
        <Rueckfrage
          ausloeser="Verwerfen"
          ausloeserVariante="quiet"
          bestaetigen="Endgültig verwerfen"
          onBestaetigen={() => entwurfVerwerfen(besitzer, e.id)}
        >
          <p>Der Text liegt nur auf diesem Gerät. Verworfen ist er weg – auch für die Praxis.</p>
        </Rueckfrage>
      </div>
    </article>
  );
}

/**
 * Das Schreibfeld am Termin: Jede Eingabe geht nach einer kurzen Pause auf
 * das Gerät, vor der Sitzungssperre sofort (ADR-025 Punkt 4). Finalisiert
 * wird hier nie (ADR-001 Punkt 4).
 */
function Entwurfsfeld({
  besitzer,
  terminId,
  kopf,
  ohneVerbindung,
  onFertig,
}: {
  besitzer: string;
  terminId: string;
  kopf: Entwurfskopf;
  ohneVerbindung: boolean;
  onFertig: () => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const [stand, setStand] = useState<'gespeichert' | 'schreibt' | 'fehler'>('gespeichert');
  const offen = useRef<string | null>(null);
  const uhr = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => bearbeitungBeginnen(terminId), [terminId]);

  useEffect(() => {
    let aktiv = true;
    void entwurfAmTermin(besitzer, terminId).then((e) => {
      if (aktiv) setText(e?.text ?? '');
    });
    return () => {
      aktiv = false;
    };
  }, [besitzer, terminId]);

  async function ablegen(): Promise<boolean> {
    if (uhr.current) clearTimeout(uhr.current);
    uhr.current = null;
    const wert = offen.current;
    if (wert === null) return true;
    try {
      await entwurfSchreiben(besitzer, terminId, kopf, wert);
      if (offen.current === wert) offen.current = null;
      setStand('gespeichert');
      return true;
    } catch {
      setStand('fehler');
      return false;
    }
  }

  useSperrsicherung(ablegen);
  useEffect(
    () => () => {
      void ablegen();
    },
    // Beim Verlassen: was noch offen ist, aufs Gerät.

    [],
  );

  if (text === null) return <LoadingState label="Wird vom Gerät gelesen …" />;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-ink text-lg font-semibold">
          {kopf.name} · {uhrzeit(kopf.beginn, kopf.zeitzone)}
        </h2>
        <p className="text-ink-muted text-sm">
          Dokumentation als Entwurf, auf diesem Gerät. Finalisiert wird erst nach der Übertragung.
        </p>
      </div>
      <TextArea
        label="Behandlungsdokumentation"
        rows={10}
        maxLength={MAX_ZEICHEN}
        value={text}
        onChange={(ereignis) => {
          const neu = ereignis.target.value;
          setText(neu);
          offen.current = neu;
          setStand('schreibt');
          if (uhr.current) clearTimeout(uhr.current);
          uhr.current = setTimeout(() => void ablegen(), SCHREIBEN_NACH_MS);
        }}
      />
      <Statusmeldung ton={stand === 'fehler' ? 'fehler' : 'warnung'}>
        {stand === 'fehler'
          ? 'Das Gerät hat den Text nicht gespeichert. Bitte nicht schließen und erneut tippen.'
          : stand === 'schreibt'
            ? 'Wird auf dem Gerät gespeichert …'
            : ohneVerbindung
              ? 'Auf dem Gerät gespeichert, noch nicht übertragen.'
              : 'Auf dem Gerät gespeichert. Übertragen wird, sobald Sie auf „Fertig“ tippen.'}
      </Statusmeldung>
      <Button
        onClick={() => {
          void ablegen().then((ok) => {
            if (ok) onFertig();
          });
        }}
      >
        Fertig
      </Button>
    </div>
  );
}
