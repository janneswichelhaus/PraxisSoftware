import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/PageHeader';
import { Section } from '@/components/ui/Section';
import { Segment } from '@/components/ui/Segment';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Chip } from '@/components/ui/Chip';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { ListRow } from '@/components/ui/ListRow';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { Disclosure } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/Feedback';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import {
  dayKey,
  formatDate,
  formatLocalTime,
  monatLang,
  monatPlus,
  todayInTimeZone,
} from '@/lib/datum';
import { canManageBillingProfile, canManageInvoicing, type CurrentUser } from '@/features/core';
import {
  KONTENRAHMEN,
  belegdrucke,
  buchungsstapel,
  dateiname,
  inWindows1252,
  laufname,
  zusammenfassung,
  type DatevBereich,
  type DatevLauf,
  type Kontenrahmen,
} from './datev';
import {
  erstelleDatevLauf,
  fetchDatevEinstellungen,
  fetchDatevLaeufe,
  fetchDatevLauf,
  fetchDatevOffen,
  fetchDatevOffeneMonate,
  type DatevEinstellungen,
  type DatevLaufzeile,
} from './datev-api';

/**
 * Export für die Steuerberatung (ANN-828 bis ANN-830): je Bereich und Monat ein Buchungsstapel im
 * DATEV-Format, Späteres als Nachtrag, die Belege über den Sammeldruck. Der Server prüft die Rechte.
 */

const MONATE = 24;
const ANGABEN = '/abrechnung/steuerberatung/angaben';

const BEREICHE = [
  { wert: 'therapy', text: 'Behandlung' },
  { wert: 'training', text: 'Training' },
] as const;

function laden(lauf: DatevLauf): string {
  const bytes = inWindows1252(buchungsstapel(lauf));
  const adresse = URL.createObjectURL(new Blob([bytes], { type: 'text/csv;charset=windows-1252' }));
  const anker = document.createElement('a');
  anker.href = adresse;
  anker.download = dateiname(lauf);
  document.body.append(anker);
  anker.click();
  anker.remove();
  setTimeout(() => URL.revokeObjectURL(adresse), 0);
  return anker.download;
}

export function SteuerberatungPage({ user }: { user: CurrentUser }) {
  const zeitzone = user.organizationTimeZone ?? 'Europe/Berlin';
  const dieserMonat = `${todayInTimeZone(zeitzone).slice(0, 7)}-01`;
  // Bereich und Monat stehen in der Adresse: Der Rückweg aus Belegen und Angaben behält sie.
  const [suche, setSuche] = useSearchParams();
  const bereich: DatevBereich = suche.get('bereich') === 'training' ? 'training' : 'therapy';
  const offeneMonate = useQuery({
    queryKey: ['datev-offene-monate', bereich],
    queryFn: () => fetchDatevOffeneMonate(bereich),
    retry: false,
  });
  const frueherOffen = (offeneMonate.data ?? [])
    .map((m) => m.period_month)
    .filter((m) => m < dieserMonat);
  // Ein offener Monat bleibt wählbar, auch wenn er vor den letzten 24 liegt.
  const monate = [
    ...new Set([
      ...Array.from({ length: MONATE }, (_, i) => monatPlus(dieserMonat, -i)),
      ...frueherOffen,
    ]),
  ].sort((a, b) => (a < b ? 1 : -1));
  const gesucht = suche.get('monat') ?? '';
  const monat = monate.includes(gesucht) ? gesucht : monatPlus(dieserMonat, -1);

  function waehle(neu: { bereich?: DatevBereich; monat?: string }) {
    const naechste = new URLSearchParams(suche);
    naechste.set('bereich', neu.bereich ?? bereich);
    naechste.set('monat', neu.monat ?? monat);
    setSuche(naechste, { replace: true });
  }

  const einstellungen = useQuery({
    queryKey: ['datev-einstellungen'],
    queryFn: fetchDatevEinstellungen,
    retry: false,
  });
  const auchOffen = (offeneMonate.data ?? []).filter(
    (m) => m.period_month !== monat && m.period_month < dieserMonat,
  );
  const hier = `/abrechnung/steuerberatung?bereich=${bereich}&monat=${monat}`;

  return (
    <>
      <PageHeader title="Steuerberatung" />

      <Section titel="Bereich und Monat">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <Segment
            beschriftung="Bereich"
            wahlen={BEREICHE}
            gewaehlt={bereich}
            onWaehlen={(wert) => waehle({ bereich: wert })}
          />
          <div className="sm:w-56">
            <Select label="Monat" value={monat} onChange={(e) => waehle({ monat: e.target.value })}>
              {monate.map((wert) => (
                <option key={wert} value={wert}>
                  {monatLang(wert)}
                </option>
              ))}
            </Select>
          </div>
        </div>
        {offeneMonate.isError ? (
          <Statusmeldung className="mt-4">Offene Vormonate nicht geladen.</Statusmeldung>
        ) : null}
        {auchOffen.length > 0 ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-ink-muted text-sm">Auch offen:</span>
            {auchOffen.map((m) => (
              <Chip key={m.period_month} onClick={() => waehle({ monat: m.period_month })}>
                {`${monatLang(m.period_month)} (${m.document_count})`}
              </Chip>
            ))}
          </div>
        ) : null}
      </Section>

      <Abfragezustand
        abfrage={einstellungen}
        laden="DATEV-Angaben werden geladen …"
        fehler="DATEV-Angaben nicht geladen."
      >
        {(werte) => (
          <>
            <Monat
              key={`${bereich}-${monat}`}
              bereich={bereich}
              monat={monat}
              einstellungen={werte}
              darfExportieren={canManageInvoicing(user.roles)}
              darfPflegen={canManageBillingProfile(user.roles)}
              zeitzone={zeitzone}
              hier={hier}
            />
            <Angaben einstellungen={werte} darfPflegen={canManageBillingProfile(user.roles)} />
          </>
        )}
      </Abfragezustand>

      <Kleingedrucktes className="mt-8">
        Der Stapel trägt Rechnungsnummern und Beträge, keine Namen und keine Diagnosen. Kein
        steuerlicher Abschluss.
      </Kleingedrucktes>
    </>
  );
}

function Monat({
  bereich,
  monat,
  einstellungen,
  darfExportieren,
  darfPflegen,
  zeitzone,
  hier,
}: {
  bereich: DatevBereich;
  monat: string;
  einstellungen: DatevEinstellungen | null;
  darfExportieren: boolean;
  darfPflegen: boolean;
  zeitzone: string;
  hier: string;
}) {
  const queryClient = useQueryClient();
  const [geladen, setGeladen] = useState<string | null>(null);
  const mandant =
    bereich === 'therapy'
      ? einstellungen?.client_number_therapy
      : einstellungen?.client_number_training;

  const offen = useQuery({
    queryKey: ['datev-offen', bereich, monat],
    queryFn: () => fetchDatevOffen(bereich, monat),
    retry: false,
  });
  const laeufe = useQuery({
    queryKey: ['datev-laeufe', bereich, monat],
    queryFn: () => fetchDatevLaeufe(bereich, monat),
    retry: false,
  });

  const erstellen = useMutation({
    mutationFn: async () => {
      const id = await erstelleDatevLauf(bereich, monat);
      try {
        return laden(await fetchDatevLauf(id));
      } catch {
        // Der Lauf steht schon; ein zweiter Tipp fände nichts Neues mehr.
        throw new Error('Der Export ist angelegt. Die Datei liegt unten unter „Datei“.');
      }
    },
    onSuccess: (datei) => setGeladen(datei),
    onSettled: () => {
      for (const schluessel of ['datev-offen', 'datev-laeufe']) {
        void queryClient.invalidateQueries({ queryKey: [schluessel, bereich, monat] });
      }
      void queryClient.invalidateQueries({ queryKey: ['datev-offene-monate', bereich] });
    },
  });

  // Erst mit der Liste der Läufe steht fest, ob ein Export ein Nachtrag wäre.
  const nachtrag = (laeufe.data ?? []).length > 0;

  return (
    <>
      <Section titel="Noch nicht exportiert">
        {einstellungen !== null && mandant != null ? null : (
          <div className="mb-4 flex flex-col gap-3">
            <Statusmeldung ton="warnung">
              {einstellungen === null ? 'DATEV-Angaben fehlen.' : 'Mandantennummer fehlt.'}
              {darfPflegen ? '' : ' Eintragen kann sie die Praxisinhaber:in.'}
            </Statusmeldung>
            {darfPflegen ? (
              <div>
                <ButtonLink to={ANGABEN} variant="secondary" groesse="kompakt">
                  {einstellungen === null ? 'DATEV-Angaben eintragen' : 'Mandantennummer eintragen'}
                </ButtonLink>
              </div>
            ) : null}
          </div>
        )}
        <Abfragezustand
          abfrage={offen}
          laden="Buchungen werden geladen …"
          fehler="Buchungen nicht geladen."
          inKarte
          leer={{ wenn: (zeilen) => zeilen.length === 0, titel: 'Nichts offen in diesem Monat' }}
        >
          {(zeilen) => (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-liste tabular-nums">{zusammenfassung(zeilen)}</p>
              {darfExportieren && einstellungen !== null && mandant != null && laeufe.isSuccess ? (
                <div className="flex flex-col gap-1 sm:items-end">
                  <Button
                    onClick={() => {
                      setGeladen(null);
                      erstellen.mutate();
                    }}
                    disabled={erstellen.isPending}
                  >
                    {erstellen.isPending
                      ? 'Wird erstellt …'
                      : nachtrag
                        ? 'Nachtrag erstellen'
                        : 'Buchungsstapel erstellen'}
                  </Button>
                  <p className="text-ink-muted text-sm tabular-nums">
                    {`Berater ${einstellungen.consultant_number} · Mandant ${mandant} · ${einstellungen.chart_of_accounts}`}
                  </p>
                </div>
              ) : null}
            </div>
          )}
        </Abfragezustand>
        {erstellen.isError ? (
          <Statusmeldung ton="fehler" className="mt-3">
            {erstellen.error.message}
          </Statusmeldung>
        ) : null}
        {geladen ? (
          <Rueckmeldung className="mt-3">{`Heruntergeladen: ${geladen}`}</Rueckmeldung>
        ) : null}
      </Section>

      <Laeufe laeufe={laeufe} zeitzone={zeitzone} monat={monat} hier={hier} />
    </>
  );
}

function Laeufe({
  laeufe,
  zeitzone,
  monat,
  hier,
}: {
  laeufe: UseQueryResult<DatevLaufzeile[]>;
  zeitzone: string;
  monat: string;
  hier: string;
}) {
  const [fehler, setFehler] = useState<string | null>(null);
  const abrufen = useMutation({
    mutationFn: async (id: string) => laden(await fetchDatevLauf(id)),
    onMutate: () => setFehler(null),
    onError: (e) => setFehler(e.message),
  });
  const titel = `Exporte · ${monatLang(monat)}`;

  return (
    <Abfragezustand
      abfrage={laeufe}
      laden="Exporte werden geladen …"
      fehler="Exporte nicht geladen."
      inKarte
      rahmen={(zustand) => <Section titel={titel}>{zustand}</Section>}
    >
      {(zeilen) => (
        <Listenabschnitt
          titel={titel}
          {...(zeilen.length > 0 ? { anzahl: zeilen.length } : {})}
          leer={{ titel: 'Noch kein Export in diesem Monat' }}
          {...(fehler
            ? {
                mehr: (
                  <Statusmeldung ton="fehler" className="mt-1">
                    {fehler}
                  </Statusmeldung>
                ),
              }
            : {})}
        >
          {zeilen.map((lauf) => {
            const name = laufname(lauf.sequence);
            const drucke = belegdrucke(lauf, hier);
            return (
              <ListRow
                key={lauf.id}
                titel={name}
                meta={`${formatDate(dayKey(lauf.created_at, zeitzone))}, ${formatLocalTime(
                  lauf.created_at,
                  zeitzone,
                )} Uhr · ${lauf.document_count} ${lauf.document_count === 1 ? 'Dokument' : 'Dokumente'}`}
                aktion={
                  <Button
                    variant="secondary"
                    groesse="kompakt"
                    disabled={abrufen.isPending}
                    onClick={() => abrufen.mutate(lauf.id)}
                    aria-label={`Datei: ${name} herunterladen`}
                  >
                    Datei
                  </Button>
                }
                darunter={
                  drucke.length > 0 ? (
                    <span className="flex flex-wrap gap-2">
                      {drucke.map((druck) => (
                        <ButtonLink key={druck.to} to={druck.to} variant="quiet" groesse="kompakt">
                          {drucke.length === 1
                            ? 'Belege drucken'
                            : `Belege ${druck.von}–${druck.bis} drucken`}
                        </ButtonLink>
                      ))}
                    </span>
                  ) : undefined
                }
              />
            );
          })}
        </Listenabschnitt>
      )}
    </Abfragezustand>
  );
}

const KONTENNAMEN: [keyof (typeof KONTENRAHMEN)['SKR03'], string][] = [
  ['debitor', 'Sammeldebitor'],
  ['bank', 'Bank (Überweisung)'],
  ['kasse', 'Kasse (anderer Weg)'],
  ['geldtransit', 'Geldtransit (Verrechnung)'],
  ['steuerfrei', 'Erlöse steuerfrei (§ 4 Nr. 14 UStG)'],
  ['regelsatz', 'Erlöse 19 % USt'],
  ['ermaessigt', 'Erlöse 7 % USt'],
  ['nichtSteuerbar', 'Erlöse nicht steuerbar'],
  ['kleinunternehmer', 'Erlöse Kleinunternehmer:in'],
];

function Angaben({
  einstellungen,
  darfPflegen,
}: {
  einstellungen: DatevEinstellungen | null;
  darfPflegen: boolean;
}) {
  if (einstellungen === null) {
    return (
      <Section titel="DATEV-Angaben">
        <EmptyState
          inKarte
          title="Noch keine DATEV-Angaben"
          {...(darfPflegen
            ? {
                aktion: (
                  <ButtonLink to={ANGABEN} variant="secondary">
                    Eintragen
                  </ButtonLink>
                ),
              }
            : {})}
        />
      </Section>
    );
  }

  const rahmen: Kontenrahmen = einstellungen.chart_of_accounts;
  return (
    <Section
      titel="DATEV-Angaben"
      rahmen
      {...(darfPflegen
        ? {
            aktion: (
              <ButtonLink to={ANGABEN} variant="secondary" groesse="kompakt">
                Ändern
              </ButtonLink>
            ),
          }
        : {})}
    >
      <DetailList>
        <DetailRow label="Beraternummer">{einstellungen.consultant_number}</DetailRow>
        <DetailRow label="Mandant Behandlung">
          {einstellungen.client_number_therapy ?? '—'}
        </DetailRow>
        <DetailRow label="Mandant Training">
          {einstellungen.client_number_training ?? '—'}
        </DetailRow>
        <DetailRow label="Kontenrahmen">{rahmen}</DetailRow>
      </DetailList>
      <Disclosure summary="Konten">
        <p className="text-ink-muted mb-2 text-sm">Standard des Kontenrahmens</p>
        <DetailList>
          {KONTENNAMEN.map(([schluessel, name]) => (
            <DetailRow key={schluessel} label={name}>
              {KONTENRAHMEN[rahmen][schluessel]}
            </DetailRow>
          ))}
        </DetailList>
      </Disclosure>
    </Section>
  );
}
