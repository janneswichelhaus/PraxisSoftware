import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Disclosure } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { Fehlerzusammenfassung } from '@/components/ui/Fehlerzusammenfassung';
import { Field } from '@/components/ui/Field';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Feldgruppe, Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { TextArea } from '@/components/ui/TextArea';
import { Wahlreihe } from '@/components/ui/Wahlreihe';
import { EINGABETEXTE, useTextverlustschutz } from '@/app/Textverlustschutz';
import type { CurrentUser } from '@/features/core';
import { alsFormularfehler } from '@/lib/formularfehler';
import {
  ernaehrungSchluessel,
  fetchErnaehrung,
  profilAendern,
  profilAnlegen,
  zielwerteSetzen,
  type Ernaehrungsprofil,
  type Verhaeltnisart,
} from './api';
import { ernaehrungsFormulare, ernaehrungsReiter, leseZahl, leseZielwert } from './eingabe';
import {
  ERNAEHRUNG_EINWILLIGUNG,
  FORMEL_KURZ,
  FORMEL_ZUSATZ,
  GESCHLECHT_TEXTE,
  PAL_TEXTE,
  ZIEL_TEXTE,
  zahl,
} from './texte';
import {
  FORMELN,
  GESCHLECHTER,
  PAL_STUFEN,
  ZIELE,
  type Formel,
  type Geschlecht,
  type Ziel,
} from './zielwerte';
import { todayInTimeZone } from '@/lib/datum';

/**
 * Formulare der Ernährungsberatung (ERN-001): Profil anlegen, Profil ändern,
 * Zielwerte anpassen - neben dem Rahmen von Akte und Trainingsverhältnis,
 * wie die übrigen Formulare (UX-009, DESIGN.md „Formular“).
 *
 * Gerechnet wird nichts hier: Nach dem Speichern zeigt der Reiter die
 * Zielwerte, die der Server aus den Angaben rechnet (ADR-027 Abschnitt E).
 * Keine Diagnose, kein Befund als Eingabe (ADR-006 Punkt 14 a).
 */

function zahlText(wert: number | null | undefined, stellen = 0): string {
  return wert === null || wert === undefined ? '' : zahl(wert, stellen);
}

function useVerhaeltnis(art: Verhaeltnisart): string {
  const { patientId = '', relationshipId = '' } = useParams();
  return art === 'treatment' ? patientId : relationshipId;
}

type Feld =
  | 'einwilligung'
  | 'groesse'
  | 'gewicht'
  | 'geschlecht'
  | 'pal'
  | 'ziel'
  | 'koerperfett'
  | 'zielgewicht';

const BESCHRIFTUNG: Record<Feld, string> = {
  einwilligung: 'Einwilligung',
  groesse: 'Größe',
  gewicht: 'Gewicht',
  geschlecht: 'Geschlecht für die Formel',
  pal: 'Aktivität im Alltag',
  ziel: 'Ziel',
  koerperfett: 'Körperfettanteil',
  zielgewicht: 'Zielgewicht',
};

const REIHENFOLGE: readonly Feld[] = [
  'einwilligung',
  'groesse',
  'gewicht',
  'geschlecht',
  'pal',
  'ziel',
  'koerperfett',
  'zielgewicht',
];

const feldId = (feld: Feld) => `ernaehrung-${feld}`;

interface Werte {
  einwilligung: boolean;
  einwilligungAm: string;
  groesse: string;
  gewicht: string;
  geschlecht: Geschlecht | null;
  pal: string;
  ziel: Ziel | null;
  koerperfett: string;
  zielgewicht: string;
  formel: Formel;
  notizen: string;
}

function pruefen(werte: Werte, neu: boolean): Partial<Record<Feld, string>> {
  const fehler: Partial<Record<Feld, string>> = {};
  if (neu && !werte.einwilligung) fehler.einwilligung = 'Ohne Einwilligung entsteht kein Profil.';
  if (neu && werte.einwilligungAm === '') fehler.einwilligung = 'Bitte das Datum angeben.';
  const groesse = leseZahl(werte.groesse);
  if (groesse === null || groesse < 100 || groesse > 250)
    fehler.groesse = 'Bitte die Größe in cm angeben, 100 bis 250.';
  if (neu) {
    const gewicht = leseZahl(werte.gewicht);
    if (gewicht === null || gewicht < 20 || gewicht > 350)
      fehler.gewicht = 'Bitte das Gewicht in kg angeben, 20 bis 350.';
  }
  if (!werte.geschlecht) fehler.geschlecht = 'Bitte wählen.';
  if (werte.pal === '') fehler.pal = 'Bitte wählen.';
  if (!werte.ziel) fehler.ziel = 'Bitte wählen.';
  const koerperfett = leseZahl(werte.koerperfett);
  if (
    werte.koerperfett.trim() !== '' &&
    (koerperfett === null || koerperfett < 3 || koerperfett > 70)
  )
    fehler.koerperfett = 'Bitte in Prozent angeben, 3 bis 70 - oder leer lassen.';
  if (werte.formel === 'katch_mcardle' && koerperfett === null)
    fehler.koerperfett = 'Katch-McArdle rechnet mit dem Körperfettanteil.';
  const zielgewicht = leseZahl(werte.zielgewicht);
  if (
    werte.zielgewicht.trim() !== '' &&
    (zielgewicht === null || zielgewicht < 30 || zielgewicht > 300)
  )
    fehler.zielgewicht = 'Bitte in kg angeben, 30 bis 300 - oder leer lassen.';
  return fehler;
}

function Profilfelder({
  werte,
  setWerte,
  fehler,
  neu,
  heute,
}: {
  werte: Werte;
  setWerte: (werte: Werte) => void;
  fehler: Partial<Record<Feld, string>>;
  neu: boolean;
  heute: string;
}) {
  return (
    <>
      {neu ? (
        <Section titel="Einwilligung">
          <Feldgruppe>
            <Checkbox
              feldId={feldId('einwilligung')}
              label="Die Person hat in die Ernährungsberatung eingewilligt (auf Papier unterschrieben)."
              checked={werte.einwilligung}
              error={fehler.einwilligung}
              onChange={(event) => setWerte({ ...werte, einwilligung: event.target.checked })}
            />
            <Disclosure summary="Wortlaut">
              <p className="text-ink max-w-prose leading-relaxed">{ERNAEHRUNG_EINWILLIGUNG}</p>
            </Disclosure>
            <div className="max-w-60">
              <Field
                label="Unterschrieben am"
                type="date"
                max={heute}
                value={werte.einwilligungAm}
                onChange={(event) => setWerte({ ...werte, einwilligungAm: event.target.value })}
              />
            </div>
          </Feldgruppe>
        </Section>
      ) : null}
      <Section titel="Körperdaten">
        <Feldgruppe>
          {/* Zwei Spalten nur, wenn das Gewicht danebensteht (beim Anlegen);
              allein stünde die Größe halb breit. */}
          <div className={neu ? 'grid gap-4 sm:grid-cols-2' : 'grid gap-4'}>
            <Field
              feldId={feldId('groesse')}
              label="Größe (cm)"
              inputMode="numeric"
              autoComplete="off"
              value={werte.groesse}
              error={fehler.groesse}
              onChange={(event) => setWerte({ ...werte, groesse: event.target.value })}
            />
            {neu ? (
              <Field
                feldId={feldId('gewicht')}
                label="Gewicht heute (kg)"
                inputMode="decimal"
                autoComplete="off"
                value={werte.gewicht}
                error={fehler.gewicht}
                onChange={(event) => setWerte({ ...werte, gewicht: event.target.value })}
              />
            ) : null}
          </div>
          <div id={feldId('geschlecht')} tabIndex={-1}>
            <Wahlreihe
              legende={BESCHRIFTUNG.geschlecht}
              wahlen={GESCHLECHTER.map((wert) => ({ wert, text: GESCHLECHT_TEXTE[wert] }))}
              gewaehlt={werte.geschlecht}
              onWaehlen={(geschlecht) => setWerte({ ...werte, geschlecht })}
              zusatz={
                fehler.geschlecht ? (
                  <Statusmeldung ton="fehler">{fehler.geschlecht}</Statusmeldung>
                ) : null
              }
            />
          </div>
          <Field
            feldId={feldId('koerperfett')}
            label="Körperfettanteil (%)"
            hint="Freiwillig."
            inputMode="decimal"
            autoComplete="off"
            value={werte.koerperfett}
            error={fehler.koerperfett}
            onChange={(event) => setWerte({ ...werte, koerperfett: event.target.value })}
          />
        </Feldgruppe>
      </Section>
      <Section titel="Alltag und Ziel">
        <Feldgruppe>
          <div id={feldId('pal')} tabIndex={-1}>
            <Wahlreihe
              legende={BESCHRIFTUNG.pal}
              wahlen={PAL_STUFEN.map((pal) => ({
                wert: pal.toFixed(1),
                text: `${zahl(pal, 1)} · ${PAL_TEXTE[pal.toFixed(1)]!.kurz}`,
              }))}
              gewaehlt={werte.pal === '' ? null : werte.pal}
              onWaehlen={(pal) => setWerte({ ...werte, pal })}
              zusatz={
                fehler.pal ? (
                  <Statusmeldung ton="fehler">{fehler.pal}</Statusmeldung>
                ) : werte.pal !== '' ? (
                  <p className="text-ink-muted text-sm">Etwa: {PAL_TEXTE[werte.pal]?.beispiel}.</p>
                ) : null
              }
            />
          </div>
          <div id={feldId('ziel')} tabIndex={-1}>
            <Wahlreihe
              legende={BESCHRIFTUNG.ziel}
              wahlen={ZIELE.map((wert) => ({ wert, text: ZIEL_TEXTE[wert] }))}
              gewaehlt={werte.ziel}
              onWaehlen={(ziel) => setWerte({ ...werte, ziel })}
              zusatz={
                fehler.ziel ? <Statusmeldung ton="fehler">{fehler.ziel}</Statusmeldung> : null
              }
            />
          </div>
          <Field
            feldId={feldId('zielgewicht')}
            label="Zielgewicht (kg)"
            hint="Freiwillig."
            inputMode="decimal"
            autoComplete="off"
            value={werte.zielgewicht}
            error={fehler.zielgewicht}
            onChange={(event) => setWerte({ ...werte, zielgewicht: event.target.value })}
          />
          {!neu ? (
            <Wahlreihe
              legende="Formel des Grundumsatzes"
              wahlen={FORMELN.map((formel) => ({ wert: formel, text: FORMEL_KURZ[formel] }))}
              gewaehlt={werte.formel}
              onWaehlen={(formel: Formel) => setWerte({ ...werte, formel })}
              zusatz={<p className="text-ink-muted text-sm">{FORMEL_ZUSATZ[werte.formel]}</p>}
            />
          ) : null}
        </Feldgruppe>
      </Section>
      {neu ? (
        <Section titel="Notizen">
          <TextArea
            label="Notizen der Beratung"
            hint="Intern, die Person sieht sie nicht. Keine Diagnose, kein Befund."
            rows={3}
            maxLength={4000}
            value={werte.notizen}
            onChange={(event) => setWerte({ ...werte, notizen: event.target.value })}
          />
        </Section>
      ) : null}
    </>
  );
}

function leereWerte(heute: string): Werte {
  return {
    einwilligung: false,
    einwilligungAm: heute,
    groesse: '',
    gewicht: '',
    geschlecht: null,
    pal: '',
    ziel: null,
    koerperfett: '',
    zielgewicht: '',
    formel: 'standard',
    notizen: '',
  };
}

function werteAus(profil: Ernaehrungsprofil, heute: string): Werte {
  return {
    ...leereWerte(heute),
    groesse: zahlText(profil.height_cm),
    geschlecht: profil.formula_sex,
    pal: profil.activity_pal.toFixed(1),
    ziel: profil.goal,
    koerperfett: zahlText(profil.body_fat_percent, 1),
    zielgewicht: zahlText(profil.target_weight_kg, 1),
    formel: profil.bmr_formula,
  };
}

function Formular({
  art,
  verhaeltnisId,
  profil,
  heute,
}: {
  art: Verhaeltnisart;
  verhaeltnisId: string;
  profil: Ernaehrungsprofil | null;
  heute: string;
}) {
  const neu = profil === null;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const ziel = ernaehrungsReiter(art, verhaeltnisId);
  const [anfang] = useState<Werte>(() => (profil ? werteAus(profil, heute) : leereWerte(heute)));
  const [werte, setWerte] = useState<Werte>(anfang);
  const [fehler, setFehler] = useState<Partial<Record<Feld, string>>>({});
  const geaendert = JSON.stringify(werte) !== JSON.stringify(anfang);

  const { freigeben, schutz } = useTextverlustschutz({
    ungespeichert: geaendert,
    texte: EINGABETEXTE,
  });

  const speichern = useMutation({
    mutationFn: async () => {
      const angaben = {
        groesse: leseZahl(werte.groesse)!,
        geschlecht: werte.geschlecht!,
        koerperfett: leseZahl(werte.koerperfett),
        pal: Number(werte.pal),
        ziel: werte.ziel!,
        zielgewicht: leseZahl(werte.zielgewicht),
      };
      if (profil) {
        await profilAendern(profil.id, profil.updated_at, { ...angaben, formel: werte.formel });
      } else {
        await profilAnlegen({
          ...angaben,
          art,
          verhaeltnisId,
          einwilligungAm: werte.einwilligungAm,
          gewicht: leseZahl(werte.gewicht)!,
          notizen: werte.notizen,
        });
      }
    },
    onSuccess: async () => {
      freigeben();
      await queryClient.invalidateQueries({ queryKey: ernaehrungSchluessel(art, verhaeltnisId) });
      void navigate(ziel, { replace: true });
    },
  });

  function absenden(event: FormEvent) {
    event.preventDefault();
    const gefunden = pruefen(werte, neu);
    setFehler(gefunden);
    if (Object.keys(gefunden).length === 0) speichern.mutate();
  }

  return (
    <form
      onSubmit={absenden}
      noValidate
      className="max-w-formular"
      aria-label={neu ? 'Profil anlegen' : 'Profil ändern'}
    >
      <Fehlerzusammenfassung
        fehler={alsFormularfehler(REIHENFOLGE, BESCHRIFTUNG, fehler, feldId)}
      />
      <Profilfelder werte={werte} setWerte={setWerte} fehler={fehler} neu={neu} heute={heute} />
      {speichern.isError ? (
        <Statusmeldung ton="fehler" className="mt-4">
          {speichern.error.message}
        </Statusmeldung>
      ) : null}
      <Formularfuss>
        <Button type="submit" disabled={speichern.isPending}>
          {speichern.isPending ? 'Wird gespeichert …' : neu ? 'Profil anlegen' : 'Speichern'}
        </Button>
        <Button type="button" variant="quiet" onClick={() => void navigate(ziel)}>
          Abbrechen
        </Button>
      </Formularfuss>
      {schutz}
    </form>
  );
}

/** `/patienten/:patientId/ernaehrung/neu`, `/training/:relationshipId/ernaehrung/neu` */
export function ProfilAnlegenSeite({ art, user }: { art: Verhaeltnisart; user: CurrentUser }) {
  const verhaeltnisId = useVerhaeltnis(art);
  const heute = todayInTimeZone(user.organizationTimeZone ?? 'Europe/Berlin');
  return (
    <>
      <Rueckweg standard={ernaehrungsReiter(art, verhaeltnisId)} className="mb-3" />
      <PageHeader title="Ernährungsberatung anlegen" />
      <Formular art={art} verhaeltnisId={verhaeltnisId} profil={null} heute={heute} />
    </>
  );
}

function useLaufendesProfil(art: Verhaeltnisart, verhaeltnisId: string) {
  return useQuery({
    queryKey: ernaehrungSchluessel(art, verhaeltnisId),
    queryFn: () => fetchErnaehrung(art, verhaeltnisId),
    retry: false,
    // Jedes Laden ist ein protokolliertes Öffnen des Verhältnisses.
    refetchOnWindowFocus: false,
  });
}

/** `…/ernaehrung/bearbeiten` - Körperdaten, Aktivität, Ziel, Formel, Zielgewicht. */
export function ProfilAendernSeite({ art, user }: { art: Verhaeltnisart; user: CurrentUser }) {
  const verhaeltnisId = useVerhaeltnis(art);
  const heute = todayInTimeZone(user.organizationTimeZone ?? 'Europe/Berlin');
  const abfrage = useLaufendesProfil(art, verhaeltnisId);
  return (
    <>
      <Rueckweg standard={ernaehrungsReiter(art, verhaeltnisId)} className="mb-3" />
      <PageHeader title="Ernährungsprofil ändern" />
      <div className="max-w-formular">
        <Abfragezustand
          abfrage={abfrage}
          laden="Das Profil wird geladen …"
          fehler="Das Profil konnte nicht geladen werden."
          inKarte
          leer={keineBeratung(art, verhaeltnisId)}
        >
          {(sicht) => (
            <Formular
              art={art}
              verhaeltnisId={verhaeltnisId}
              profil={sicht!.profile}
              heute={heute}
            />
          )}
        </Abfragezustand>
      </div>
    </>
  );
}

type Wertfeld = 'energy_kcal' | 'protein_g' | 'carbohydrate_g' | 'fat_g' | 'water_ml';

/**
 * Die Felder der Überschreibung mit den Grenzen der Tabelle. Wasser steht in
 * Litern wie in der Anzeige und geht in Millilitern zum Server (auf 10 ml).
 */
const WERTFELDER: readonly {
  feld: Wertfeld;
  label: string;
  einheit: string;
  min: number;
  max: number;
  liter?: true;
}[] = [
  { feld: 'energy_kcal', label: 'Energie (kcal)', einheit: 'kcal', min: 500, max: 6000 },
  { feld: 'protein_g', label: 'Eiweiß (g)', einheit: 'g', min: 10, max: 400 },
  { feld: 'carbohydrate_g', label: 'Kohlenhydrate (g)', einheit: 'g', min: 0, max: 900 },
  { feld: 'fat_g', label: 'Fett (g)', einheit: 'g', min: 10, max: 400 },
  { feld: 'water_ml', label: 'Wasser (l)', einheit: 'l', min: 0.5, max: 8, liter: true },
];

const WERT_BESCHRIFTUNG = Object.fromEntries(
  WERTFELDER.map(({ feld, label }) => [feld, label]),
) as Record<Wertfeld, string>;
const wertfeldId = (feld: Wertfeld) => `zielwert-${feld}`;

function berechnet(profil: Ernaehrungsprofil, feld: Wertfeld): number | null {
  const z = profil.targets;
  if (z.status !== 'ok') return null;
  switch (feld) {
    case 'energy_kcal':
      return z.energy.computed_kcal;
    case 'protein_g':
      return z.protein.computed_g;
    case 'carbohydrate_g':
      return z.carbohydrate.computed_g;
    case 'fat_g':
      return z.fat.computed_g;
    case 'water_ml':
      return z.water.computed_ml;
  }
}

function ZielwerteFormular({
  art,
  verhaeltnisId,
  profil,
}: {
  art: Verhaeltnisart;
  verhaeltnisId: string;
  profil: Ernaehrungsprofil;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const ziel = ernaehrungsReiter(art, verhaeltnisId);
  const [werte, setWerte] = useState<Record<Wertfeld, string>>(
    () =>
      Object.fromEntries(
        WERTFELDER.map(({ feld, liter }) => {
          const wert = profil.overrides[feld];
          return [feld, wert === null ? '' : liter ? zahl(wert / 1000, 1) : zahl(wert)];
        }),
      ) as Record<Wertfeld, string>,
  );
  const [fehler, setFehler] = useState<Partial<Record<Wertfeld, string>>>({});
  const speichern = useMutation({
    mutationFn: (gesetzt: Record<Wertfeld, number | null>) => zielwerteSetzen(profil.id, gesetzt),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ernaehrungSchluessel(art, verhaeltnisId) });
      void navigate(ziel, { replace: true });
    },
  });

  return (
    <form
      className="max-w-formular"
      aria-label="Zielwerte anpassen"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const gefunden: Partial<Record<Wertfeld, string>> = {};
        const gesetzt = {} as Record<Wertfeld, number | null>;
        for (const feld of WERTFELDER) {
          const ergebnis = leseZielwert(werte[feld.feld], feld);
          if ('fehler' in ergebnis) gefunden[feld.feld] = ergebnis.fehler;
          else gesetzt[feld.feld] = ergebnis.wert;
        }
        setFehler(gefunden);
        if (Object.keys(gefunden).length === 0) speichern.mutate(gesetzt);
      }}
    >
      <Fehlerzusammenfassung
        fehler={alsFormularfehler(
          WERTFELDER.map(({ feld }) => feld),
          WERT_BESCHRIFTUNG,
          fehler,
          wertfeldId,
        )}
      />
      <Section titel="Von der Beratung gesetzt">
        <Feldgruppe>
          {WERTFELDER.map(({ feld, label, einheit, liter }) => {
            const gerechnet = berechnet(profil, feld);
            return (
              <Field
                key={feld}
                feldId={wertfeldId(feld)}
                label={label}
                // Was ein leeres Feld bedeutet, in einer kurzen Zeile statt
                // fünfmal desselben Satzes (DESIGN.md Regel 6).
                hint={
                  gerechnet === null
                    ? undefined
                    : `Leer: ${liter ? zahl(gerechnet / 1000, 1) : zahl(gerechnet)} ${einheit} (berechnet)`
                }
                inputMode={liter ? 'decimal' : 'numeric'}
                autoComplete="off"
                value={werte[feld]}
                error={fehler[feld]}
                onChange={(event) => setWerte({ ...werte, [feld]: event.target.value })}
              />
            );
          })}
        </Feldgruppe>
      </Section>
      {speichern.isError ? (
        <Statusmeldung ton="fehler" className="mt-4">
          {speichern.error.message}
        </Statusmeldung>
      ) : null}
      <Formularfuss>
        <Button type="submit" disabled={speichern.isPending}>
          {speichern.isPending ? 'Wird gespeichert …' : 'Speichern'}
        </Button>
        <Button type="button" variant="quiet" onClick={() => void navigate(ziel)}>
          Abbrechen
        </Button>
      </Formularfuss>
    </form>
  );
}

/** Ohne laufende Beratung: der Weg zum Anlegen (DESIGN.md 9.17). */
function keineBeratung(art: Verhaeltnisart, verhaeltnisId: string) {
  return {
    wenn: (sicht: Awaited<ReturnType<typeof fetchErnaehrung>>) =>
      !sicht?.profile || sicht.profile.ended_on !== null,
    titel: 'Keine laufende Ernährungsberatung',
    aktion: (
      <ButtonLink to={`${ernaehrungsFormulare(art, verhaeltnisId)}/neu`} variant="secondary">
        Profil anlegen
      </ButtonLink>
    ),
  };
}

/** `…/ernaehrung/zielwerte` - Überschreibungen der Beratung (ADR-027 Punkt 22). */
export function ZielwerteSeite({ art }: { art: Verhaeltnisart }) {
  const verhaeltnisId = useVerhaeltnis(art);
  const abfrage = useLaufendesProfil(art, verhaeltnisId);
  return (
    <>
      <Rueckweg standard={ernaehrungsReiter(art, verhaeltnisId)} className="mb-3" />
      <PageHeader title="Zielwerte anpassen" />
      <div className="max-w-formular">
        <Abfragezustand
          abfrage={abfrage}
          laden="Das Profil wird geladen …"
          fehler="Das Profil konnte nicht geladen werden."
          inKarte
          leer={keineBeratung(art, verhaeltnisId)}
        >
          {(sicht) => (
            <ZielwerteFormular art={art} verhaeltnisId={verhaeltnisId} profil={sicht!.profile!} />
          )}
        </Abfragezustand>
      </div>
    </>
  );
}
