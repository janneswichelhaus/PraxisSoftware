import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Badge, STATUSZEICHEN } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Disclosure } from '@/components/ui/Card';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { EmptyState } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { TextArea } from '@/components/ui/TextArea';
import { Zwischentitel } from '@/components/ui/Zwischentitel';
import { usePatientRecord } from '@/features/patients';
import { formatDate } from '@/lib/datum';
import {
  beratungBeenden,
  einwilligungVermerken,
  ernaehrungSchluessel,
  fetchErnaehrung,
  gewichtEintragen,
  notizenSpeichern,
  type Ernaehrungsprofil,
  type Ernaehrungssicht,
  type Verhaeltnisart,
} from './api';
import { beratungsterminPfad, ernaehrungsFormulare, leseZahl } from './eingabe';
import { Zielwertliste } from './Rechenweg';
import { TagebuchDerBeratung } from './TagebuchDerBeratung';
import {
  einwilligungVon,
  FORMEL_TEXTE,
  GESCHLECHT_TEXTE,
  kg,
  palText,
  zahl,
  ZIEL_TEXTE,
} from './texte';
import { gewichtVon } from './gewicht';

/**
 * Der Reiter „Ernährung“ an Akte und Trainingsverhältnis (ERN-001, ADR-027).
 *
 * Nur mit der Fähigkeit „Ernährungsberatung“ (owner) - die Navigation zeigt
 * den Reiter niemandem sonst; verbindlich prüft der Server, und er
 * protokolliert das Laden als Öffnen des Verhältnisses (ADR-027 Punkt 4).
 * Darum lädt der Reiter einmal und nicht bei jedem Fokuswechsel.
 *
 * Was nicht entsteht (ADR-006 Punkt 14): keine Aussage über die Gesundheit,
 * kein Etikett zum Gewicht, keine Bewertung - Zahlen, Formel, Rechenweg.
 */
/** Der Bereich `/patienten/:patientId/ernaehrung` im Rahmen der Akte. */
export function AkteErnaehrung() {
  const { patient } = usePatientRecord();
  return <ErnaehrungReiter art="treatment" verhaeltnisId={patient.id} />;
}

export function ErnaehrungReiter({
  art,
  verhaeltnisId,
}: {
  art: Verhaeltnisart;
  verhaeltnisId: string;
}) {
  const abfrage = useQuery({
    queryKey: ernaehrungSchluessel(art, verhaeltnisId),
    queryFn: () => fetchErnaehrung(art, verhaeltnisId),
    retry: false,
    refetchOnWindowFocus: false,
  });
  return (
    <Abfragezustand
      abfrage={abfrage}
      laden="Die Ernährungsberatung wird geladen …"
      fehler="Die Ernährungsberatung konnte nicht geladen werden."
      inKarte
      leer={{ wenn: (sicht) => sicht === null, titel: 'Nicht freigegeben' }}
    >
      {(sicht) => <Inhalt sicht={sicht!} art={art} verhaeltnisId={verhaeltnisId} />}
    </Abfragezustand>
  );
}

const ANDERER_BEREICH: Record<Verhaeltnisart, string> = {
  treatment: 'in der Behandlung',
  training: 'im Training',
};

function Inhalt({
  sicht,
  art,
  verhaeltnisId,
}: {
  sicht: Ernaehrungssicht;
  art: Verhaeltnisart;
  verhaeltnisId: string;
}) {
  const profil = sicht.profile;
  const darfAnlegen =
    sicht.relationship_open && sicht.running_elsewhere === null && (!profil || profil.ended_on);
  const anlegen = darfAnlegen ? (
    <ButtonLink to={`${ernaehrungsFormulare(art, verhaeltnisId)}/neu`} variant="secondary">
      {profil ? 'Neue Beratung anlegen' : 'Profil anlegen'}
    </ButtonLink>
  ) : null;

  if (!profil) {
    return (
      <EmptyState
        inKarte
        title={
          sicht.running_elsewhere
            ? `Die Ernährungsberatung läuft ${ANDERER_BEREICH[sicht.running_elsewhere]}.`
            : sicht.relationship_open
              ? 'Noch keine Ernährungsberatung.'
              : 'Der Vertrag ist beendet.'
        }
        aktion={anlegen}
      />
    );
  }
  return (
    <Profilansicht
      sicht={sicht}
      profil={profil}
      art={art}
      verhaeltnisId={verhaeltnisId}
      anlegen={anlegen}
    />
  );
}

function Profilansicht({
  sicht,
  profil,
  art,
  verhaeltnisId,
  anlegen,
}: {
  sicht: Ernaehrungssicht;
  profil: Ernaehrungsprofil;
  art: Verhaeltnisart;
  verhaeltnisId: string;
  anlegen: ReactNode;
}) {
  const laeuft = profil.ended_on === null;
  const erteilt = profil.consent?.state === 'granted';
  const schreibbar = laeuft && erteilt;
  const z = profil.targets;

  return (
    <div className="flex flex-col gap-8 [&>*]:mt-0">
      {!laeuft ? (
        <div className="flex flex-col gap-3">
          <Statusmeldung>
            Beratung beendet am {formatDate(profil.ended_on)}. Die Angaben bleiben drei Jahre
            stehen.
          </Statusmeldung>
          {anlegen}
        </div>
      ) : !erteilt ? (
        <Statusmeldung ton="warnung">
          Einwilligung widerrufen am {formatDate(profil.consent!.occurred_on)}. Nichts Neues
          eintragen; was mit den Angaben geschieht, mit der Person klären.
        </Statusmeldung>
      ) : null}

      {/* ERN-012 (ANN-622): die Sitzung als Termin mit dem Anlass; mit dem
          Haken entsteht die Position, die Rechnung ist die des Bereichs. */}
      {schreibbar ? (
        <Section
          titel="Beratungstermin"
          aktion={
            <ButtonLink
              to={beratungsterminPfad(art, verhaeltnisId)}
              variant="secondary"
              groesse="kompakt"
            >
              Anlegen
            </ButtonLink>
          }
        >
          {/* Kein Erklärsatz im Kasten (DESIGN.md Regel 6): Wie die Sitzung
              erfasst und abgerechnet wird, steht auf Abruf. */}
          <Disclosure summary="So geht’s">
            <p className="text-ink-muted text-sm">
              Mit dem Haken am Termin ist die Sitzung erfasst; abgerechnet wird mit der Rechnung{' '}
              {art === 'treatment' ? 'der Behandlung' : 'des Trainings'}.
            </p>
          </Disclosure>
        </Section>
      ) : null}

      <Gewicht
        profil={profil}
        sicht={sicht}
        art={art}
        verhaeltnisId={verhaeltnisId}
        schreibbar={schreibbar}
      />

      <Section
        titel="Zielwerte"
        rahmen
        aktion={
          schreibbar && z.status === 'ok' ? (
            <ButtonLink
              to={`${ernaehrungsFormulare(art, verhaeltnisId)}/zielwerte`}
              variant="secondary"
              groesse="kompakt"
            >
              Anpassen
            </ButtonLink>
          ) : null
        }
      >
        <Zielwertliste zielwerte={z} />
      </Section>

      <Section
        titel="Profil"
        rahmen
        aktion={
          schreibbar ? (
            <ButtonLink
              to={`${ernaehrungsFormulare(art, verhaeltnisId)}/bearbeiten`}
              variant="secondary"
              groesse="kompakt"
            >
              Ändern
            </ButtonLink>
          ) : null
        }
      >
        <DetailList>
          <DetailRow label="Beratung seit">{formatDate(profil.started_on)}</DetailRow>
          <DetailRow label="Größe">{zahl(profil.height_cm)} cm</DetailRow>
          <DetailRow label="Geschlecht für die Formel">
            {GESCHLECHT_TEXTE[profil.formula_sex]}
          </DetailRow>
          <DetailRow label="Körperfettanteil">
            {profil.body_fat_percent === null ? '–' : `${zahl(profil.body_fat_percent, 1)} %`}
          </DetailRow>
          <DetailRow label="Aktivität">{palText(profil.activity_pal)}</DetailRow>
          <DetailRow label="Ziel">{ZIEL_TEXTE[profil.goal]}</DetailRow>
          <DetailRow label="Zielgewicht">
            {profil.target_weight_kg === null
              ? '–'
              : `${kg(profil.target_weight_kg)}${profil.target_weight_source === 'person' ? ' · von der Person gewählt' : ''}`}
          </DetailRow>
          <DetailRow label="Formel">{FORMEL_TEXTE[profil.bmr_formula]}</DetailRow>
          <DetailRow label="Tagebuch">
            {profil.diary_enabled
              ? `Eingeschaltet${profil.diary_changed_at ? ` am ${formatDate(profil.diary_changed_at.slice(0, 10))}` : ''}`
              : 'Aus'}
          </DetailRow>
        </DetailList>
      </Section>

      {/* ERN-010: die Beratung liest das Tagebuch mit - nur, wenn es eines gibt. */}
      {profil.diary_enabled || profil.diary_changed_at ? (
        <TagebuchDerBeratung profilId={profil.id} />
      ) : null}

      <Notizen profil={profil} art={art} verhaeltnisId={verhaeltnisId} schreibbar={schreibbar} />

      {/* Seltenes am Ende (DESIGN.md 9.16): der Widerruf neben „Beratung beenden“. */}
      <Einwilligung profil={profil} sicht={sicht} art={art} verhaeltnisId={verhaeltnisId} />

      <Kleingedrucktes>
        Zielwerte aus veröffentlichten Formeln für Ernährung und Körpergewicht im Alltag, keine
        Aussage über die Gesundheit.
      </Kleingedrucktes>

      {laeuft ? (
        <div className="border-line border-t pt-6">
          <Beenden profil={profil} sicht={sicht} art={art} verhaeltnisId={verhaeltnisId} />
        </div>
      ) : null}
    </div>
  );
}

function useNeuLaden(art: Verhaeltnisart, verhaeltnisId: string) {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: ernaehrungSchluessel(art, verhaeltnisId) });
}

function Gewicht({
  profil,
  sicht,
  art,
  verhaeltnisId,
  schreibbar,
}: {
  profil: Ernaehrungsprofil;
  sicht: Ernaehrungssicht;
  art: Verhaeltnisart;
  verhaeltnisId: string;
  schreibbar: boolean;
}) {
  const neuLaden = useNeuLaden(art, verhaeltnisId);
  const [tag, setTag] = useState(sicht.today);
  const [wert, setWert] = useState('');
  const [fehler, setFehler] = useState<string | undefined>();
  const [eingetragen, setEingetragen] = useState(0);
  // Je Tag gilt ein Gewicht (ANN-621): Steht am Tag schon eines, sagt das
  // Formular es vorher und heißt „ersetzen“.
  const vorhanden = profil.weights.find((eintrag) => eintrag.measured_on === tag);
  const eintragen = useMutation({
    mutationFn: () => gewichtEintragen(profil.id, tag, leseZahl(wert)!),
    onSuccess: async () => {
      setWert('');
      setEingetragen((zahl) => zahl + 1);
      await neuLaden();
    },
  });

  return (
    // Felder stehen nicht im Kasten (DESIGN.md Regel 2, Seitentyp „Formular“);
    // der Verlauf darunter ist die Auskunft und steht in der Karte.
    <Section titel="Gewicht">
      {schreibbar ? (
        <form
          aria-label="Gewicht eintragen"
          className="max-w-formular flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const kilo = leseZahl(wert);
            if (kilo === null || kilo < 20 || kilo > 350) {
              setFehler('Bitte das Gewicht in kg angeben, 20 bis 350.');
              return;
            }
            setFehler(undefined);
            eintragen.mutate();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Gewicht (kg)"
              inputMode="decimal"
              autoComplete="off"
              value={wert}
              error={fehler}
              onChange={(event) => setWert(event.target.value)}
            />
            <Field
              label="Tag"
              type="date"
              min={profil.started_on}
              max={sicht.today}
              value={tag}
              hint={
                vorhanden
                  ? `Steht schon: ${kg(vorhanden.weight_kg)}${gewichtVon(vorhanden)}. Eintragen ersetzt es.`
                  : undefined
              }
              onChange={(event) => setTag(event.target.value)}
            />
          </div>
          {eintragen.isError ? (
            <Statusmeldung ton="fehler">{eintragen.error.message}</Statusmeldung>
          ) : null}
          {eingetragen > 0 ? <Rueckmeldung key={eingetragen}>Eingetragen.</Rueckmeldung> : null}
          <Formularfuss dicht>
            <Button type="submit" variant="secondary" disabled={eintragen.isPending}>
              {eintragen.isPending
                ? 'Wird eingetragen …'
                : vorhanden
                  ? 'Gewicht ersetzen'
                  : 'Gewicht eintragen'}
            </Button>
          </Formularfuss>
        </form>
      ) : null}
      {profil.weights.length > 0 ? (
        <ListRows beschriftung="Gewichtsverlauf" className={schreibbar ? 'mt-4' : ''}>
          {profil.weights.map((eintrag) => (
            <ListRow
              key={eintrag.measured_on}
              dicht
              titel={kg(eintrag.weight_kg)}
              meta={`${formatDate(eintrag.measured_on)}${gewichtVon(eintrag)}`}
            />
          ))}
        </ListRows>
      ) : null}
    </Section>
  );
}

function Einwilligung({
  profil,
  sicht,
  art,
  verhaeltnisId,
}: {
  profil: Ernaehrungsprofil;
  sicht: Ernaehrungssicht;
  art: Verhaeltnisart;
  verhaeltnisId: string;
}) {
  const neuLaden = useNeuLaden(art, verhaeltnisId);
  const stand = profil.consent;
  const erteilt = stand?.state === 'granted';
  const [tag, setTag] = useState(sicht.today);
  const vermerken = useMutation({
    mutationFn: () =>
      einwilligungVermerken(profil.id, erteilt ? 'consent_withdrawn' : 'consent_granted', tag),
    onSuccess: () => neuLaden(),
  });
  const von = stand ? einwilligungVon(stand.source, stand.representative_name) : null;

  return (
    <Section titel="Einwilligung" rahmen>
      <Zwischentitel
        aktion={
          !stand ? (
            <Badge ton="neutral" eigenesZeichen={STATUSZEICHEN.fehlt}>
              Nicht erteilt
            </Badge>
          ) : erteilt ? (
            <Badge ton="positiv">Erteilt am {formatDate(stand.occurred_on)}</Badge>
          ) : (
            <Badge ton="warnung">Widerrufen am {formatDate(stand.occurred_on)}</Badge>
          )
        }
      >
        Ernährungsberatung
      </Zwischentitel>
      {von ? <p className="text-ink-muted mt-1 text-sm">{von}.</p> : null}
      {profil.ended_on === null ? (
        <div className="mt-3">
          <Rueckfrage
            ausloeser={erteilt ? 'Widerruf vermerken' : 'Einwilligung vermerken'}
            ausloeserGroesse="kompakt"
            // Der Widerruf ist selten und hält die Beratung an: leise, wie auf
            // der Plattform (DESIGN.md 9.16); das erneute Vermerken nicht.
            ausloeserVariante={erteilt ? 'quiet' : 'secondary'}
            bestaetigen={erteilt ? 'Widerruf vermerken' : 'Einwilligung vermerken'}
            bestaetigenLaeuft="Wird vermerkt …"
            fehler={vermerken.error?.message}
            onBestaetigen={() => vermerken.mutateAsync()}
            onAbbrechen={() => setTag(sicht.today)}
          >
            <p>
              {erteilt
                ? 'Die Person hat ihre Einwilligung widerrufen. Danach wird nichts Neues eingetragen.'
                : 'Die Person hat erneut auf Papier eingewilligt. Vermerkt wird nur das Datum.'}
            </p>
            <div className="mt-3 max-w-60">
              <Field
                label={erteilt ? 'Widerrufen am' : 'Unterschrieben am'}
                type="date"
                max={sicht.today}
                value={tag}
                onChange={(event) => setTag(event.target.value)}
              />
            </div>
          </Rueckfrage>
        </div>
      ) : null}
    </Section>
  );
}

function Notizen({
  profil,
  art,
  verhaeltnisId,
  schreibbar,
}: {
  profil: Ernaehrungsprofil;
  art: Verhaeltnisart;
  verhaeltnisId: string;
  schreibbar: boolean;
}) {
  const neuLaden = useNeuLaden(art, verhaeltnisId);
  const [bearbeiten, setBearbeiten] = useState(false);
  const [text, setText] = useState(profil.notes ?? '');
  const speichern = useMutation({
    mutationFn: () => notizenSpeichern(profil.id, text),
    onSuccess: async () => {
      setBearbeiten(false);
      await neuLaden();
    },
  });
  return (
    <Section
      titel="Notizen"
      rahmen
      aktion={
        schreibbar && !bearbeiten ? (
          <Button
            type="button"
            variant="secondary"
            groesse="kompakt"
            onClick={() => {
              setText(profil.notes ?? '');
              setBearbeiten(true);
            }}
          >
            Bearbeiten
          </Button>
        ) : null
      }
    >
      {bearbeiten ? (
        <form
          aria-label="Notizen bearbeiten"
          className="max-w-formular flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            speichern.mutate();
          }}
        >
          <TextArea
            label="Notizen der Beratung"
            labelVersteckt
            rows={4}
            maxLength={4000}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          {speichern.isError ? (
            <Statusmeldung ton="fehler">{speichern.error.message}</Statusmeldung>
          ) : null}
          <Formularfuss dicht>
            <Button type="submit" variant="secondary" disabled={speichern.isPending}>
              {speichern.isPending ? 'Wird gespeichert …' : 'Speichern'}
            </Button>
            <Button type="button" variant="quiet" onClick={() => setBearbeiten(false)}>
              Abbrechen
            </Button>
          </Formularfuss>
        </form>
      ) : (
        <p className="text-liste text-ink wrap-anywhere whitespace-pre-line">
          {profil.notes ?? (
            <span className="text-ink-muted">Keine Notizen. Die Person sieht sie nicht.</span>
          )}
        </p>
      )}
    </Section>
  );
}

function Beenden({
  profil,
  sicht,
  art,
  verhaeltnisId,
}: {
  profil: Ernaehrungsprofil;
  sicht: Ernaehrungssicht;
  art: Verhaeltnisart;
  verhaeltnisId: string;
}) {
  const neuLaden = useNeuLaden(art, verhaeltnisId);
  const [tag, setTag] = useState(sicht.today);
  const beenden = useMutation({
    mutationFn: () => beratungBeenden(profil.id, tag),
    onSuccess: () => neuLaden(),
  });
  return (
    <Rueckfrage
      ausloeser="Beratung beenden"
      ausloeserVariante="quiet"
      ausloeserGroesse="kompakt"
      bestaetigen="Beratung beenden"
      bestaetigenLaeuft="Wird beendet …"
      fehler={beenden.error?.message}
      onBestaetigen={() => beenden.mutateAsync()}
      onAbbrechen={() => setTag(sicht.today)}
    >
      <p>
        Danach bleibt das Profil unverändert stehen und wird drei Jahre nach dem Ende gelöscht. Die
        Person sieht es auf der Plattform nicht mehr.
      </p>
      <div className="mt-3 max-w-60">
        <Field
          label="Beendet am"
          type="date"
          min={profil.started_on}
          max={sicht.today}
          value={tag}
          onChange={(event) => setTag(event.target.value)}
        />
      </div>
    </Rueckfrage>
  );
}
