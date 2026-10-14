import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { TextArea } from '@/components/ui/TextArea';
import { Section, Feldgruppe } from '@/components/ui/Section';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Badge } from '@/components/ui/Badge';
import { Disclosure } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/Feedback';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Textlink } from '@/components/ui/Textlink';
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
 * Jede Person legt sich eigene Bausteine an; sie gehören ihr, und sonst sieht
 * sie niemand. „Meine Bausteine“ ist deshalb der Inhalt der Seite (B5).
 * Bausteine der Praxis stehen nicht mehr in der Leiste
 * (`TextbausteinLeiste`), und neue legt die Seite nicht mehr an. Vorhandene
 * sieht nur die Praxisinhaber:in, eingeklappt am Ende, und kann sie löschen -
 * damit nichts unsichtbar liegen bleibt. Der Geltungsbereich ist nachträglich
 * nicht änderbar - eine Festlegung der Serverfunktion.
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
  onFertig,
  onAbbrechen,
  onUngespeichert,
  schutz,
}: {
  /** Kennung für den Schutz der Seite: „neu“ oder die des Bausteins. */
  formularId: string;
  /** Vorhandener Baustein zum Ändern; ohne ihn wird ein eigener angelegt. */
  baustein?: TextSnippet;
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
  const [fehler, setFehler] = useState<Partial<Record<string, string>>>({});

  const ungespeichert = titel !== (baustein?.title ?? '') || text !== (baustein?.body ?? '');

  useEffect(() => {
    onUngespeichert(formularId, ungespeichert);
  }, [formularId, ungespeichert, onUngespeichert]);

  // Ein geschlossenes Formular hält nichts mehr fest.
  useEffect(() => () => onUngespeichert(formularId, false), [formularId, onUngespeichert]);

  const speichern = useMutation({
    mutationFn: async (eingabe: { titel: string; text: string }) => {
      if (baustein) {
        await updateTextSnippet(baustein.id, eingabe.titel, eingabe.text);
        return;
      }
      // Neu ist immer ein eigener Baustein (B5).
      await createTextSnippet(eingabe.titel, eingabe.text, false);
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
        speichern.mutate({ titel, text });
      }}
      className="max-w-formular"
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
      </Feldgruppe>

      {schutz}

      {speichern.isError ? (
        <Statusmeldung ton="fehler" className="mt-4">
          {speichern.error.message}
        </Statusmeldung>
      ) : null}

      <Formularfuss>
        <Button type="submit" disabled={speichern.isPending}>
          {speichern.isPending ? 'Wird gespeichert …' : baustein ? 'Speichern' : 'Baustein anlegen'}
        </Button>
        {onAbbrechen ? (
          <Button type="button" variant="quiet" onClick={onAbbrechen}>
            Abbrechen
          </Button>
        ) : null}
      </Formularfuss>
    </form>
  );
}

/** Die Adresse eines Bausteins: dieselbe Seite mit `?baustein=` (Liste → Einzelnes). */
const PARAMETER = 'baustein';

/**
 * Ein Baustein im Einzelnen (Design-Rollout B4: Liste → Detail statt einer
 * Karte je Baustein mit Text und Knöpfen): Kopf mit Titel und Geltungsbereich,
 * der Text im Rahmen, „Bearbeiten“ im Kopf und „Löschen“ leise am Ende, nach
 * einer Rückfrage. Ein Baustein der Praxis steht in keiner Leiste mehr; ihn
 * zu bearbeiten hätte keine Wirkung, er lässt sich nur noch löschen (B5).
 */
function BausteinDetail({
  baustein,
  zurListe,
  onUngespeichert,
  onGeloescht,
  schutz,
}: {
  baustein: TextSnippet;
  /** Die Liste, samt mitgereistem Rückweg. */
  zurListe: string;
  onUngespeichert: (formularId: string, ungespeichert: boolean) => void;
  onGeloescht: (titel: string) => void;
  schutz: ReactNode;
}) {
  const queryClient = useQueryClient();
  const [bearbeiten, setBearbeiten] = useState(false);

  const loeschen = useMutation({
    mutationFn: () => deleteTextSnippet(baustein.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['text-snippets'] });
      onGeloescht(baustein.title);
    },
  });

  return (
    <>
      <Textlink alleinstehend to={zurListe} className="mb-4 gap-1">
        <span aria-hidden="true">←</span> Alle Textbausteine
      </Textlink>
      <PageHeader
        title={baustein.title}
        description={
          baustein.shared
            ? 'Baustein der Praxis, nicht in der Leiste.'
            : 'Sieht außer Ihnen niemand.'
        }
        actions={
          baustein.editable && !baustein.shared && !bearbeiten ? (
            <Button type="button" variant="secondary" onClick={() => setBearbeiten(true)}>
              Bearbeiten
            </Button>
          ) : null
        }
      />

      <div className="max-w-formular">
        <Badge ton={baustein.shared ? 'akzent' : 'neutral'}>
          {baustein.shared ? 'Praxis' : 'Nur ich'}
        </Badge>

        {bearbeiten ? (
          <div className="mt-6">
            <BausteinFormular
              formularId={baustein.id}
              baustein={baustein}
              onFertig={() => setBearbeiten(false)}
              onAbbrechen={() => setBearbeiten(false)}
              onUngespeichert={onUngespeichert}
              schutz={schutz}
            />
          </div>
        ) : (
          <>
            <Section titel="Text" rahmen>
              {/* Lesebreite (DOK-22); lange Ketten brechen um (DOK-23). */}
              <p className={`text-ink text-liste max-w-prose leading-relaxed ${FREITEXT}`}>
                {baustein.body}
              </p>
            </Section>

            {/* Ohne `editable` steht hier nichts: Bausteine der Praxis sieht
                nur owner (B5), und owner darf sie laut Serverfunktion ändern. */}
            {baustein.editable ? (
              // Zerstörendes leise am Ende, mit Rückfrage (DESIGN.md Regel 10).
              <div className="mt-8">
                <Rueckfrage
                  ausloeser="Löschen"
                  ausloeserVariante="quiet"
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
            ) : null}
          </>
        )}
      </div>
    </>
  );
}

export function TextbausteinePage({ user }: { user: CurrentUser }) {
  const darf = canWriteTreatmentNote(user.roles);
  /** Nur die Praxisinhaber:in sieht die vorhandenen Bausteine der Praxis - zum Löschen. */
  const siehtPraxisbausteine = isOwner(user.roles);
  const [suche, setSuche] = useSearchParams();
  const herkunft = leseRueckweg(suche, '');
  const [anlegen, setAnlegen] = useState(false);
  // Was zuletzt geschehen ist - für die Bestätigung über der Liste (DOK-15).
  // Ein neuer Schlüssel je Meldung: Auch eine zweite nimmt den Fokus.
  const [meldung, setMeldung] = useState<{ text: string; schluessel: number } | null>(null);

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

  const abfrage = useQuery({
    queryKey: ['text-snippets'],
    queryFn: fetchTextSnippets,
    enabled: darf,
    retry: false,
  });

  /** Dieselbe Seite mit einem anderen Baustein (oder keinem), samt Rückweg. */
  function adresse(bausteinId: string | null): string {
    const neu = new URLSearchParams(suche);
    if (bausteinId) neu.set(PARAMETER, bausteinId);
    else neu.delete(PARAMETER);
    const text = neu.toString();
    return text ? `?${text}` : '?';
  }

  if (!darf) {
    return (
      <ErrorState
        title="Nicht freigegeben"
        description="Textbausteine gehören zur Behandlungsdokumentation und stehen Therapeut:innen und der Teamleitung offen."
      />
    );
  }

  const gewaehlt = abfrage.data?.find(
    (baustein) =>
      baustein.id === suche.get(PARAMETER) && (!baustein.shared || siehtPraxisbausteine),
  );
  if (gewaehlt) {
    return (
      <BausteinDetail
        key={gewaehlt.id}
        baustein={gewaehlt}
        zurListe={adresse(null)}
        onUngespeichert={melden}
        onGeloescht={(titel) => {
          setMeldung({ text: `Baustein „${titel}“ gelöscht.`, schluessel: Date.now() });
          // Zurück in die Liste, ohne den Baustein im Verlauf stehen zu lassen.
          setSuche(
            (bisher) => {
              const neu = new URLSearchParams(bisher);
              neu.delete(PARAMETER);
              return neu;
            },
            { replace: true },
          );
        }}
        schutz={schutzFuer(gewaehlt.id)}
      />
    );
  }

  const zeile = (baustein: TextSnippet) => (
    <ListRow
      key={baustein.id}
      to={adresse(baustein.id)}
      titel={baustein.title}
      meta={<span className="line-clamp-1">{baustein.body}</span>}
    />
  );

  return (
    <>
      {herkunft ? <Herkunft pfad={herkunft} /> : null}

      <PageHeader
        title="Textbausteine"
        description="Formulierungen für die Dokumentation."
        actions={
          anlegen ? null : (
            <Button
              type="button"
              onClick={() => {
                setMeldung(null);
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
            onFertig={(titel) => {
              setAnlegen(false);
              setMeldung({ text: `Baustein „${titel}“ angelegt.`, schluessel: Date.now() });
            }}
            onAbbrechen={() => setAnlegen(false)}
            onUngespeichert={melden}
            schutz={schutzFuer('neu')}
          />
        </Section>
      ) : null}

      {/* Das Formular klappt nach dem Anlegen zu, und die neue Zeile kann
          unter dem sichtbaren Bereich liegen: Die Bestätigung steht über der
          Liste und nimmt den Fokus (DOK-15). */}
      {meldung ? (
        <Rueckmeldung key={meldung.schluessel} className="mb-6">
          {meldung.text}
        </Rueckmeldung>
      ) : null}

      <div className={anlegen ? 'mt-8' : undefined}>
        <Abfragezustand
          abfrage={abfrage}
          laden="Bausteine werden geladen …"
          fehler="Die Textbausteine konnten nicht geladen werden."
        >
          {(daten) => {
            const eigene = daten.filter((baustein) => !baustein.shared);
            const derPraxis = siehtPraxisbausteine
              ? daten.filter((baustein) => baustein.shared)
              : [];
            return (
              <>
                <Listenabschnitt
                  titel="Meine Bausteine"
                  anzahl={eigene.length}
                  leer={{ titel: 'Noch keine eigenen Bausteine.' }}
                >
                  {eigene.map(zeile)}
                </Listenabschnitt>
                {/* Seltenes eingeklappt am Ende (DESIGN.md): Löschen im
                    einzelnen Baustein, mit Rückfrage. */}
                {derPraxis.length > 0 ? (
                  <div className="mt-8">
                    <Disclosure summary="Bausteine der Praxis (nicht in der Leiste)" kopf="label">
                      <ListRows>{derPraxis.map(zeile)}</ListRows>
                    </Disclosure>
                  </div>
                ) : null}
              </>
            );
          }}
        </Abfragezustand>
      </div>
    </>
  );
}
