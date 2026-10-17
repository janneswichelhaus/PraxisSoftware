import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { GefuehrterAblauf } from '@/components/ui/GefuehrterAblauf';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Skala } from '@/components/ui/Skala';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { TextArea } from '@/components/ui/TextArea';
import {
  aendern,
  beginne,
  kannZurueck,
  weiter,
  zurueck,
  type Abfolge,
} from '@/components/ui/abfolge';
import { EINGABETEXTE, useTextverlustschutz } from '@/features/documentation/Textverlustschutz';
import { FEEDBACK_KEY, submitBarometer, type BarometerAnswers } from './api';
import {
  SKALEN,
  TEXTE,
  TEXT_MAX,
  WER_SIEHT_WAS,
  monatsname,
  type SkalenFrage,
  type TextFrage,
} from './fragen';
import { etwasBeantwortet, skalenText } from './inhalt';

/**
 * Das Barometer als geführter Ablauf (ORG-006, ANN-607): eine Frage je Seite,
 * jede überspringbar, nichts vorbelegt. Die Skala ist die Antwort - ein Tipp
 * führt weiter. Am Ende die Zusammenfassung mit „Ändern“ je Frage und zwei
 * gleichwertigen Knöpfen: mit oder ohne Namen (§20.2 Nr. 1). Kein Tipp, welche
 * Wahl die bessere wäre.
 *
 * Vom Hinweis in der Übersicht bis abgeschickt sind es sieben Tipps, wenn die
 * Freitexte leer bleiben: „Jetzt“, drei Skalen, zweimal „Überspringen“,
 * „Senden“.
 */

type Seite = SkalenFrage | TextFrage | 'abschluss';

const FOLGE: readonly Seite[] = ['mood', 'tours', 'team', 'easier', 'more', 'abschluss'];
const FRAGEN = 5;

const TEXTE_VERLUST = {
  ...EINGABETEXTE,
  bezeichnung: 'Barometer noch nicht gesendet',
  weitergehen: 'Deine Antworten sind noch nicht gesendet. Beim Weitergehen gehen sie verloren.',
  abmelden: 'Deine Antworten sind noch nicht gesendet. Beim Abmelden gehen sie verloren.',
  zeile: {
    weitergehen: 'Noch nicht gesendet.',
    abmelden: 'Noch nicht gesendet – abmelden?',
    bleiben: 'Weiter',
  },
};

const LEER: BarometerAnswers = { mood: null, tours: null, team: null, easier: '', more: '' };

export function BarometerAblauf({
  monat,
  rueckweg,
  onGesendet,
}: {
  /** Der laufende Monat der Praxis, `YYYY-MM-01`. */
  monat: string;
  rueckweg: string;
  onGesendet: (mitNamen: boolean) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [ablauf, setAblauf] = useState<Abfolge<Seite>>(() => beginne<Seite>('mood'));
  const [antworten, setAntworten] = useState<BarometerAnswers>(LEER);
  const seite = ablauf.seite;
  const name = monatsname(monat);

  const naechste = (von: Seite): Seite => FOLGE[FOLGE.indexOf(von) + 1] ?? 'abschluss';
  // Aus „Ändern“ geht es nach der Antwort zurück zum Abschluss.
  const vor = () => setAblauf(weiter(ablauf, naechste(seite), true));
  const goBack = () => {
    const vorher = zurueck(ablauf);
    if (vorher) setAblauf(vorher);
  };

  const { freigeben, schutz } = useTextverlustschutz({
    ungespeichert: etwasBeantwortet(antworten),
    kompakt: true,
    texte: TEXTE_VERLUST,
    schrittZurueck: kannZurueck(ablauf) ? goBack : undefined,
  });

  const senden = useMutation({
    mutationFn: (mitNamen: boolean) => submitBarometer({ named: mitNamen, answers: antworten }),
    onSuccess: async (antwort) => {
      freigeben();
      await queryClient.invalidateQueries({ queryKey: FEEDBACK_KEY });
      onGesendet(antwort.named);
    },
  });

  const schritt = FOLGE.indexOf(seite) + 1;
  const gemeinsam = {
    objekt: `Barometer ${name}`,
    schliessen: 'Barometer schließen',
    onSchliessen: () => void navigate(rueckweg),
    seite,
    stand:
      seite === 'abschluss'
        ? undefined
        : { text: `Frage ${schritt} von ${FRAGEN}`, wert: schritt, von: FRAGEN },
    onZurueck: kannZurueck(ablauf) ? goBack : undefined,
    schutz,
  };

  // ---------------------------------------------------------------------------
  const skala = SKALEN.find((s) => s.schluessel === seite);
  if (skala) {
    return (
      <GefuehrterAblauf
        {...gemeinsam}
        titel={skala.frage}
        fuss={
          <div className="flex flex-col gap-2">
            <Skala
              beschriftung={skala.frage}
              links={skala.links}
              rechts={skala.rechts}
              wert={antworten[skala.schluessel]}
              onWaehlen={(wert) => {
                setAntworten({ ...antworten, [skala.schluessel]: wert });
                vor();
              }}
            />
            <Button
              variant="quiet"
              className="w-full"
              onClick={() => {
                setAntworten({ ...antworten, [skala.schluessel]: null });
                vor();
              }}
            >
              Überspringen
            </Button>
          </div>
        }
      />
    );
  }

  // ---------------------------------------------------------------------------
  const text = TEXTE.find((t) => t.schluessel === seite);
  if (text) {
    const wert = antworten[text.schluessel];
    return (
      <GefuehrterAblauf
        {...gemeinsam}
        titel={text.frage}
        fuss={
          <Button className="w-full" onClick={vor}>
            {wert.trim() === '' ? 'Überspringen' : 'Weiter'}
          </Button>
        }
      >
        <TextArea
          label="Deine Antwort – freiwillig"
          value={wert}
          maxLength={TEXT_MAX}
          rows={5}
          data-autofocus
          onChange={(e) => setAntworten({ ...antworten, [text.schluessel]: e.target.value })}
        />
      </GefuehrterAblauf>
    );
  }

  // ---------------------------------------------------------------------------
  // Abschluss: was gesendet würde, und die Wahl mit oder ohne Namen.
  const beantwortet = etwasBeantwortet(antworten);
  return (
    <GefuehrterAblauf
      {...gemeinsam}
      titel="Senden?"
      abschluss
      fuss={
        <div className="flex flex-col gap-3">
          {senden.isError ? (
            <Statusmeldung ton="fehler">
              {senden.error instanceof Error
                ? senden.error.message
                : 'Das Barometer konnte nicht gesendet werden.'}
            </Statusmeldung>
          ) : null}
          {beantwortet ? null : <p className="text-ink-muted text-sm">Noch nichts beantwortet.</p>}
          <Kleingedrucktes>{WER_SIEHT_WAS}</Kleingedrucktes>
          {/* Zwei gleichwertige Knöpfe, gleiche Größe und Art (§20.2 Nr. 1):
              nichts ist vorgewählt, keiner ist der „richtige“. */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              className="w-full px-2"
              disabled={!beantwortet || senden.isPending}
              onClick={() => senden.mutate(true)}
            >
              Mit Namen senden
            </Button>
            <Button
              variant="secondary"
              className="w-full px-2"
              disabled={!beantwortet || senden.isPending}
              onClick={() => senden.mutate(false)}
            >
              Ohne Namen senden
            </Button>
          </div>
        </div>
      }
    >
      <ListRows rahmen={false} beschriftung="Deine Antworten">
        {SKALEN.map(({ schluessel, kurz }) => (
          <ListRow
            key={schluessel}
            titel={kurz}
            meta={skalenText(antworten[schluessel])}
            aktion={
              <Button
                variant="secondary"
                groesse="kompakt"
                aria-label={`${kurz} ändern`}
                onClick={() => setAblauf(aendern(ablauf, schluessel))}
              >
                Ändern
              </Button>
            }
          />
        ))}
        {TEXTE.map(({ schluessel, kurz }) => {
          const wert = antworten[schluessel].trim();
          return (
            <ListRow
              key={schluessel}
              titel={kurz}
              meta={
                wert === '' ? (
                  'übersprungen'
                ) : (
                  <span className="break-words whitespace-pre-line">{wert}</span>
                )
              }
              aktion={
                <Button
                  variant="secondary"
                  groesse="kompakt"
                  aria-label={`${kurz} ändern`}
                  onClick={() => setAblauf(aendern(ablauf, schluessel))}
                >
                  Ändern
                </Button>
              }
            />
          );
        })}
      </ListRows>
    </GefuehrterAblauf>
  );
}
