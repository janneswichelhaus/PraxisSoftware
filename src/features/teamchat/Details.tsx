import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Dialogfenster } from '@/components/ui/Dialogfenster';
import { Field } from '@/components/ui/Field';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { ListRow } from '@/components/ui/ListRow';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Segment } from '@/components/ui/Segment';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Zwischentitel } from '@/components/ui/Zwischentitel';
import {
  PERSONEN_KEY,
  TEAMCHAT_KEY,
  aendereKanal,
  angeheftetKey,
  archiviereKanal,
  entferneMitglied,
  fetchAngeheftet,
  fetchMitglieder,
  fetchPersonen,
  holeMitglieder,
  kanalTitel,
  mitgliederKey,
  setzeEinstellungen,
  verlasseKanal,
  type Kanal,
  type Stufe,
} from './api';
import { ohneFormatierung } from './formatierung';
import { TEAMCHAT, stellePfad } from './pfade';
import { nachrichtenzeit } from './zeit';

const ARTEN: Record<Kanal['kind'], string> = {
  channel: 'Offener Kanal – alle im Team lesen',
  private: 'Privater Kanal – nur Mitglieder lesen',
  direct: 'Direktnachricht – nur ihr beide lest',
  group: 'Gruppennachricht – nur die Mitglieder lesen',
  fleet: 'Gespräch der Radflotte – alle, die die Radflotte lesen',
};

const STUFEN: readonly { wert: Stufe; text: string }[] = [
  { wert: 'all', text: 'Alles' },
  { wert: 'mentions', text: 'Erwähnungen' },
  { wert: 'none', text: 'Stumm' },
];

/**
 * Die Angaben zu einem Gespräch (TEAM-002) - ein Fenster über „Details“ im
 * Kopf: wer liest, die eigene Benachrichtigungsstufe und der Favorit
 * (ANN-647), Angeheftetes (ANN-645), Mitglieder privater Kanäle (ANN-642),
 * Name und Beschreibung. Archivieren und Verlassen leise am Ende, mit
 * Rückfrage (DESIGN.md Regel 10). Was jemand darf, prüft der Server; hier
 * steht nur, was angeboten wird.
 */
export function Details({
  kanal,
  eigeneId,
  zeitzone,
  onSchliessen,
}: {
  kanal: Kanal;
  eigeneId: string | null;
  zeitzone: string;
  onSchliessen: () => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const aktualisieren = () => queryClient.invalidateQueries({ queryKey: TEAMCHAT_KEY });
  const einstellen = useMutation({
    mutationFn: (e: { stufe?: Stufe; favorit?: boolean }) => setzeEinstellungen(kanal.id, e),
    onSuccess: aktualisieren,
  });
  const angeheftet = useQuery({
    queryKey: angeheftetKey(kanal.id),
    queryFn: () => fetchAngeheftet(kanal.id),
  });
  const mitglieder = useQuery({
    queryKey: mitgliederKey(kanal.id),
    queryFn: () => fetchMitglieder(kanal.id),
  });
  const privat = kanal.kind === 'private';
  const mitMitgliedern = privat || kanal.kind === 'group';

  return (
    <Dialogfenster
      titel={kanalTitel(kanal)}
      beschreibung={ARTEN[kanal.kind]}
      vollbild
      onSchliessen={onSchliessen}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto px-4 py-4 sm:px-6">
        {kanal.description ? <p className="text-ink text-liste">{kanal.description}</p> : null}

        <section aria-label="Benachrichtigung" className="flex flex-col gap-3">
          <Zwischentitel>Benachrichtigung in der App</Zwischentitel>
          <Segment
            beschriftung="Was zählt"
            wahlen={STUFEN}
            gewaehlt={kanal.notify}
            onWaehlen={(stufe) => einstellen.mutate({ stufe })}
          />
          <Checkbox
            label="Als Favorit oben"
            checked={kanal.starred}
            onChange={(e) => einstellen.mutate({ favorit: e.target.checked })}
          />
          {einstellen.isError ? (
            <Statusmeldung ton="fehler">{einstellen.error.message}</Statusmeldung>
          ) : null}
          <Kleingedrucktes>
            Stumm zählt nur noch, wo du erwähnt bist. Andere sehen nichts davon.
          </Kleingedrucktes>
        </section>

        <Abfragezustand
          abfrage={angeheftet}
          laden="Angeheftetes wird geladen …"
          fehler="Angeheftetes konnte nicht geladen werden."
        >
          {(daten) => (
            <Listenabschnitt
              titel="Angeheftet"
              anzahl={daten.length}
              leer={{ titel: 'Nichts angeheftet' }}
            >
              {daten.map((a) => (
                <ListRow
                  key={a.id}
                  dicht
                  titel={ohneFormatierung(a.body)}
                  meta={`${a.author_name ?? 'Ehemaliges Teammitglied'} · ${nachrichtenzeit(a.created_at, zeitzone)}`}
                  onClick={() => {
                    onSchliessen();
                    void navigate(stellePfad(kanal, a));
                  }}
                />
              ))}
            </Listenabschnitt>
          )}
        </Abfragezustand>

        <Abfragezustand
          abfrage={mitglieder}
          laden="Mitglieder werden geladen …"
          fehler="Die Mitglieder konnten nicht geladen werden."
        >
          {(daten) => (
            <Listenabschnitt
              titel={mitMitgliedern ? 'Mitglieder' : 'Wer liest'}
              anzahl={daten.length}
            >
              {daten.map((m) => (
                <ListRow
                  key={m.staff_member_id}
                  dicht
                  titel={m.staff_member_id === eigeneId ? `${m.name} (du)` : m.name}
                  meta={m.active ? undefined : 'Nicht mehr im Team'}
                  aktion={
                    privat &&
                    kanal.manageable &&
                    m.staff_member_id !== eigeneId &&
                    !kanal.archived ? (
                      <Herausnehmen
                        kanalId={kanal.id}
                        staffMemberId={m.staff_member_id}
                        name={m.name}
                      />
                    ) : undefined
                  }
                />
              ))}
            </Listenabschnitt>
          )}
        </Abfragezustand>

        {privat && !kanal.archived ? (
          <Hinzufuegen
            kanalId={kanal.id}
            vorhanden={(mitglieder.data ?? []).map((m) => m.staff_member_id)}
          />
        ) : null}

        {kanal.manageable && !kanal.archived ? <Umbenennen kanal={kanal} /> : null}

        <div className="flex flex-col gap-3">
          {kanal.manageable ? <Archivieren kanal={kanal} /> : null}
          {privat ? (
            <Verlassen
              kanalId={kanal.id}
              onVerlassen={() => {
                onSchliessen();
                void navigate(TEAMCHAT);
              }}
            />
          ) : null}
        </div>
      </div>
    </Dialogfenster>
  );
}

function Herausnehmen({
  kanalId,
  staffMemberId,
  name,
}: {
  kanalId: string;
  staffMemberId: string;
  name: string;
}) {
  const queryClient = useQueryClient();
  const nehmen = useMutation({
    mutationFn: () => entferneMitglied(kanalId, staffMemberId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TEAMCHAT_KEY }),
  });
  return (
    <Rueckfrage
      ausloeser="Herausnehmen"
      ausloeserVariante="quiet"
      ausloeserGroesse="kompakt"
      bezeichnung={`${name} herausnehmen`}
      bestaetigen="Ja, herausnehmen"
      bestaetigenLaeuft="Wird gespeichert …"
      fehler={nehmen.isError ? nehmen.error.message : undefined}
      onBestaetigen={() => nehmen.mutateAsync()}
    >
      {name} liest den Kanal danach nicht mehr.
    </Rueckfrage>
  );
}

function Hinzufuegen({ kanalId, vorhanden }: { kanalId: string; vorhanden: readonly string[] }) {
  const queryClient = useQueryClient();
  const [gewaehlt, setGewaehlt] = useState<string[]>([]);
  const personen = useQuery({ queryKey: PERSONEN_KEY, queryFn: fetchPersonen, staleTime: 300_000 });
  const holen = useMutation({
    mutationFn: () => holeMitglieder(kanalId, gewaehlt),
    onSuccess: async () => {
      setGewaehlt([]);
      await queryClient.invalidateQueries({ queryKey: TEAMCHAT_KEY });
    },
  });
  const frei = (personen.data ?? []).filter((p) => !vorhanden.includes(p.staff_member_id));
  if (frei.length === 0) return null;
  return (
    <section aria-label="Personen hinzufügen" className="flex flex-col gap-3">
      <Zwischentitel>Personen hinzufügen</Zwischentitel>
      {frei.map((p) => (
        <Checkbox
          key={p.staff_member_id}
          label={p.name}
          checked={gewaehlt.includes(p.staff_member_id)}
          onChange={(e) =>
            setGewaehlt(
              e.target.checked
                ? [...gewaehlt, p.staff_member_id]
                : gewaehlt.filter((id) => id !== p.staff_member_id),
            )
          }
        />
      ))}
      {holen.isError ? <Statusmeldung ton="fehler">{holen.error.message}</Statusmeldung> : null}
      <Kleingedrucktes>Wer dazukommt, liest auch, was vorher geschrieben wurde.</Kleingedrucktes>
      <div>
        <Button
          variant="secondary"
          groesse="kompakt"
          disabled={gewaehlt.length === 0 || holen.isPending}
          onClick={() => holen.mutate()}
        >
          {holen.isPending ? 'Wird hinzugefügt …' : 'Hinzufügen'}
        </Button>
      </div>
    </section>
  );
}

function Umbenennen({ kanal }: { kanal: Kanal }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(kanal.name ?? '');
  const [beschreibung, setBeschreibung] = useState(kanal.description ?? '');
  const speichern = useMutation({
    mutationFn: () => aendereKanal({ kanalId: kanal.id, name, beschreibung }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TEAMCHAT_KEY }),
  });
  function absenden(e: FormEvent) {
    e.preventDefault();
    if (name.trim()) speichern.mutate();
  }
  return (
    <form onSubmit={absenden} aria-label="Name und Beschreibung" className="flex flex-col gap-3">
      <Zwischentitel>Name und Beschreibung</Zwischentitel>
      <Field
        label="Name"
        value={name}
        maxLength={40}
        required
        onChange={(e) => setName(e.target.value)}
      />
      <Field
        label="Worum es geht"
        value={beschreibung}
        maxLength={200}
        onChange={(e) => setBeschreibung(e.target.value)}
      />
      {speichern.isError ? (
        <Statusmeldung ton="fehler">{speichern.error.message}</Statusmeldung>
      ) : null}
      {speichern.isSuccess ? <Statusmeldung ton="erfolg">Gespeichert.</Statusmeldung> : null}
      <Formularfuss>
        <Button type="submit" variant="secondary" disabled={!name.trim() || speichern.isPending}>
          {speichern.isPending ? 'Wird gespeichert …' : 'Speichern'}
        </Button>
      </Formularfuss>
    </form>
  );
}

function Archivieren({ kanal }: { kanal: Kanal }) {
  const queryClient = useQueryClient();
  const umschalten = useMutation({
    mutationFn: () => archiviereKanal(kanal.id, !kanal.archived),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TEAMCHAT_KEY }),
  });
  // Wieder öffnen ist harmlos und braucht keine Rückfrage (Praxis-Review TEAM-001).
  if (kanal.archived) {
    return (
      <div>
        <Button
          variant="quiet"
          groesse="kompakt"
          disabled={umschalten.isPending}
          onClick={() => umschalten.mutate()}
        >
          Wieder öffnen
        </Button>
        {umschalten.isError ? (
          <Statusmeldung ton="fehler">{umschalten.error.message}</Statusmeldung>
        ) : null}
      </div>
    );
  }
  return (
    <Rueckfrage
      ausloeser="Kanal archivieren"
      ausloeserVariante="quiet"
      ausloeserGroesse="kompakt"
      bezeichnung="Kanal archivieren"
      bestaetigen="Ja, archivieren"
      bestaetigenLaeuft="Wird gespeichert …"
      fehler={umschalten.isError ? umschalten.error.message : undefined}
      onBestaetigen={() => umschalten.mutateAsync()}
    >
      Der Kanal bleibt lesbar, nimmt aber nichts mehr an. Die Löschfrist läuft weiter.
    </Rueckfrage>
  );
}

function Verlassen({ kanalId, onVerlassen }: { kanalId: string; onVerlassen: () => void }) {
  const queryClient = useQueryClient();
  const gehen = useMutation({
    mutationFn: () => verlasseKanal(kanalId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: TEAMCHAT_KEY });
      onVerlassen();
    },
  });
  return (
    <Rueckfrage
      ausloeser="Kanal verlassen"
      ausloeserVariante="quiet"
      ausloeserGroesse="kompakt"
      bezeichnung="Kanal verlassen"
      bestaetigen="Ja, verlassen"
      bestaetigenLaeuft="Wird gespeichert …"
      fehler={gehen.isError ? gehen.error.message : undefined}
      onBestaetigen={() => gehen.mutateAsync()}
    >
      Zurück kommst du nur, wenn dich ein Mitglied wieder hinzufügt. Gehst du als Letzte:r, wird der
      Kanal mit allen Nachrichten gelöscht.
    </Rueckfrage>
  );
}
