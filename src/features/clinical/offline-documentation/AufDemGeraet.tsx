import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { EmptyState, LoadingState } from '@/components/ui/Feedback';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { TextArea } from '@/components/ui/TextArea';
import { Textlink } from '@/components/ui/Textlink';
import { Zwischentitel } from '@/components/ui/Zwischentitel';
import { telHref } from '@/lib/telefon';
import { MAX_ZEICHEN } from '@/features/clinical/documentation/api';
import { useSperrsicherung } from '@/lib/sperrsicherung';
import {
  bearbeitungBeginnen,
  entwurfAmTermin,
  entwurfErneutSenden,
  entwurfSchreiben,
  entwurfVerwerfen,
  unlesbarSatz,
  useEntwuerfe,
  useUnlesbare,
  zahlSatz,
  type Entwurf,
  type Entwurfskopf,
} from './entwuerfe';
import { tagesplanLesen, type TagesplanTermin } from './tagesplan';
import { appointmentTypeLabels } from '@/lib/termin';

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
 * Dokumentation des Termins und in die Wege aus ANN-320, und ein abgewiesener
 * Entwurf lässt sich erneut senden (BEF-150). Ohne sie bleibt nur Kopieren
 * und ausdrückliches Verwerfen - verloren geht nichts (§13).
 */

export interface Serverwege {
  /** Adresse der Dokumentation eines Termins. */
  zurDokumentation: (terminId: string) => string;
  /** Den Text als Nachtrag-Entwurf an die finalisierte Dokumentation (ANN-320). */
  alsNachtrag: (terminId: string, noteId: string, text: string) => Promise<void>;
  /** Den Text in die Korrektur der finalisierten Dokumentation (ANN-320). */
  inKorrektur: (terminId: string, noteId: string, text: string) => void;
  /**
   * Die Fassung, die am Termin schon steht - beide Fassungen zeigen (ADR-024
   * Punkt 7). Nur auf Tipp: Lesen ist „Akte geöffnet“ (ADR-010).
   */
  fassungLesen: (terminId: string) => Promise<string | null>;
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
  // Ein Ereignis des Praxisbetriebs hat keine Person, nur seinen Titel.
  if (t.kind === 'internal') return t.title ?? 'Termin';
  return [t.given_name, t.family_name].filter(Boolean).join(' ') || 'Termin';
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
  const unlesbar = useUnlesbare(besitzer);

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
      <Statusmeldung ton={entwuerfe.length + unlesbar > 0 ? 'warnung' : 'erfolg'}>
        {wartend > 0
          ? `Noch nicht übertragen: ${zahlSatz(wartend)} auf diesem Gerät.${ohneVerbindung ? ' Übertragen wird, sobald Verbindung besteht und Sie entsperrt haben.' : ''}`
          : entwuerfe.length + unlesbar > 0
            ? 'Nicht alles ist übertragen. Bitte unten ansehen.'
            : 'Alles übertragen. Auf dem Gerät liegt kein Entwurf.'}
      </Statusmeldung>
      {/* BEF-150: Was eine spätere Fassung abgelegt hat, fällt nicht still. */}
      {unlesbar > 0 ? (
        <Statusmeldung ton="warnung">
          Außerdem {unlesbar === 1 ? 'liegt' : 'liegen'} hier {unlesbarSatz(unlesbar)}.{' '}
          {unlesbar === 1 ? 'Er bleibt' : 'Sie bleiben'} auf dem Gerät, bis eine passende Fassung{' '}
          {unlesbar === 1 ? 'ihn' : 'sie'} liest oder Sie beim Abmelden alles verwerfen.
        </Statusmeldung>
      ) : null}

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

      <Section titel="Tagesplan von heute">
        {tagesplan === null || tagesplan.termine.length === 0 ? (
          <EmptyState inKarte title="Auf diesem Gerät liegt kein Tagesplan von heute." />
        ) : (
          <ListRows>
            {tagesplan.termine.map((t) => (
              <Terminzeile
                key={t.id}
                termin={t}
                zeitzone={tagesplan.zeitzone}
                entwurf={entwuerfe.find((e) => e.terminId === t.id && e.zustand === 'wartet')}
                online={!ohneVerbindung && serverwege ? serverwege.zurDokumentation(t.id) : null}
                onSchreiben={() =>
                  setOffen({ terminId: t.id, kopf: kopfVon(t, tagesplan.zeitzone) })
                }
              />
            ))}
          </ListRows>
        )}
        {/* Der Stand des Plans gehört zu seinem Inhalt: Was die Praxis seitdem
            geändert hat, fehlt hier. Ohne Plan gibt es keinen Stand. */}
        {tagesplan !== null && tagesplan.termine.length > 0 ? (
          <Kleingedrucktes className="mt-2">
            So, wie er zuletzt mit Verbindung geladen wurde. Änderungen der Praxis seitdem fehlen
            hier.
          </Kleingedrucktes>
        ) : null}
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
  const nummern = [t.phone, t.phone_mobile].filter((nummer): nummer is string => Boolean(nummer));
  const schreiben = dokumentierbar(t) && (!online || entwurf);
  const zurDoku = dokumentierbar(t) && online && !entwurf;
  return (
    // Eine Zeile je Termin (DESIGN.md Regel 3); Telefon und der Weg zur
    // Dokumentation stehen in ihr, weil die Knöpfe am Telefon neben dem Namen
    // keinen Platz hätten.
    <ListRow
      titel={
        <>
          <span className="tabular-nums">
            {uhrzeit(t.starts_at, zeitzone)}–{uhrzeit(t.ends_at, zeitzone)}
          </span>{' '}
          · {nameVon(t)}
        </>
      }
      gedaempft={abgesagt}
      status={abgesagt ? <Badge eigenesZeichen="×">Abgesagt</Badge> : undefined}
      meta={
        <>
          {[t.kind === 'therapy' ? terminartVon(t.appointment_type) : null, adresse || null]
            .filter(Boolean)
            .join(' · ')}
          {nummern.length > 0 || schreiben || zurDoku ? (
            <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              {nummern.map((nummer) => (
                <Textlink key={nummer} href={telHref(nummer)} alleinstehend>
                  {nummer}
                </Textlink>
              ))}
              {zurDoku && online ? (
                <ButtonLink variant="secondary" groesse="kompakt" to={online}>
                  Zur Dokumentation
                </ButtonLink>
              ) : null}
              {schreiben ? (
                <Button variant="secondary" groesse="kompakt" onClick={onSchreiben}>
                  {entwurf ? 'Weiterschreiben' : 'Ohne Verbindung schreiben'}
                </Button>
              ) : null}
            </span>
          ) : null}
        </>
      }
    />
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
  const [praxisFassung, setPraxisFassung] = useState<string | null | undefined>(undefined);
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

  async function erneutSenden() {
    setFehler(null);
    if (!(await entwurfErneutSenden(besitzer, e.id))) {
      setFehler(
        'Am Termin liegt schon ein neuer Entwurf. Bitte diesen Text kopieren und dort einfügen.',
      );
    }
  }

  async function fassungZeigen() {
    if (!serverwege) return;
    setFehler(null);
    try {
      setPraxisFassung(await serverwege.fassungLesen(e.terminId));
    } catch {
      setFehler('Die Fassung der Praxis ließ sich nicht laden. Bitte die Verbindung prüfen.');
    }
  }

  return (
    // Eine Karte je Entwurf: Jeder ist eine Aufgabe mit eigenen Wegen (L2).
    <article className="border-line rounded-card bg-surface border p-4">
      <Zwischentitel>
        {tagUndUhrzeit(e.kopf.beginn, e.kopf.zeitzone)} · {e.kopf.name}
      </Zwischentitel>
      <p className="text-ink-muted -mt-2 text-sm">
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

      {e.zustand === 'konflikt' ? (
        <p className="text-ink-muted mt-3 text-sm font-medium">Ihr Text auf diesem Gerät</p>
      ) : null}
      <p className="text-ink bg-surface-sunken rounded-field mt-1 p-3 text-sm whitespace-pre-wrap select-text">
        {e.text}
      </p>
      {praxisFassung !== undefined ? (
        <>
          <p className="text-ink-muted mt-3 text-sm font-medium">Fassung der Praxis am Termin</p>
          <p className="text-ink border-line rounded-field mt-1 border p-3 text-sm whitespace-pre-wrap">
            {praxisFassung ?? 'Am Termin steht inzwischen keine Dokumentation mehr.'}
          </p>
        </>
      ) : null}

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
        {e.zustand === 'abgewiesen' && serverwege ? (
          <Button onClick={() => void erneutSenden()}>Erneut senden</Button>
        ) : null}
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
            {praxisFassung === undefined ? (
              <Button variant="secondary" onClick={() => void fassungZeigen()}>
                Fassung der Praxis zeigen
              </Button>
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
  const ablegenRef = useRef(ablegen);
  ablegenRef.current = ablegen;
  // Solange das Feld offen ist, überträgt niemand diesen Termin. Beim
  // Verlassen erst den letzten Stand aufs Gerät, dann freigeben - sonst
  // ginge der ältere Text hinaus (Zweitreview S2).
  useEffect(() => {
    const freigeben = bearbeitungBeginnen(terminId);
    return () => {
      void ablegenRef.current().finally(freigeben);
    };
  }, [terminId]);

  if (text === null) return <LoadingState label="Wird vom Gerät gelesen …" />;

  return (
    <Section titel={`Dokumentation · ${kopf.name} · ${uhrzeit(kopf.beginn, kopf.zeitzone)}`}>
      <div className="flex flex-col gap-3">
        <Kleingedrucktes>
          Dokumentation als Entwurf, auf diesem Gerät. Finalisiert wird erst nach der Übertragung.
        </Kleingedrucktes>
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
      </div>
      {/* Kein klebender Knopf: Die Ansicht steht auch ohne Tableiste (lokale
          Ansicht nach der Freigabe ohne Netz). */}
      <Formularfuss>
        <Button
          onClick={() => {
            void ablegen().then((ok) => {
              if (ok) onFertig();
            });
          }}
        >
          Fertig
        </Button>
      </Formularfuss>
    </Section>
  );
}
