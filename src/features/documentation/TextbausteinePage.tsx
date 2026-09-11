import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { TextArea } from '@/components/ui/TextArea';
import { Section, Feldgruppe } from '@/components/ui/Section';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { canWriteTreatmentNote, isOwner, type CurrentUser } from '@/features/session/types';
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
 * alle und dürfen nur von der Praxisleitung angelegt werden; eigene gehören
 * der angemeldeten Person und sieht sonst niemand. Der Geltungsbereich ist
 * nachträglich nicht änderbar - das ist keine Einschränkung der Oberfläche,
 * sondern eine Festlegung der Serverfunktion.
 */

function BausteinFormular({
  baustein,
  darfPraxisweit,
  onFertig,
  onAbbrechen,
}: {
  /** Vorhandener Baustein zum Ändern; ohne ihn wird angelegt. */
  baustein?: TextSnippet;
  darfPraxisweit: boolean;
  onFertig: () => void;
  onAbbrechen?: () => void;
}) {
  const queryClient = useQueryClient();
  const [titel, setTitel] = useState(baustein?.title ?? '');
  const [text, setText] = useState(baustein?.body ?? '');
  const [praxisweit, setPraxisweit] = useState(baustein?.shared ?? false);
  const [fehler, setFehler] = useState<Partial<Record<string, string>>>({});

  const speichern = useMutation({
    mutationFn: async () => {
      if (baustein) {
        await updateTextSnippet(baustein.id, titel, text);
        return;
      }
      await createTextSnippet(titel, text, praxisweit);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['text-snippets'] });
      setTitel('');
      setText('');
      setPraxisweit(false);
      onFertig();
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
        speichern.mutate();
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

        {/* Der Geltungsbereich wird nur beim Anlegen gewählt. */}
        {!baustein && darfPraxisweit ? (
          <label className="flex items-start gap-3 text-[0.9375rem]">
            <input
              type="checkbox"
              className="mt-1 size-5"
              checked={praxisweit}
              onChange={(event) => setPraxisweit(event.target.checked)}
            />
            <span>
              <span className="text-ink font-medium">Baustein der Praxis</span>
              <span className="text-ink-muted mt-0.5 block text-sm">
                Erscheint bei allen dokumentierenden Personen. Ohne Haken gehört der Baustein nur
                Ihnen.
              </span>
            </span>
          </label>
        ) : null}
      </Feldgruppe>

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

function BausteinKarte({ baustein }: { baustein: TextSnippet }) {
  const queryClient = useQueryClient();
  const [bearbeiten, setBearbeiten] = useState(false);

  const loeschen = useMutation({
    mutationFn: () => deleteTextSnippet(baustein.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['text-snippets'] }),
  });

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-ink text-[0.9375rem] font-medium">{baustein.title}</p>
        <Badge ton={baustein.shared ? 'akzent' : 'neutral'}>
          {baustein.shared ? 'Praxis' : 'Nur ich'}
        </Badge>
      </div>

      {bearbeiten ? (
        <div className="mt-3">
          <BausteinFormular
            baustein={baustein}
            darfPraxisweit={false}
            onFertig={() => setBearbeiten(false)}
            onAbbrechen={() => setBearbeiten(false)}
          />
        </div>
      ) : (
        <>
          <p className="text-ink-muted mt-2 text-sm leading-relaxed whitespace-pre-wrap">
            {baustein.body}
          </p>
          {baustein.editable ? (
            <div className="mt-3 flex flex-wrap items-start gap-3">
              <Button type="button" variant="secondary" onClick={() => setBearbeiten(true)}>
                Bearbeiten
              </Button>
              <Rueckfrage
                ausloeser="Löschen"
                bezeichnung={`Baustein „${baustein.title}" löschen`}
                bestaetigen="Ja, Baustein löschen"
                bestaetigenLaeuft="Wird gelöscht …"
                fehler={loeschen.isError ? loeschen.error.message : undefined}
                laeuft={loeschen.isPending}
                onBestaetigen={() => loeschen.mutateAsync()}
              >
                Der Baustein wird entfernt. Bereits geschriebene Dokumentation bleibt davon
                unberührt – ein Baustein ist eine Vorlage, kein Bestandteil der Akte.
              </Rueckfrage>
            </div>
          ) : (
            <p className="text-ink-subtle mt-3 text-xs">
              Bausteine der Praxis pflegt die Praxisleitung.
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
  const [anlegen, setAnlegen] = useState(false);

  const { data, isPending, isError } = useQuery({
    queryKey: ['text-snippets'],
    queryFn: fetchTextSnippets,
    enabled: darf,
    retry: false,
  });

  if (!darf) {
    return (
      <ErrorState
        title="Nicht freigegeben"
        description="Textbausteine gehören zur Behandlungsdokumentation und stehen ausschließlich therapeutischen Rollen offen."
      />
    );
  }

  const praxis = (data ?? []).filter((baustein) => baustein.shared);
  const eigene = (data ?? []).filter((baustein) => !baustein.shared);

  return (
    <>
      <PageHeader
        title="Textbausteine"
        description="Vorbereitete Formulierungen für die Behandlungsdokumentation. Sie werden unverändert eingefügt – ohne Platzhalter und ohne Angaben aus einer Akte."
        actions={
          anlegen ? null : (
            <Button type="button" onClick={() => setAnlegen(true)}>
              Baustein anlegen
            </Button>
          )
        }
      />

      {anlegen ? (
        <Section titel="Neuer Baustein">
          <BausteinFormular
            darfPraxisweit={darfPraxisweit}
            onFertig={() => setAnlegen(false)}
            onAbbrechen={() => setAnlegen(false)}
          />
        </Section>
      ) : null}

      {isPending ? <LoadingState label="Bausteine werden geladen …" /> : null}
      {isError ? <ErrorState title="Die Textbausteine konnten nicht geladen werden." /> : null}

      {data ? (
        <>
          <Section
            titel="Bausteine der Praxis"
            hinweis="Für alle dokumentierenden Personen. Anlegen und ändern darf sie die Praxisleitung."
          >
            {praxis.length === 0 ? (
              <p className="text-ink-muted text-[0.9375rem]">Noch keine Bausteine der Praxis.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {praxis.map((baustein) => (
                  <BausteinKarte key={baustein.id} baustein={baustein} />
                ))}
              </div>
            )}
          </Section>

          <Section titel="Meine Bausteine" hinweis="Sieht außer Ihnen niemand.">
            {eigene.length === 0 ? (
              <p className="text-ink-muted text-[0.9375rem]">Noch keine eigenen Bausteine.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {eigene.map((baustein) => (
                  <BausteinKarte key={baustein.id} baustein={baustein} />
                ))}
              </div>
            )}
          </Section>
        </>
      ) : null}

      <p className="text-ink-subtle mt-10 max-w-prose text-xs leading-relaxed">
        Anlegen, Ändern und Löschen werden protokolliert – mit Titel und Geltungsbereich, ohne den
        Text selbst.
      </p>
    </>
  );
}
