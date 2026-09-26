import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Checkbox } from '@/components/ui/Checkbox';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { TextArea } from '@/components/ui/TextArea';
import { bereicheText } from '@/features/assessments/koerperschema';
import type { CurrentUser } from '@/features/session/types';
import { formatDate } from '@/lib/datum';
import {
  EINTRAEGE_MAX,
  EMPFEHLUNG_MAX,
  TEXT_MAX,
  berichtAbschliessen,
  berichtQueryKey,
  berichtSpeichern,
  berichtVerwerfen,
  berichteQueryKey,
  fetchBericht,
  fetchBerichtQuellen,
  quellenQueryKey,
  type Bericht,
  type BerichtEingabe,
  type Quellenzeile,
} from './api';
import { Berichtsblatt } from './Berichtsblatt';

/**
 * Einen Therapiebericht schreiben (DOK-005).
 *
 * Die Seite ist ein Formular mit vier Teilen — ankreuzen, was aus der Akte
 * hinein soll, das Körperschema wählen, den eigenen Text und die Empfehlung
 * zum Verordnungsende schreiben. **Nichts ist vorausgewählt** (ANN-122): Die
 * Anwendung entscheidet nicht, welcher Eintrag „wichtig" ist; das wäre eine
 * Auswahl nach klinischem Gehalt (ADR-006 Punkt 4).
 *
 * Darunter steht der gespeicherte Stand als Blatt, genau wie er gedruckt
 * würde. Abschließen friert ihn ein (ANN-121); danach führt die Adresse auf
 * das Druckblatt.
 */
export function TherapieberichtPage({ user }: { user: CurrentUser }) {
  const { patientId = '', berichtId = '' } = useParams();

  const bericht = useQuery({
    queryKey: berichtQueryKey(berichtId),
    queryFn: () => fetchBericht(berichtId),
    retry: false,
  });
  const quellen = useQuery({
    queryKey: quellenQueryKey(berichtId),
    queryFn: () => fetchBerichtQuellen(berichtId),
    retry: false,
    enabled: bericht.data?.status === 'entwurf',
  });

  if (bericht.isPending) return <LoadingState label="Bericht wird geladen …" />;
  if (bericht.isError || !bericht.data) {
    return (
      <ErrorState
        title="Der Bericht konnte nicht geladen werden."
        description="Bitte später erneut versuchen. Sind Sie noch angemeldet?"
      />
    );
  }
  if (bericht.data.status === 'abgeschlossen') {
    return <Navigate to={`/patienten/${patientId}/berichte/${berichtId}/druck`} replace />;
  }
  if (quellen.isPending) return <LoadingState label="Einträge der Akte werden geladen …" />;
  if (quellen.isError) {
    return (
      <ErrorState
        title="Die Einträge der Akte konnten nicht geladen werden."
        description="Bitte später erneut versuchen."
      />
    );
  }

  return (
    <Berichtsformular
      // Neu aufsetzen, wenn ein anderer Bericht geladen wird.
      key={bericht.data.id}
      bericht={bericht.data}
      quellen={quellen.data}
      patientId={patientId}
      user={user}
    />
  );
}

function Berichtsformular({
  bericht,
  quellen,
  patientId,
}: {
  bericht: Bericht;
  quellen: Quellenzeile[];
  patientId: string;
  user: CurrentUser;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [stand, setStand] = useState(bericht.updated_at);
  const [eingabe, setEingabe] = useState<BerichtEingabe>({
    text: bericht.report_text ?? '',
    empfehlung: bericht.recommendation ?? '',
    eintraege: bericht.note_ids,
    koerperschema: bericht.body_chart_response_id,
  });
  const [gespeichert, setGespeichert] = useState(false);

  const eintraege = quellen.filter((q) => q.kind === 'eintrag');
  const dieserVerordnung = eintraege.filter((q) => q.in_treatment_basis);
  const weitere = eintraege.filter((q) => !q.in_treatment_basis);
  const koerperschemata = quellen.filter((q) => q.kind === 'koerperschema');
  const verordnungsziel = `/patienten/${patientId}/verordnungen#verordnung-${bericht.treatment_basis_id}`;

  async function neuLaden() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: berichtQueryKey(bericht.id) }),
      queryClient.invalidateQueries({ queryKey: berichteQueryKey(patientId) }),
    ]);
  }

  const speichern = useMutation({
    mutationFn: () => berichtSpeichern(bericht.id, eingabe, stand),
    onSuccess: async (neuerStand) => {
      setStand(neuerStand);
      setGespeichert(true);
      await neuLaden();
    },
  });

  const abschliessen = useMutation({
    mutationFn: async () => {
      // Was im Formular steht, ist das, was abgeschlossen wird - nicht ein
      // älterer gespeicherter Stand.
      const neuerStand = await berichtSpeichern(bericht.id, eingabe, stand);
      setStand(neuerStand);
      await berichtAbschliessen(bericht.id, neuerStand);
    },
    onSuccess: async () => {
      await neuLaden();
      void navigate(`/patienten/${patientId}/berichte/${bericht.id}/druck`, { replace: true });
    },
  });

  const verwerfen = useMutation({
    mutationFn: () => berichtVerwerfen(bericht.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: berichteQueryKey(patientId) });
      void navigate(verordnungsziel, { replace: true });
    },
  });

  function aendern(teil: Partial<BerichtEingabe>) {
    setEingabe((alt) => ({ ...alt, ...teil }));
    setGespeichert(false);
  }

  function umschalten(id: string, an: boolean) {
    const ohne = eingabe.eintraege.filter((e) => e !== id);
    aendern({ eintraege: an ? [...ohne, id] : ohne });
  }

  const zuViele = eingabe.eintraege.length > EINTRAEGE_MAX;
  const { patient } = bericht.document;

  return (
    <>
      <Rueckweg standard={verordnungsziel} beschriftung="Zurück zur Verordnung" />
      <PageHeader
        title="Therapiebericht"
        description={`${patient.given_name} ${patient.family_name} · Verordnung vom ${formatDate(
          bericht.document.verordnung.issued_on,
        )} · Entwurf`}
      />

      <form
        className="flex max-w-3xl flex-col gap-8"
        onSubmit={(e) => {
          e.preventDefault();
          if (!zuViele) speichern.mutate();
        }}
      >
        <fieldset className="flex flex-col gap-2">
          <legend className="text-ink text-base font-semibold">
            Einträge aus der Dokumentation
          </legend>
          <p className="text-ink-subtle text-sm">
            Angekreuzte Einträge stehen wörtlich im Bericht, mit Tag und Verfasser:in. Nur
            finalisierte Einträge lassen sich übernehmen; vorausgewählt ist nichts.
          </p>
          {eintraege.length === 0 ? (
            <Statusmeldung>Die Akte hat noch keinen finalisierten Eintrag.</Statusmeldung>
          ) : null}
          {dieserVerordnung.length > 0 ? (
            <Eintragsliste
              titel="Zu dieser Verordnung"
              eintraege={dieserVerordnung}
              gewaehlt={eingabe.eintraege}
              onUmschalten={umschalten}
            />
          ) : null}
          {weitere.length > 0 ? (
            <details className="group" open={weitere.some((w) => eingabe.eintraege.includes(w.id))}>
              <summary className="text-accent flex min-h-11 cursor-pointer items-center text-sm">
                Weitere Einträge der Akte ({weitere.length})
              </summary>
              <Eintragsliste
                eintraege={weitere}
                gewaehlt={eingabe.eintraege}
                onUmschalten={umschalten}
              />
            </details>
          ) : null}
          {zuViele ? (
            <Statusmeldung ton="fehler">
              Höchstens {EINTRAEGE_MAX} Einträge — ein Bericht ist keine Kopie der Akte.
            </Statusmeldung>
          ) : null}
        </fieldset>

        {koerperschemata.length > 0 ? (
          <fieldset className="flex flex-col gap-1">
            <legend className="text-ink text-base font-semibold">Körperschema</legend>
            <p className="text-ink-subtle mb-1 text-sm">
              Die Kreise aus einem abgeschlossenen Anamnesebogen, als Bild im Bericht.
            </p>
            <Auswahlknopf
              name="koerperschema"
              label="Kein Körperschema"
              checked={eingabe.koerperschema === null}
              onWaehlen={() => aendern({ koerperschema: null })}
            />
            {koerperschemata.map((k) => (
              <Auswahlknopf
                key={k.id}
                name="koerperschema"
                label={`Angabe vom ${formatDate(k.occurred_on)}: ${bereicheText(
                  (k.body_chart ?? []).map((m) => m.bereich),
                )}`}
                checked={eingabe.koerperschema === k.id}
                onWaehlen={() => aendern({ koerperschema: k.id })}
              />
            ))}
          </fieldset>
        ) : null}

        <TextArea
          label="Bericht der Therapeut:in"
          hint="Ihr eigener Text an die Verordner:in. Er steht mit Ihrem Namen und dem Tag im Bericht."
          rows={6}
          maxLength={TEXT_MAX}
          value={eingabe.text}
          onChange={(e) => aendern({ text: e.target.value })}
        />

        <TextArea
          label="Empfehlung der Therapeut:in zum Verordnungsende"
          hint="Von Ihnen formuliert und verantwortet — die Anwendung schlägt nichts vor. Sie steht danach auch an der Verordnung."
          rows={3}
          maxLength={EMPFEHLUNG_MAX}
          value={eingabe.empfehlung}
          onChange={(e) => aendern({ empfehlung: e.target.value })}
        />

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={speichern.isPending || zuViele}>
              {speichern.isPending ? 'Wird gespeichert …' : 'Entwurf speichern'}
            </Button>
            <ButtonLink to={`/patienten/${patientId}/berichte/${bericht.id}/druck`} variant="quiet">
              Druckansicht
            </ButtonLink>
          </div>
          {gespeichert ? <Statusmeldung>Entwurf gespeichert.</Statusmeldung> : null}
          {speichern.isError ? (
            <Statusmeldung ton="fehler">{speichern.error.message}</Statusmeldung>
          ) : null}
        </div>
      </form>

      <div className="mt-8 flex max-w-3xl flex-col gap-3">
        <Rueckfrage
          ausloeser="Bericht abschließen"
          bestaetigen="Abschließen"
          bestaetigenLaeuft="Wird abgeschlossen …"
          laeuft={abschliessen.isPending}
          fehler={abschliessen.isError ? abschliessen.error.message : undefined}
          onBestaetigen={() => abschliessen.mutateAsync()}
          onAbbrechen={() => abschliessen.reset()}
        >
          Der Bericht wird so eingefroren, wie er jetzt im Formular steht — spätere Änderungen in
          der Akte erreichen ihn nicht mehr. Eine Korrektur ist ein neuer Bericht.
        </Rueckfrage>
        <Rueckfrage
          ausloeser="Entwurf verwerfen"
          ausloeserVariante="quiet"
          bestaetigen="Verwerfen"
          laeuft={verwerfen.isPending}
          fehler={verwerfen.isError ? verwerfen.error.message : undefined}
          onBestaetigen={() => verwerfen.mutateAsync()}
          onAbbrechen={() => verwerfen.reset()}
        >
          Der Entwurf wird gelöscht. Die Einträge der Akte bleiben unberührt.
        </Rueckfrage>
      </div>

      <section className="mt-10" aria-label="Vorschau des gespeicherten Stands">
        <h2 className="text-ink mb-1 text-base font-semibold">Vorschau</h2>
        <p className="text-ink-subtle mb-4 text-sm">
          Der zuletzt gespeicherte Stand, wie er gedruckt würde.
        </p>
        <div className="border-line rounded-card bg-surface border p-4 sm:p-8">
          <Berichtsblatt dokument={bericht.document} entwurf eingebettet />
        </div>
      </section>
    </>
  );
}

function Eintragsliste({
  titel,
  eintraege,
  gewaehlt,
  onUmschalten,
}: {
  titel?: string;
  eintraege: Quellenzeile[];
  gewaehlt: readonly string[];
  onUmschalten: (id: string, an: boolean) => void;
}) {
  return (
    <div>
      {titel ? <p className="text-ink-muted mt-2 text-sm font-medium">{titel}</p> : null}
      <ul className="flex flex-col">
        {eintraege.map((eintrag) => (
          <li key={eintrag.id} className="border-line border-b py-1 last:border-b-0">
            <Checkbox
              label={
                <>
                  {formatDate(eintrag.occurred_on)}
                  {eintrag.is_addendum ? ' · Nachtrag' : ''}
                  {eintrag.author_name ? ` · ${eintrag.author_name}` : ''}
                </>
              }
              hint={<span className="line-clamp-3 whitespace-pre-line">{eintrag.content}</span>}
              checked={gewaehlt.includes(eintrag.id)}
              onChange={(e) => onUmschalten(eintrag.id, e.target.checked)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Auswahlknopf({
  name,
  label,
  checked,
  onWaehlen,
}: {
  name: string;
  label: string;
  checked: boolean;
  onWaehlen: () => void;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3">
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onWaehlen}
        className="border-line-strong text-accent focus-visible:outline-accent size-5 shrink-0 border"
      />
      <span className="text-ink text-sm">{label}</span>
    </label>
  );
}
