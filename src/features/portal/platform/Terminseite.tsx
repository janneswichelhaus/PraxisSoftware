import { useId, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useIstVerbunden } from '@/app/verbindung';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { ErrorState } from '@/components/ui/Feedback';
import { NachladeHinweis } from '@/components/ui/Rueckmeldung';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Section } from '@/components/ui/Section';
import { Skelett, SkelettBereich } from '@/components/ui/Skelett';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Terminkopf } from '@/components/ui/Terminkopf';
import { AUSFALLHONORAR_SPAET } from '@/lib/ausfallhonorar';
import {
  ladeTermine,
  ladeWuensche,
  termineSchluessel,
  wuenscheSchluessel,
  type Plattformzugang,
  type Termin,
  type Terminwunsch,
} from './api';
import { useRechner } from './geruestbreite';
import { useLesefrist } from './lesefrist';
import { PLATTFORM_PFAD, bereichParameter } from './pfade';
import {
  FragenZumTermin,
  PraxisErreichen,
  Statuszeichen,
  WerUndWo,
  Zurueckziehen,
} from './Terminbausteine';
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
 * Die Seite eines Termins, Ziel jeder Terminzeile (ANN-776). Ändern und Absagen beginnen hier und
 * öffnen den Ablauf mit `?art=` (ANN-778); die Handlung steht vor „Wer und wo“ (ANN-804). Jeder
 * Abschnitt steht allein in seinem Block, sonst zählte sein Abstand doppelt.
 */
export function Terminseite({ zugang }: { zugang: Plattformzugang }) {
  const verbunden = useIstVerbunden();
  const rechner = useRechner();
  // Die Kennung aus dem Pfad `/p/termine/<id>` - wie im Ablauf.
  const { pathname } = useLocation();
  const terminId = pathname.slice(pathname.lastIndexOf('/') + 1);
  const [suche] = useSearchParams();
  const bereich = bereichParameter(suche);
  const mit = (pfad: string) => `${pfad}${bereich ? `?${bereich}` : ''}`;
  const termine = useQuery({
    queryKey: termineSchluessel(zugang.access_id),
    queryFn: () => ladeTermine(zugang.access_id),
  });
  const wuensche = useQuery({
    queryKey: wuenscheSchluessel(zugang.access_id),
    queryFn: () => ladeWuensche(zugang.access_id),
  });
  const { lesefrist } = useLesefrist(zugang);
  const termin = termine.data?.find((t) => t.id === terminId);
  const liste = mit(`${PLATTFORM_PFAD}/termine`);
  const praxis = <PraxisErreichen zugang={zugang} mit={mit} lesefrist={lesefrist} />;

  if (termine.data === undefined && !termine.isError) {
    return (
      <Rahmen liste={liste}>
        <Ladezustand />
        {/* Ohne Netz bleibt das Skelett stehen, der Weg zur Praxis geht trotzdem (ANN-780). */}
        {verbunden ? null : praxis}
      </Rahmen>
    );
  }
  if (termine.data === undefined) {
    return (
      <Rahmen liste={liste}>
        <ErrorState
          title="Ihr Termin lässt sich gerade nicht laden."
          description="Versuchen Sie es gleich noch einmal."
          onErneut={() => termine.refetch()}
        />
        {praxis}
      </Rahmen>
    );
  }
  if (!termin) {
    return (
      <Rahmen liste={liste}>
        <ErrorState
          title="Dieser Termin wurde nicht gefunden."
          description="Vielleicht hat die Praxis ihn geändert. Bitte sehen Sie in Ihre Terminliste."
        />
      </Rahmen>
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
  // Scheitert das Nachladen, bleibt der Stand stehen und sagt, dass er veraltet sein kann.
  const veraltet = termine.isError || (termin.open_request_kind !== null && wuensche.isError);

  return (
    <Rahmen liste={liste}>
      <Terminkopf
        zeichen={artzeichen(termin.appointment_type, bereichArt)}
        art={artLang(termin.appointment_type, bereichArt)}
        titel={tagInWorten(termin.starts_at, jetzt)}
        zeit={vonBis(termin)}
        zustand={zustand ? <Statuszeichen {...zustand} /> : undefined}
      />
      {veraltet ? (
        <NachladeHinweis
          laeuft={termine.isFetching || wuensche.isFetching}
          onErneut={() => {
            void termine.refetch();
            void wuensche.refetch();
          }}
        />
      ) : null}
      {/* Die Handlung vor dem Inhalt: bei 375 × 667 ohne Rollen erreichbar, auch unter 24 Stunden. */}
      {kommend && termin.open_request_kind ? (
        <OffenerWunsch zugang={zugang} termin={termin} wunsch={wunsch} verbunden={verbunden} />
      ) : kommend ? (
        <AendernOderAbsagen termin={termin} mit={mit} verbunden={verbunden} rechner={rechner} />
      ) : abgesagt ? (
        <NeuerWunsch
          pfad={mit(`${PLATTFORM_PFAD}/termine/wunsch`)}
          verbunden={verbunden}
          rechner={rechner}
        />
      ) : null}
      <WerUndWo termin={termin} vertretung={vertretung} jetzt={jetzt} />
      {lesefrist && !zugang.practice_phone ? null : (
        <div>
          <FragenZumTermin
            rufnummer={zugang.practice_phone}
            schreiben={lesefrist ? null : mit(`${PLATTFORM_PFAD}/nachrichten/neu`)}
            anrufenAlsHauptknopf={!kommend && !abgesagt}
          />
        </div>
      )}
    </Rahmen>
  );
}

/**
 * Der Rückweg „Termine“ über dem Stapel, von der Übersicht aus „Übersicht“ (`?zurueck=`, ANN-779).
 * Sein Abstand kommt aus dem Baustein, nicht aus dem Stapel.
 */
function Rahmen({ liste, children }: { liste: string; children: ReactNode }) {
  return (
    <div>
      <Rueckweg standard={liste} beschriftung="Termine" />
      <div className="flex flex-col gap-8">{children}</div>
    </div>
  );
}

/**
 * Kommend und änderbar: „Termin ändern“ und „Termin absagen“ gleich gewichtet, unter 24 Stunden mit
 * der Warnung zum Ausfallhonorar statt des Satzes (`late_notice`, ADR-018 Punkt 8). Ohne Netz
 * gesperrt mit dem Satz der Liste (ANN-773).
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
 * Ein offener Wunsch zum Termin: wann und Nachricht aus dem Wunsch (`appointment_id`), dass der
 * Termin bis dahin gilt, und „Wunsch zurückziehen“. Fehlt der Wunsch in der Liste, bleiben Titel
 * und Satz.
 */
function OffenerWunsch({
  zugang,
  termin,
  wunsch,
  verbunden,
}: {
  zugang: Plattformzugang;
  termin: Termin;
  wunsch: Terminwunsch | undefined;
  verbunden: boolean;
}) {
  const satzId = useId();
  const wann = wunsch ? wunschInWorten(wunsch) : null;
  return (
    <div>
      <Section
        titel={termin.open_request_kind === 'cancel' ? 'Ihr Absagewunsch' : 'Ihr Änderungswunsch'}
        trennen
      >
        <div className="flex flex-col gap-3">
          {wann ? <p className="hyphens-manual">{wann}</p> : null}
          {wunsch?.note ? <p className="text-ink-muted">„{wunsch.note}“</p> : null}
          <p className="text-ink-muted">
            Die Praxis meldet sich bei Ihnen. Bis dahin gilt der Termin.
          </p>
          {wunsch ? (
            <div className="self-start">
              <Zurueckziehen
                zugang={zugang}
                wunschId={wunsch.id}
                verbunden={verbunden}
                ohneNetzId={satzId}
              />
            </div>
          ) : null}
          {wunsch && !verbunden ? (
            <p id={satzId} className="text-ink-muted">
              {WUENSCHE_OHNE_NETZ}
            </p>
          ) : null}
        </div>
      </Section>
    </div>
  );
}

/** Abgesagt: „Neuen Termin wünschen“ als Zweitknopf zum Wunsch; ohne Netz gesperrt. */
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

/** Das Skelett in der Form des Kopfs mit „Wer und wo“; vorgelesen „Termin wird geladen“. */
function Ladezustand() {
  return (
    <SkelettBereich beschriftung="Termin wird geladen">
      <span className="flex flex-col gap-8">
        <span className="flex flex-col gap-3">
          <Skelett form="zeile" className="w-40 max-w-full" />
          <Skelett form="gruss" className="w-72 max-w-full" />
          <Skelett form="titel" className="w-44 max-w-full" />
        </span>
        <Skelett form="karte" className="min-h-36" />
      </span>
    </SkelettBereich>
  );
}
