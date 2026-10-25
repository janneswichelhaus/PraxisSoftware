import { useId } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useIstVerbunden } from '@/app/verbindung';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { ErrorState } from '@/components/ui/Feedback';
import { Section } from '@/components/ui/Section';
import { Skelett, SkelettBereich } from '@/components/ui/Skelett';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Terminkopf } from '@/components/ui/Terminkopf';
import { ZurueckSymbol } from '@/components/ui/ZurueckSymbol';
import { AUSFALLHONORAR_SPAET } from '@/lib/ausfallhonorar';
import {
  termineSchluessel,
  wuenscheSchluessel,
  type Plattformzugang,
  type Termin,
  type Terminwunsch,
} from './api';
import { useNurLesen, usePlattformApi } from './einsicht';
import { useRechner } from './geruestbreite';
import { PLATTFORM_PFAD, bereichParameter } from './pfade';
import { FragenZumTermin, Statuszeichen, WerUndWo, Zurueckziehen } from './Terminbausteine';
import {
  artLang,
  artzeichen,
  tagInWorten,
  terminZustand,
  vonBis,
  wunschInWorten,
} from './termintexte';
import { WUENSCHE_OHNE_NETZ } from './wunschtexte';
import { kuenftig } from './zeit';

/**
 * Die Seite eines Termins (Handoff 2026-10-24 „Termine“, 5.2; Schritt 3c):
 * Kopf mit Art, Tag und Zeit, „Wer und wo“, je Lage ein Abschnitt und
 * „Fragen zu diesem Termin?“. Sie ist das Ziel jeder Terminzeile und von
 * „Termin ansehen“ (ANN-744); Ändern und Absagen beginnen hier (Frage 2,
 * ANN-746) und öffnen den Ablauf mit `?art=` (`Terminaenderung`).
 *
 * Je Lage: kommend und änderbar „Passt der Termin nicht?“ mit zwei
 * Zweitknöpfen - unter 24 Stunden mit der Warnung zum Ausfallhonorar statt
 * des Satzes; mit offenem Wunsch der Wunsch selbst und „Wunsch
 * zurückziehen“; vergangen „Praxis anrufen“ als Hauptknopf (DR-133,
 * BEF-221); abgesagt „Neuen Termin wünschen“. In der Einsicht der Praxis nur
 * Kopf und „Wer und wo“ (E-001). Ohne Netz sind Ändern und Absagen gesperrt
 * (Frage 4, ANN-741).
 *
 * Die Abschnitte sind `Section`s; im Stapel mit `gap` steht jeder allein in
 * seinem Block, sonst zählte sein Abstand zum Vorgänger doppelt.
 */
export function Terminseite({ zugang }: { zugang: Plattformzugang }) {
  const api = usePlattformApi();
  const nurLesen = useNurLesen();
  const verbunden = useIstVerbunden();
  // Wie das Gerüst: Die Einsicht zeigt immer das Telefon (`geruestbreite.ts`).
  const rechner = useRechner() && !nurLesen;
  // Die Kennung aus dem Pfad `/p/termine/<id>` - wie im Ablauf.
  const { pathname } = useLocation();
  const terminId = pathname.slice(pathname.lastIndexOf('/') + 1);
  const [suche] = useSearchParams();
  const bereich = bereichParameter(suche);
  const mit = (pfad: string) => `${pfad}${bereich ? `?${bereich}` : ''}`;
  const termine = useQuery({
    queryKey: termineSchluessel(zugang.access_id),
    queryFn: () => api.ladeTermine(zugang.access_id),
  });
  const wuensche = useQuery({
    queryKey: wuenscheSchluessel(zugang.access_id),
    queryFn: () => api.ladeWuensche(zugang.access_id),
  });
  const termin = termine.data?.find((t) => t.id === terminId);
  const rueckweg = <Rueckweg mit={mit} />;

  if (termine.data === undefined && !termine.isError) {
    return (
      <div className="flex flex-col gap-8">
        {rueckweg}
        <Ladezustand />
      </div>
    );
  }
  if (termine.data === undefined) {
    return (
      <div className="flex flex-col gap-8">
        {rueckweg}
        <ErrorState
          title="Ihr Termin lässt sich gerade nicht laden."
          description="Versuchen Sie es gleich noch einmal."
          onErneut={() => termine.refetch()}
        />
      </div>
    );
  }
  if (!termin) {
    return (
      <div className="flex flex-col gap-8">
        {rueckweg}
        <ErrorState
          title="Dieser Termin wurde nicht gefunden."
          description="Vielleicht hat die Praxis ihn geändert. Bitte sehen Sie in Ihre Terminliste."
        />
      </div>
    );
  }

  const jetzt = new Date();
  const bereichArt = zugang.relationship_kind;
  const zustand = terminZustand(termin);
  const vertretung = zugang.access_kind !== 'self' ? zugang.represented_name : null;
  const kommend = termin.status === 'confirmed' && kuenftig(termin.starts_at, jetzt);
  const abgesagt = termin.status === 'cancelled';
  const wunsch = termin.open_request_kind
    ? wuensche.data?.find((w) => w.appointment_id === termin.id && w.status === 'open')
    : undefined;

  return (
    <div className="flex flex-col gap-8">
      {rueckweg}
      <Terminkopf
        zeichen={artzeichen(termin.appointment_type, bereichArt)}
        art={artLang(termin.appointment_type, bereichArt)}
        titel={tagInWorten(termin.starts_at, jetzt)}
        zeit={vonBis(termin)}
        zustand={zustand ? <Statuszeichen {...zustand} /> : undefined}
      />
      <WerUndWo termin={termin} vertretung={vertretung} jetzt={jetzt} />
      {kommend && termin.open_request_kind ? (
        <OffenerWunsch
          zugang={zugang}
          termin={termin}
          wunsch={wunsch}
          zurueckziehen={!nurLesen}
          verbunden={verbunden}
        />
      ) : kommend && !nurLesen ? (
        <AendernOderAbsagen termin={termin} mit={mit} verbunden={verbunden} rechner={rechner} />
      ) : abgesagt && !nurLesen ? (
        <NeuerWunsch
          pfad={mit(`${PLATTFORM_PFAD}/termine/wunsch`)}
          verbunden={verbunden}
          rechner={rechner}
        />
      ) : null}
      {nurLesen ? null : (
        <div>
          <FragenZumTermin
            rufnummer={zugang.practice_phone}
            schreiben={mit(`${PLATTFORM_PFAD}/nachrichten/neu`)}
            anrufenAlsHauptknopf={!kommend && !abgesagt}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Der Weg zurück (Handoff, Abschnitt 3, „Kopf der Seite des Termins“):
 * „Termine“, von der Übersicht „Übersicht“ - woher, sagt `?von=uebersicht`
 * am Link von Hero- und Besuchskarte. Ein anderes Ziel nimmt er nicht an
 * (ANN-747).
 */
function Rueckweg({ mit }: { mit: (pfad: string) => string }) {
  const [suche] = useSearchParams();
  const vonUebersicht = suche.get('von') === 'uebersicht';
  return (
    <ButtonLink
      variant="quiet"
      to={mit(vonUebersicht ? PLATTFORM_PFAD : `${PLATTFORM_PFAD}/termine`)}
      className="-mb-6 -ml-2 gap-1 self-start pl-2"
    >
      <ZurueckSymbol />
      {vonUebersicht ? 'Übersicht' : 'Termine'}
    </ButtonLink>
  );
}

/**
 * Kommend und änderbar (5.2): „Passt der Termin nicht?“ mit dem Satz, unter
 * 24 Stunden mit der Warnung zum Ausfallhonorar (`late_notice` vom Server,
 * ADR-018 Punkt 8), dann „Termin ändern“ und „Termin absagen“ gleich
 * gewichtet - am Telefon volle Breite, am Rechner nebeneinander. Ohne Netz
 * gesperrt mit dem Satz der Liste.
 */
function AendernOderAbsagen({
  termin,
  mit,
  verbunden,
  rechner,
}: {
  termin: Termin;
  mit: (pfad: string) => string;
  verbunden: boolean;
  rechner: boolean;
}) {
  const satzId = useId();
  const ziel = (art: 'change' | 'cancel') => {
    const pfad = mit(`${PLATTFORM_PFAD}/termine/${termin.id}`);
    return `${pfad}${pfad.includes('?') ? '&' : '?'}art=${art}`;
  };
  const breite = rechner ? 'self-start' : 'w-full';
  return (
    <div>
      <Section
        titel="Passt der Termin nicht?"
        hinweis={
          termin.late_notice
            ? undefined
            : 'Ändern und Absagen sind Wünsche an die Praxis. Sie meldet sich bei Ihnen.'
        }
      >
        <div className="flex flex-col gap-3">
          {termin.late_notice ? (
            <Statusmeldung ton="warnung" className="font-semibold">
              {AUSFALLHONORAR_SPAET}
            </Statusmeldung>
          ) : null}
          <div className={`flex gap-3 ${rechner ? 'flex-wrap' : 'flex-col'}`}>
            {verbunden ? (
              <>
                <ButtonLink
                  to={ziel('change')}
                  variant="secondary"
                  groesse="normal"
                  className={breite}
                >
                  Termin ändern
                </ButtonLink>
                <ButtonLink
                  to={ziel('cancel')}
                  variant="secondary"
                  groesse="normal"
                  className={breite}
                >
                  Termin absagen
                </ButtonLink>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  groesse="normal"
                  disabled
                  aria-describedby={satzId}
                  className={breite}
                >
                  Termin ändern
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  groesse="normal"
                  disabled
                  aria-describedby={satzId}
                  className={breite}
                >
                  Termin absagen
                </Button>
              </>
            )}
          </div>
          {verbunden ? null : (
            <p id={satzId} className="text-ink-muted">
              {WUENSCHE_OHNE_NETZ}
            </p>
          )}
        </div>
      </Section>
    </div>
  );
}

/**
 * Ein offener Wunsch zum Termin (5.2): „Ihr Änderungswunsch“ bzw. „Ihr
 * Absagewunsch“ mit wann und Nachricht aus dem Wunsch (`appointment_id`),
 * dem Satz, dass der Termin bis dahin gilt, und „Wunsch zurückziehen“ - ohne
 * Netz gesperrt mit dem Satz der Liste darunter (ANN-741). Fehlt der Wunsch
 * in der Liste, bleiben Titel und Satz.
 */
function OffenerWunsch({
  zugang,
  termin,
  wunsch,
  zurueckziehen,
  verbunden,
}: {
  zugang: Plattformzugang;
  termin: Termin;
  wunsch: Terminwunsch | undefined;
  zurueckziehen: boolean;
  verbunden: boolean;
}) {
  const satzId = useId();
  const wann = wunsch ? wunschInWorten(wunsch) : null;
  return (
    <div>
      <Section
        titel={termin.open_request_kind === 'cancel' ? 'Ihr Absagewunsch' : 'Ihr Änderungswunsch'}
      >
        <div className="flex flex-col gap-3">
          {wann ? <p className="hyphens-manual">{wann}</p> : null}
          {wunsch?.note ? <p className="text-ink-muted">„{wunsch.note}“</p> : null}
          <p className="text-ink-muted">
            Die Praxis meldet sich bei Ihnen. Bis dahin gilt der Termin.
          </p>
          {wunsch && zurueckziehen ? (
            <div className="-ml-5 self-start">
              <Zurueckziehen
                zugang={zugang}
                wunschId={wunsch.id}
                verbunden={verbunden}
                ohneNetzId={satzId}
              />
            </div>
          ) : null}
          {wunsch && zurueckziehen && !verbunden ? (
            <p id={satzId} className="text-ink-muted">
              {WUENSCHE_OHNE_NETZ}
            </p>
          ) : null}
        </div>
      </Section>
    </div>
  );
}

/** Abgesagt (5.2): „Neuen Termin wünschen“ als Zweitknopf zum Wunsch; ohne Netz gesperrt. */
function NeuerWunsch({
  pfad,
  verbunden,
  rechner,
}: {
  pfad: string;
  verbunden: boolean;
  rechner: boolean;
}) {
  const satzId = useId();
  const breite = rechner ? 'self-start' : 'w-full';
  if (verbunden) {
    return (
      <ButtonLink to={pfad} variant="secondary" groesse="normal" className={breite}>
        Neuen Termin wünschen
      </ButtonLink>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="secondary"
        groesse="normal"
        disabled
        aria-describedby={satzId}
        className={breite}
      >
        Neuen Termin wünschen
      </Button>
      <p id={satzId} className="text-ink-muted">
        {WUENSCHE_OHNE_NETZ}
      </p>
    </div>
  );
}

/**
 * Das Skelett in der Form des Kopfs (5.2): Art, Tag, Zeit und die Karte „Wer
 * und wo“. Für Vorlesesoftware „Termin wird geladen“.
 */
function Ladezustand() {
  return (
    <SkelettBereich beschriftung="Termin wird geladen">
      <span className="flex flex-col gap-3">
        <Skelett form="zeile" className="w-40 max-w-full" />
        <Skelett form="gruss" className="w-72 max-w-full" />
        <Skelett form="titel" className="w-44 max-w-full" />
        <Skelett form="karte" className="mt-5 min-h-36" />
      </span>
    </SkelettBereich>
  );
}
