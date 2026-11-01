import { useState } from 'react';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/PageHeader';
import { Section } from '@/components/ui/Section';
import { Segment } from '@/components/ui/Segment';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { ListRow } from '@/components/ui/ListRow';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { Disclosure } from '@/components/ui/Card';
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
  type DatevEinstellungen,
  type DatevLaufzeile,
} from './datev-api';

/**
 * Export für die Steuerberatung (ANN-828 bis ANN-830): je Bereich und Monat ein Buchungsstapel im
 * DATEV-Format, Späteres als Nachtrag, die Belege über den Sammeldruck. Der Server prüft die Rechte.
 */

const MONATE = 24;

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
  const [bereich, setBereich] = useState<DatevBereich>('therapy');
  const [monat, setMonat] = useState(monatPlus(dieserMonat, -1));
  const monate = Array.from({ length: MONATE }, (_, i) => monatPlus(dieserMonat, -i));

  const einstellungen = useQuery({
    queryKey: ['datev-einstellungen'],
    queryFn: fetchDatevEinstellungen,
    retry: false,
  });

  return (
    <>
      <PageHeader title="Steuerberatung" description="Buchungsstapel im DATEV-Format." />

      <Section titel="Bereich und Monat">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <Segment
            beschriftung="Bereich"
            wahlen={BEREICHE}
            gewaehlt={bereich}
            onWaehlen={setBereich}
          />
          <div className="sm:w-56">
            <Select label="Monat" value={monat} onChange={(e) => setMonat(e.target.value)}>
              {monate.map((wert) => (
                <option key={wert} value={wert}>
                  {monatLang(wert)}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Section>

      <Abfragezustand
        abfrage={einstellungen}
        laden="Die DATEV-Angaben werden geladen …"
        fehler="Die DATEV-Angaben konnten nicht geladen werden."
      >
        {(werte) => (
          <>
            <Monat
              key={`${bereich}-${monat}`}
              bereich={bereich}
              monat={monat}
              einstellungen={werte}
              darfExportieren={canManageInvoicing(user.roles)}
              zeitzone={zeitzone}
            />
            <Angaben einstellungen={werte} darfPflegen={canManageBillingProfile(user.roles)} />
          </>
        )}
      </Abfragezustand>

      <Kleingedrucktes className="mt-8">
        Der Stapel trägt Rechnungsnummern und Beträge, keine Namen und keine Diagnosen. Die Konten
        folgen dem Standard des Kontenrahmens, bis Ihre Steuerberatung andere nennt. Kein
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
  zeitzone,
}: {
  bereich: DatevBereich;
  monat: string;
  einstellungen: DatevEinstellungen | null;
  darfExportieren: boolean;
  zeitzone: string;
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
    mutationFn: async () => laden(await fetchDatevLauf(await erstelleDatevLauf(bereich, monat))),
    onSuccess: (datei) => setGeladen(datei),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['datev-offen', bereich, monat] });
      void queryClient.invalidateQueries({ queryKey: ['datev-laeufe', bereich, monat] });
    },
  });

  const nachtrag = (laeufe.data ?? []).length > 0;

  return (
    <>
      <Section titel={nachtrag ? 'Neu seit dem letzten Export' : 'Noch nicht exportiert'}>
        {einstellungen === null || mandant == null ? (
          <Statusmeldung ton="warnung">
            {einstellungen === null
              ? 'Es sind noch keine DATEV-Angaben erfasst.'
              : 'Für diesen Bereich fehlt die Mandantennummer.'}
          </Statusmeldung>
        ) : null}
        <Abfragezustand
          abfrage={offen}
          laden="Die Buchungen werden geladen …"
          fehler="Die Buchungen konnten nicht geladen werden."
          inKarte
          leer={{
            wenn: (zeilen) => zeilen.length === 0,
            titel: nachtrag ? 'Nichts Neues' : 'Keine Buchungen in diesem Monat',
          }}
        >
          {(zeilen) => (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-liste tabular-nums">{zusammenfassung(zeilen)}</p>
              {darfExportieren && einstellungen !== null && mandant != null ? (
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

      <Laeufe laeufe={laeufe} zeitzone={zeitzone} monat={monat} />
    </>
  );
}

function Laeufe({
  laeufe,
  zeitzone,
  monat,
}: {
  laeufe: UseQueryResult<DatevLaufzeile[]>;
  zeitzone: string;
  monat: string;
}) {
  const [fehler, setFehler] = useState<string | null>(null);
  const abrufen = useMutation({
    mutationFn: async (id: string) => laden(await fetchDatevLauf(id)),
    onMutate: () => setFehler(null),
    onError: (e) => setFehler(e.message),
  });

  return (
    <Abfragezustand
      abfrage={laeufe}
      laden="Die Exporte werden geladen …"
      fehler="Die Exporte konnten nicht geladen werden."
    >
      {(zeilen) => (
        <Listenabschnitt
          titel={`Exporte · ${monatLang(monat)}`}
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
            const name = lauf.sequence === 1 ? 'Erster Export' : `Nachtrag ${lauf.sequence - 1}`;
            const drucke = belegdrucke(lauf);
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
  const aendern = darfPflegen ? (
    <ButtonLink to="/abrechnung/steuerberatung/angaben" variant="secondary" groesse="kompakt">
      {einstellungen === null ? 'Eintragen' : 'Ändern'}
    </ButtonLink>
  ) : undefined;

  if (einstellungen === null) {
    return (
      <Section titel="DATEV-Angaben" aktion={aendern}>
        <p className="text-ink-muted text-sm">
          {darfPflegen
            ? 'Beraternummer, Mandantennummer und Kontenrahmen nennt Ihre Steuerberatung.'
            : 'Eintragen kann sie die Praxisinhaber:in.'}
        </p>
      </Section>
    );
  }

  const rahmen: Kontenrahmen = einstellungen.chart_of_accounts;
  return (
    <Section titel="DATEV-Angaben" aktion={aendern} rahmen>
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
