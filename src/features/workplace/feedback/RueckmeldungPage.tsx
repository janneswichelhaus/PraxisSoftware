import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Feedback';
import { GefuehrterAblauf } from '@/components/ui/GefuehrterAblauf';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { ListRow } from '@/components/ui/ListRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { TextArea } from '@/components/ui/TextArea';
import { KeinZugang } from '@/app/KeinZugang';
import { EINGABETEXTE, useTextverlustschutz } from '@/app/Textverlustschutz';
import { EINGANG } from '@/lib/eingang';
import type { CurrentUser } from '@/features/core';
import { leseRueckweg } from '@/lib/rueckweg';
import {
  FEEDBACK_KEY,
  FEEDBACK_STATUS_KEY,
  FEEDBACK_SUMMARY_KEY,
  fetchFeedbackStatus,
  fetchFeedbackSummary,
  submitMessage,
  type FeedbackSummary,
} from './api';
import { TEXT_MAX, WER_SIEHT_WAS, zeitraum } from './fragen';
import { NamentlicheRueckmeldungen } from './NamentlicheRueckmeldungen';

/**
 * „Rückmeldung an die Praxisleitung“ (ANN-608): jederzeit ein Freitext, mit oder ohne Namen, zwei
 * gleichwertige Knöpfe. owner nimmt nicht teil und liest hier die namentlichen einzeln und die
 * ohne Namen als Summe.
 */
export function RueckmeldungPage({ user }: { user: CurrentUser }) {
  const status = useQuery({
    queryKey: FEEDBACK_STATUS_KEY,
    queryFn: fetchFeedbackStatus,
    retry: false,
  });
  return (
    <Abfragezustand
      abfrage={status}
      laden="Wird geladen …"
      fehler="Die Seite konnte nicht geladen werden."
      rahmen={(zustand) => (
        <>
          <PageHeader title="Rückmeldung an die Praxisleitung" />
          {zustand}
        </>
      )}
    >
      {(stand) =>
        stand.can_read ? (
          <>
            <Rueckweg standard={EINGANG} />
            <PageHeader title="Rückmeldungen" description="An die Praxisleitung" />
            <div className="flex flex-col gap-8 [&>*]:mt-0">
              <NamentlicheRueckmeldungen art="message" titel="Mit Namen" />
              <OhneNamen />
            </div>
          </>
        ) : stand.can_take_part ? (
          <Schreiben />
        ) : (
          <KeinZugang user={user} />
        )
      }
    </Abfragezustand>
  );
}

const TEXTE_VERLUST = {
  ...EINGABETEXTE,
  bezeichnung: 'Rückmeldung noch nicht gesendet',
  weitergehen: 'Deine Rückmeldung ist noch nicht gesendet. Beim Weitergehen geht sie verloren.',
  abmelden: 'Deine Rückmeldung ist noch nicht gesendet. Beim Abmelden geht sie verloren.',
  zeile: {
    weitergehen: 'Noch nicht gesendet.',
    abmelden: 'Noch nicht gesendet – abmelden?',
    bleiben: 'Weiterschreiben',
  },
};

function Schreiben() {
  const navigate = useNavigate();
  const [suche] = useSearchParams();
  const rueckweg = leseRueckweg(suche, EINGANG);
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [gesendet, setGesendet] = useState<{ mitNamen: boolean } | null>(null);

  const { freigeben, schutz } = useTextverlustschutz({
    ungespeichert: gesendet === null && text.trim() !== '',
    kompakt: true,
    texte: TEXTE_VERLUST,
  });

  const senden = useMutation({
    mutationFn: (mitNamen: boolean) => submitMessage({ named: mitNamen, text }),
    onSuccess: async (antwort) => {
      freigeben();
      await queryClient.invalidateQueries({ queryKey: FEEDBACK_KEY });
      setGesendet({ mitNamen: antwort.named });
    },
  });

  const gemeinsam = {
    objekt: 'Rückmeldung an die Praxisleitung',
    schliessen: 'Schließen',
    onSchliessen: () => void navigate(rueckweg),
    schutz,
  };

  if (gesendet) {
    return (
      <GefuehrterAblauf
        {...gemeinsam}
        titel="Danke!"
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
            : 'Ohne Namen gesendet. Die Praxisleitung liest sie erst, wenn genug Rückmeldungen ohne Namen da sind.'}
        </Statusmeldung>
      </GefuehrterAblauf>
    );
  }

  const leer = text.trim() === '';
  return (
    <GefuehrterAblauf
      {...gemeinsam}
      titel="Was möchtest du der Praxisleitung sagen?"
      seite="text"
      fuss={
        <div className="flex flex-col gap-3">
          {senden.isError ? (
            <Statusmeldung ton="fehler">
              {senden.error instanceof Error
                ? senden.error.message
                : 'Die Rückmeldung konnte nicht gesendet werden.'}
            </Statusmeldung>
          ) : null}
          <Kleingedrucktes>{WER_SIEHT_WAS}</Kleingedrucktes>
          {/* Zwei gleichwertige Knöpfe (§20.2 Nr. 1), nichts vorgewählt. */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              className="w-full px-2"
              disabled={leer || senden.isPending}
              onClick={() => senden.mutate(true)}
            >
              Mit Namen senden
            </Button>
            <Button
              variant="secondary"
              className="w-full px-2"
              disabled={leer || senden.isPending}
              onClick={() => senden.mutate(false)}
            >
              Ohne Namen senden
            </Button>
          </div>
        </div>
      }
    >
      <TextArea
        label="Deine Rückmeldung"
        value={text}
        maxLength={TEXT_MAX}
        rows={7}
        data-autofocus
        onChange={(e) => setText(e.target.value)}
      />
    </GefuehrterAblauf>
  );
}

/**
 * Die Praxissumme der Rückmeldungen ohne Namen (§20.2 Nr. 4): die Texte gemischt - oder „noch zu
 * wenige“. Die Schwelle prüft der Server; hier steht nur, was er liefert.
 */
function OhneNamen() {
  const summe = useQuery({
    queryKey: FEEDBACK_SUMMARY_KEY,
    queryFn: fetchFeedbackSummary,
    retry: false,
  });
  return (
    <Abfragezustand
      abfrage={summe}
      laden="Rückmeldungen ohne Namen werden geladen …"
      fehler="Die Rückmeldungen ohne Namen konnten nicht geladen werden."
    >
      {(daten) => <Summe daten={daten} />}
    </Abfragezustand>
  );
}

function Summe({ daten: { messages } }: { daten: FeedbackSummary }) {
  return (
    <div className="flex flex-col gap-3 [&>*]:mt-0">
      {messages.status === 'ready' ? (
        <Listenabschnitt
          titel={`Ohne Namen · ${zeitraum(messages.from_month, messages.to_month)}`}
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
        <Section titel="Ohne Namen">
          <EmptyState inKarte title="Noch zu wenige Rückmeldungen für eine Auswertung" />
        </Section>
      )}
      <Kleingedrucktes>
        Ohne Namen gesendete Rückmeldungen erscheinen erst ab fünf und drei möglichen Teilnehmenden,
        gemischt und ohne Monat; der laufende Monat zählt nach seinem Ende.
      </Kleingedrucktes>
    </div>
  );
}
