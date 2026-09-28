import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Field } from '@/components/ui/Field';
import { TextArea } from '@/components/ui/TextArea';
import { Section, Feldgruppe } from '@/components/ui/Section';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { canWriteTreatmentNote, isOwner, type CurrentUser } from '@/features/session/types';
import { leseRueckweg } from '@/lib/rueckweg';
import { FREITEXT } from './format';
import { EINGABETEXTE, useTextverlustschutz, type Verlustschutztexte } from './Textverlustschutz';
import {
  MAX_BAUSTEIN,
  MAX_TITEL,
  bausteinFehler,
  createTextSnippet,
  deleteTextSnippet,
  fetchTextSnippets,
  updateTextSnippet,
  type TextSnippet,
} from './textbausteine';

/**
 * Textbausteine pflegen (UX-008).
 *
 * Ohne diese Seite wäre die Bausteinleiste in der Dokumentation dauerhaft
 * leer - deshalb gehört sie zur Story und nicht in einen späteren Loop.
 *
 * Zwei Geltungsbereiche, sichtbar getrennt: Bausteine der Praxis gelten für
 * alle und dürfen nur von der Praxisinhaber:in angelegt werden; eigene gehören
 * der angemeldeten Person und sieht sonst niemand. Der Geltungsbereich ist
 * nachträglich nicht änderbar - das ist keine Einschränkung der Oberfläche,
 * sondern eine Festlegung der Serverfunktion.
 *
 * **Ungespeichertes geht nicht still verloren (DOK-03, ZST-05).** Ein
 * Baustein hat bis zu 2.000 Zeichen; ein Tipp in die Navigation verwarf sie
 * bis UXR-008 ohne Rückfrage. Der Schutz sitzt auf der Seite und nicht im
 * Formular - ein Router hält nur eine Sperre, und es können mehrere Formulare
 * offen sein (Anlegen und Bearbeiten). Einen Entwurf gibt es nicht, also nur
 * „Verwerfen und weitergehen“ und „Hier bleiben“ (ANN-046).
 */

/** Die Sätze des Schutzes: Eingaben, nicht Text im Feld der Dokumentation. */
const BAUSTEINTEXTE: Verlustschutztexte = {
  ...EINGABETEXTE,
  bezeichnung: 'Ungespeicherter Textbaustein',
};

/** Die Bausteinseite ist eine Bereichsseite; zurück geht es nur, wenn jemand kam. */
function Herkunft({ pfad }: { pfad: string }) {
  // Die Leiste der Dokumentation schickt ihre Seite mit (DOK-01). Aus dem Pfad
  // allein hieße das Ziel „Zurück zum Termin“ - gemeint ist aber das Feld.
  return /^\/termine\/[^/?]+\/(abschluss|dokumentation)/.test(pfad) ? (
    <Rueckweg standard={pfad} beschriftung="Zurück zur Dokumentation" />
  ) : (
    <Rueckweg standard={pfad} />
  );
}

function BausteinFormular({
  formularId,
  baustein,
  darfPraxisweit,
  onFertig,
  onAbbrechen,
  onUngespeichert,
  schutz,
}: {
  /** Kennung für den Schutz der Seite: „neu“ oder die des Bausteins. */
  formularId: string;
  /** Vorhandener Baustein zum Ändern; ohne ihn wird angelegt. */
  baustein?: TextSnippet;
  darfPraxisweit: boolean;
  /** Nach dem Speichern, mit dem Titel des gespeicherten Bausteins. */
  onFertig: (titel: string) => void;
  onAbbrechen?: () => void;
  /** Meldet der Seite, ob hier etwas Ungespeichertes steht. */
  onUngespeichert: (formularId: string, ungespeichert: boolean) => void;
  /** Hinweise und Rückfrage des Schutzes, wenn dieses Formular gemeint ist. */
  schutz: ReactNode;
}) {
  const queryClient = useQueryClient();
  const [titel, setTitel] = useState(baustein?.title ?? '');
  const [text, setText] = useState(baustein?.body ?? '');
  const [praxisweit, setPraxisweit] = useState(baustein?.shared ?? false);
  const [fehler, setFehler] = useState<Partial<Record<string, string>>>({});

  const ungespeichert =
    titel !== (baustein?.title ?? '') ||
    text !== (baustein?.body ?? '') ||
    praxisweit !== (baustein?.shared ?? false);

  useEffect(() => {
    onUngespeichert(formularId, ungespeichert);
  }, [formularId, ungespeichert, onUngespeichert]);

  // Ein geschlossenes Formular hält nichts mehr fest.
  useEffect(() => () => onUngespeichert(formularId, false), [formularId, onUngespeichert]);

  const speichern = useMutation({
    mutationFn: async (eingabe: { titel: string; text: string; praxisweit: boolean }) => {
      if (baustein) {
        await updateTextSnippet(baustein.id, eingabe.titel, eingabe.text);
        return;
      }
      await createTextSnippet(eingabe.titel, eingabe.text, eingabe.praxisweit);
    },
    onSuccess: async (_ergebnis, eingabe) => {
      await queryClient.invalidateQueries({ queryKey: ['text-snippets'] });
      // Das Formular schließt danach; es bleibt nichts zurückzusetzen.
      onFertig(eingabe.titel);
    },
  });

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (speichern.isPending) return;
        const gefunden = bausteinFehler(titel, text);
        setFehler(gefunden);
        if (Object.keys(gefunden).length > 0) return;
        speichern.mutate({ titel, text, praxisweit });
      }}
      className="max-w-xl"
    >
      <Feldgruppe>
        <Field
          label="Titel *"
          hint="Erscheint als Beschriftung des Knopfes über dem Freitext."
          maxLength={MAX_TITEL}
          value={titel}
          error={fehler['title']}
          onChange={(event) => {
            setTitel(event.target.value);
            if (fehler['title']) setFehler((bisher) => ({ ...bisher, title: undefined }));
          }}
        />

        <TextArea
          label="Text *"
          hint="Wird unverändert eingefügt. Keine Platzhalter, keine Angaben aus einer Akte."
          rows={5}
          maxLength={MAX_BAUSTEIN}
          value={text}
          error={fehler['body']}
          onChange={(event) => {
            setText(event.target.value);
            if (fehler['body']) setFehler((bisher) => ({ ...bisher, body: undefined }));
          }}
        />

        {/* Der Geltungsbereich wird nur beim Anlegen gewählt - mit dem
            Kästchen des Systems samt Hinweis (DOK-13). */}
        {!baustein && darfPraxisweit ? (
          <Checkbox
            label="Baustein der Praxis"
            hint="Erscheint bei allen dokumentierenden Personen. Ohne Haken gehört der Baustein nur Ihnen."
            checked={praxisweit}
            onChange={(event) => setPraxisweit(event.target.checked)}
          />
        ) : null}
      </Feldgruppe>

      {schutz}

      {speichern.isError ? (
        <Statusmeldung ton="fehler" className="mt-4">
          {speichern.error.message}
        </Statusmeldung>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        <Button type="submit" disabled={speichern.isPending}>
          {speichern.isPending ? 'Wird gespeichert …' : baustein ? 'Speichern' : 'Baustein anlegen'}
        </Button>
        {onAbbrechen ? (
          <Button type="button" variant="quiet" onClick={onAbbrechen}>
            Abbrechen
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function BausteinKarte({
  baustein,
  onUngespeichert,
  schutz,
}: {
  baustein: TextSnippet;
  onUngespeichert: (formularId: string, ungespeichert: boolean) => void;
  schutz: ReactNode;
}) {
  const queryClient = useQueryClient();
  const [bearbeiten, setBearbeiten] = useState(false);

  const loeschen = useMutation({
    mutationFn: () => deleteTextSnippet(baustein.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['text-snippets'] }),
  });

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-ink text-liste font-medium">{baustein.title}</p>
        <Badge ton={baustein.shared ? 'akzent' : 'neutral'}>
          {baustein.shared ? 'Praxis' : 'Nur ich'}
        </Badge>
      </div>

      {bearbeiten ? (
        <div className="mt-3">
          <BausteinFormular
            formularId={baustein.id}
            baustein={baustein}
            darfPraxisweit={false}
            onFertig={() => setBearbeiten(false)}
            onAbbrechen={() => setBearbeiten(false)}
            onUngespeichert={onUngespeichert}
            schutz={schutz}
          />
        </div>
      ) : (
        <>
          {/* Lesebreite statt voller Kartenbreite (DOK-22); lange Ketten
              brechen um (DOK-23). */}
          <p className={`text-ink-muted mt-2 max-w-prose text-sm leading-relaxed ${FREITEXT}`}>
            {baustein.body}
          </p>
          {baustein.editable ? (
            <div className="mt-3 flex flex-wrap items-start gap-3">
              <Button type="button" variant="secondary" onClick={() => setBearbeiten(true)}>
                Bearbeiten
              </Button>
              <Rueckfrage
                ausloeser="Löschen"
                bezeichnung={`Baustein „${baustein.title}“ löschen`}
                bestaetigen="Ja, Baustein löschen"
                bestaetigenLaeuft="Wird gelöscht …"
                fehler={loeschen.isError ? loeschen.error.message : undefined}
                laeuft={loeschen.isPending}
                onBestaetigen={() => loeschen.mutateAsync()}
              >
                Der Baustein wird gelöscht. Bereits geschriebene Dokumentation bleibt davon
                unberührt – ein Baustein ist eine Vorlage, kein Bestandteil der Akte.
              </Rueckfrage>
            </div>
          ) : (
            <p className="text-ink-muted mt-3 text-xs">
              Bausteine der Praxis pflegt die Praxisinhaber:in.
            </p>
          )}
        </>
      )}
    </Card>
  );
}

export function TextbausteinePage({ user }: { user: CurrentUser }) {
  const darf = canWriteTreatmentNote(user.roles);
  const darfPraxisweit = isOwner(user.roles);
  const [suche] = useSearchParams();
  const herkunft = leseRueckweg(suche, '');
  const [anlegen, setAnlegen] = useState(false);
  // Der Titel des zuletzt angelegten Bausteins - für die Bestätigung (DOK-15).
  const [angelegt, setAngelegt] = useState<string | null>(null);
  const bestaetigung = useRef<HTMLDivElement>(null);

  // Welche offenen Formulare Ungespeichertes tragen. Ein Schutz für die ganze
  // Seite: Der Router hält nur eine Sperre.
  const [offen, setOffen] = useState<Readonly<Record<string, boolean>>>({});
  const melden = useCallback((formularId: string, ungespeichert: boolean) => {
    setOffen((bisher) =>
      Boolean(bisher[formularId]) === ungespeichert
        ? bisher
        : { ...bisher, [formularId]: ungespeichert },
    );
  }, []);
  const betroffen = Object.keys(offen).find((formularId) => offen[formularId]);
  const { schutz } = useTextverlustschutz({
    ungespeichert: betroffen !== undefined,
    texte: BAUSTEINTEXTE,
  });
  // Die Rückfrage erscheint in dem Formular, in dem gearbeitet wird.
  const schutzFuer = (formularId: string) => (formularId === betroffen ? schutz : null);

  // Das Formular klappt nach dem Anlegen zu, und die neue Karte kann unter dem
  // sichtbaren Bereich liegen. Die Bestätigung steht über der Liste und
  // bekommt den Fokus, der sonst an den Seitenanfang fiele (DOK-15).
  useEffect(() => {
    if (angelegt) bestaetigung.current?.focus();
  }, [angelegt]);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['text-snippets'],
    queryFn: fetchTextSnippets,
    enabled: darf,
    retry: false,
  });

  if (!darf) {
    return (
      <ErrorState
        title="Nicht freigegeben"
        description="Textbausteine gehören zur Behandlungsdokumentation und stehen Therapeut:innen und der Teamleitung offen."
      />
    );
  }

  const praxis = (data ?? []).filter((baustein) => baustein.shared);
  const eigene = (data ?? []).filter((baustein) => !baustein.shared);

  return (
    <>
      {herkunft ? <Herkunft pfad={herkunft} /> : null}

      <PageHeader
        title="Textbausteine"
        description="Vorbereitete Formulierungen für die Behandlungsdokumentation. Sie werden unverändert eingefügt – ohne Platzhalter und ohne Angaben aus einer Akte."
        actions={
          anlegen ? null : (
            <Button
              type="button"
              onClick={() => {
                setAngelegt(null);
                setAnlegen(true);
              }}
            >
              Baustein anlegen
            </Button>
          )
        }
      />

      {anlegen ? (
        <Section titel="Neuer Baustein">
          <BausteinFormular
            formularId="neu"
            darfPraxisweit={darfPraxisweit}
            onFertig={(titel) => {
              setAnlegen(false);
              setAngelegt(titel);
            }}
            onAbbrechen={() => setAnlegen(false)}
            onUngespeichert={melden}
            schutz={schutzFuer('neu')}
          />
        </Section>
      ) : null}

      {angelegt ? (
        <div ref={bestaetigung} tabIndex={-1} className="mb-2">
          <Statusmeldung ton="erfolg">Baustein „{angelegt}“ angelegt.</Statusmeldung>
        </div>
      ) : null}

      {isPending ? <LoadingState label="Bausteine werden geladen …" /> : null}
      {isError ? (
        <ErrorState
          title="Die Textbausteine konnten nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => refetch()}
        />
      ) : null}

      {data ? (
        <>
          <Section
            titel="Bausteine der Praxis"
            hinweis="Für alle dokumentierenden Personen. Anlegen und ändern darf sie die Praxisinhaber:in."
          >
            {praxis.length === 0 ? (
              <p className="text-ink-muted text-liste">Noch keine Bausteine der Praxis.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {praxis.map((baustein) => (
                  <BausteinKarte
                    key={baustein.id}
                    baustein={baustein}
                    onUngespeichert={melden}
                    schutz={schutzFuer(baustein.id)}
                  />
                ))}
              </div>
            )}
          </Section>

          <Section titel="Meine Bausteine" hinweis="Sieht außer Ihnen niemand.">
            {eigene.length === 0 ? (
              <p className="text-ink-muted text-liste">Noch keine eigenen Bausteine.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {eigene.map((baustein) => (
                  <BausteinKarte
                    key={baustein.id}
                    baustein={baustein}
                    onUngespeichert={melden}
                    schutz={schutzFuer(baustein.id)}
                  />
                ))}
              </div>
            )}
          </Section>
        </>
      ) : null}

      <p className="text-ink-muted mt-10 max-w-prose text-xs leading-relaxed">
        Anlegen, Ändern und Löschen werden protokolliert – mit Titel und Geltungsbereich, ohne den
        Text selbst.
      </p>
    </>
  );
}
