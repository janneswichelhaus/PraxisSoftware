import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { EmptyState } from '@/components/ui/Feedback';
import { GefuehrterAblauf } from '@/components/ui/GefuehrterAblauf';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { KeinZugang } from '@/app/KeinZugang';
import { EINGANG } from '@/features/organisation/pfade';
import type { CurrentUser } from '@/features/session/types';
import { leseRueckweg } from '@/lib/rueckweg';
import {
  FEEDBACK_STATUS_KEY,
  FEEDBACK_SUMMARY_KEY,
  fetchFeedbackStatus,
  fetchFeedbackSummary,
  type FeedbackStatus,
  type FeedbackSummary,
} from './api';
import { BarometerAblauf } from './BarometerAblauf';
import { SKALEN, TEXTE, monatsname, zeitraum } from './fragen';
import { skalenSumme } from './inhalt';

/**
 * Das Barometer (ORG-006, §20.2): für Beschäftigte der geführte Ablauf des
 * laufenden Monats, für owner die Praxissumme. Wer was bekommt, sagt der
 * Server (`get_my_staff_feedback_status`); Team-Leitung und Büro nehmen teil
 * und lesen nichts.
 */
export function BarometerPage({ user }: { user: CurrentUser }) {
  const status = useQuery({
    queryKey: FEEDBACK_STATUS_KEY,
    queryFn: fetchFeedbackStatus,
    retry: false,
  });
  return (
    <Abfragezustand
      abfrage={status}
      laden="Barometer wird geladen …"
      fehler="Das Barometer konnte nicht geladen werden."
      rahmen={(zustand) => (
        <>
          <PageHeader title="Barometer" />
          {zustand}
        </>
      )}
    >
      {(stand) =>
        stand.can_read ? (
          <Auswertung />
        ) : stand.can_take_part ? (
          <Abgeben stand={stand} />
        ) : (
          <KeinZugang user={user} />
        )
      }
    </Abfragezustand>
  );
}

function Abgeben({ stand }: { stand: FeedbackStatus }) {
  const navigate = useNavigate();
  const [suche] = useSearchParams();
  const rueckweg = leseRueckweg(suche, EINGANG);
  // Gesendet in diesem Aufruf: der Dank - auch wenn der Stand inzwischen
  // „abgegeben“ sagt.
  const [gesendet, setGesendet] = useState<{ mitNamen: boolean } | null>(null);
  const name = monatsname(stand.month);

  if (gesendet) {
    return (
      <GefuehrterAblauf
        titel="Danke!"
        objekt={`Barometer ${name}`}
        schliessen="Schließen"
        onSchliessen={() => void navigate(rueckweg)}
        seite="danke"
        abschluss
        fuss={
          <Button className="w-full" data-autofocus onClick={() => void navigate(rueckweg)}>
            Fertig
          </Button>
        }
      >
        <Statusmeldung ton="erfolg">
          {gesendet.mitNamen
            ? 'Mit deinem Namen an die Praxisleitung gesendet.'
            : 'Ohne Namen gesendet. Deine Antworten erscheinen nur in einer Summe.'}
        </Statusmeldung>
      </GefuehrterAblauf>
    );
  }

  if (stand.barometer_submitted) {
    return (
      <>
        <Rueckweg standard={EINGANG} />
        <PageHeader title={`Barometer ${name}`} />
        <EmptyState
          inKarte
          title={`Für ${name} schon abgegeben`}
          description="Das nächste Barometer gibt es im nächsten Monat."
          aktion={
            <ButtonLink to={rueckweg} variant="secondary">
              Zurück
            </ButtonLink>
          }
        />
      </>
    );
  }

  return (
    <BarometerAblauf
      monat={stand.month}
      rueckweg={rueckweg}
      onGesendet={(mitNamen) => setGesendet({ mitNamen })}
    />
  );
}

/**
 * Die Praxissumme für owner (§20.2 Nr. 4): Median und Verteilung je Frage,
 * die Freitexte gemischt - oder „noch zu wenige“. Die Schwelle prüft der
 * Server; hier steht nur, was er liefert.
 */
function Auswertung() {
  const summe = useQuery({
    queryKey: FEEDBACK_SUMMARY_KEY,
    queryFn: fetchFeedbackSummary,
    retry: false,
  });
  return (
    <>
      <Rueckweg standard={EINGANG} />
      <PageHeader title="Barometer" description="Antworten ohne Namen, als Summe der Praxis" />
      <Abfragezustand
        abfrage={summe}
        laden="Auswertung wird geladen …"
        fehler="Die Auswertung konnte nicht geladen werden."
      >
        {(daten) => <Summe daten={daten} />}
      </Abfragezustand>
    </>
  );
}

const ZU_WENIGE = 'Noch zu wenige Antworten für eine Auswertung';

function Summe({ daten }: { daten: FeedbackSummary }) {
  const { barometer, messages } = daten;
  return (
    <div className="flex flex-col gap-8 [&>*]:mt-0">
      {barometer.status === 'ready' ? (
        <>
          <Section
            titel={`${zeitraum(barometer.from_month, barometer.to_month)} · ${barometer.answers} Antworten`}
          >
            <ListRows beschriftung="Skalen">
              {SKALEN.map(({ schluessel, kurz }) => (
                <ListRow key={schluessel} titel={kurz} meta={skalenSumme(barometer[schluessel])} />
              ))}
            </ListRows>
          </Section>
          {TEXTE.map(({ schluessel, kurz }) => {
            const texte = schluessel === 'easier' ? barometer.easier_texts : barometer.more_texts;
            return (
              <Listenabschnitt
                key={schluessel}
                titel={kurz}
                anzahl={texte.length}
                leer={{ titel: 'Keine Antworten' }}
              >
                {texte.map((text, index) => (
                  <ListRow
                    key={`${schluessel}-${index}`}
                    titel={<span className="break-words whitespace-pre-line">{text}</span>}
                  />
                ))}
              </Listenabschnitt>
            );
          })}
        </>
      ) : (
        <Section titel="Barometer">
          <EmptyState inKarte title={ZU_WENIGE} />
        </Section>
      )}
      {messages.status === 'ready' ? (
        <Listenabschnitt
          titel={`Rückmeldungen ohne Namen · ${zeitraum(messages.from_month, messages.to_month)}`}
          anzahl={messages.texts.length}
        >
          {messages.texts.map((text, index) => (
            <ListRow
              key={`nachricht-${index}`}
              titel={<span className="break-words whitespace-pre-line">{text}</span>}
            />
          ))}
        </Listenabschnitt>
      ) : (
        <Section titel="Rückmeldungen ohne Namen">
          <EmptyState inKarte title={ZU_WENIGE} />
        </Section>
      )}
      <Kleingedrucktes>
        Ohne Namen abgegebene Antworten erscheinen erst ab fünf Antworten und drei möglichen
        Teilnehmenden, gemischt und ohne Monat; der laufende Monat zählt nach seinem Ende.
        Namentliche stehen im Eingang.
      </Kleingedrucktes>
    </div>
  );
}
