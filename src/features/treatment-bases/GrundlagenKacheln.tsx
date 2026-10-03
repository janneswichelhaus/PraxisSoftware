import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import type { PatientFile } from '@/features/files/api';
import { useDateien } from '@/features/files/dateien';
import { dateibereich } from '@/features/files/dokumentarten';
import { canWriteTreatmentBases, type CurrentUser } from '@/features/session/types';
import { formatDate } from '@/lib/datum';
import { istVerordnung } from './api';
import { DatenUebertragenFenster, type Uebertragung } from './DatenUebertragenFenster';
import type { VerordnungMitZahlen } from './grundlagen';
import { heilmittelKurz } from './heilmittel';

/**
 * Die Behandlungsgrundlagen als Kachelleiste (Akte entschlacken, 2026-10-03,
 * Entwürfe 5e-5g): „Daten statt Foto".
 *
 * Reihenfolge: zuerst Fotos, an denen noch keine Grundlage hängt - sie sind
 * Arbeit -, dann die laufenden, zuletzt die abgeschlossenen (ausgeschöpft,
 * ANN-042) gedämpft. Die Leiste ist Übersicht und Einstieg: Ein Tipp auf ein
 * Foto oder eine Verordnung öffnet „Daten übertragen", wer das nicht darf
 * oder einen Selbstzahler antippt, springt zur ausführlichen Karte darunter.
 *
 * Die Kachel zeigt keine Bildvorschau: Das Foto lädt erst auf Tipp im Fenster
 * über den protokollierten Lesepfad (ADR-017 Punkte 15 und 20) - eine Leiste
 * voller Vorschauen wäre je Kachel ein Lesezugriff ohne Anlass.
 */

/** Ein Verordnungsfoto, das noch an keiner Grundlage hängt. */
function offenesFoto(datei: PatientFile): boolean {
  return dateibereich(datei.document_type) === 'grundlagen' && datei.treatment_basis_id === null;
}

function fotoTag(zeitpunkt: string | null, zeitzone: string): string | null {
  if (!zeitpunkt) return null;
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: zeitzone,
  }).format(new Date(zeitpunkt));
}

const kachelKlassen =
  'rounded-card border flex h-[216px] w-[156px] shrink-0 snap-start flex-col overflow-hidden text-left @zweispaltig:w-[188px] focus-visible:outline-2 focus-visible:outline-offset-2';

export function GrundlagenKacheln({
  patientId,
  user,
  aktuell,
  abgeschlossen,
}: {
  patientId: string;
  user: CurrentUser;
  aktuell: readonly VerordnungMitZahlen[];
  abgeschlossen: readonly VerordnungMitZahlen[];
}) {
  const navigate = useNavigate();
  const { dateien } = useDateien(patientId, user);
  const [offen, setOffen] = useState<Uebertragung | null>(null);
  const darfSchreiben = canWriteTreatmentBases(user.roles);
  const zeitzone = user.organizationTimeZone ?? 'Europe/Berlin';

  const fotos = dateien.filter(offenesFoto);
  const anzahl = aktuell.length + abgeschlossen.length;
  if (fotos.length === 0 && anzahl === 0) return null;

  function antippen(eintrag: VerordnungMitZahlen) {
    const { verordnung } = eintrag;
    if (darfSchreiben && istVerordnung(verordnung.treatment_basis_kind)) {
      setOffen({ art: 'grundlage', grundlageId: verordnung.id });
      return;
    }
    void navigate({ hash: `#verordnung-${verordnung.id}` });
  }

  return (
    <section aria-labelledby="grundlagen-kacheln" className="@container mb-8">
      <h2 id="grundlagen-kacheln" className="text-ink text-h4 mb-3 font-bold">
        Behandlungsgrundlagen{' '}
        <span className="text-ink-muted text-liste font-normal">
          · {anzahl === 1 ? '1 Grundlage' : `${anzahl} Grundlagen`}
        </span>
      </h2>
      <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
        {fotos.map((datei) => {
          const tag = fotoTag(datei.uploaded_at, zeitzone);
          return (
            <li key={datei.id} className="flex">
              <button
                type="button"
                disabled={!darfSchreiben}
                aria-label={`Verordnungsfoto${tag ? ` vom ${tag}` : ''}: Daten übertragen`}
                className={`${kachelKlassen} border-warnung bg-surface disabled:cursor-default`}
                onClick={() => setOffen({ art: 'foto', fileId: datei.id, fotoVom: tag })}
              >
                <span
                  aria-hidden="true"
                  className="bg-surface-sunken flex flex-1 items-start [background-image:repeating-linear-gradient(135deg,transparent_0_10px,var(--color-line)_10px_11px)] p-3"
                >
                  <Badge ton="warnung">Daten fehlen</Badge>
                </span>
                <span className="border-line px-kachel-x py-kachel-y flex flex-col border-t">
                  <span className="text-accent text-sm font-bold">
                    {darfSchreiben ? 'Daten übertragen' : 'Daten fehlen'}
                  </span>
                  {tag ? <span className="text-ink-muted text-sm">Foto {tag}</span> : null}
                </span>
              </button>
            </li>
          );
        })}
        {aktuell.map((eintrag) => (
          <li key={eintrag.verordnung.id} className="flex">
            <Datenkachel eintrag={eintrag} onTippen={() => antippen(eintrag)} />
          </li>
        ))}
        {abgeschlossen.map((eintrag) => (
          <li key={eintrag.verordnung.id} className="flex">
            <Datenkachel eintrag={eintrag} abgeschlossen onTippen={() => antippen(eintrag)} />
          </li>
        ))}
      </ul>
      {offen ? (
        <DatenUebertragenFenster
          patientId={patientId}
          user={user}
          uebertragung={offen}
          onSchliessen={() => setOffen(null)}
        />
      ) : null}
    </section>
  );
}

function Datenkachel({
  eintrag,
  abgeschlossen = false,
  onTippen,
}: {
  eintrag: VerordnungMitZahlen;
  abgeschlossen?: boolean;
  onTippen: () => void;
}) {
  const { verordnung } = eintrag;
  const verordnet = istVerordnung(verordnung.treatment_basis_kind);
  const icd = 'diagnosis_icd10' in verordnung ? verordnung.diagnosis_icd10 : null;

  let kopf;
  if (abgeschlossen) kopf = <Badge ton="positiv">Abgeschlossen</Badge>;
  else if (verordnet)
    kopf = (
      <span className="text-ink-muted tracking-label text-xs font-semibold uppercase">
        Verordnung
      </span>
    );
  else kopf = <Badge ton="akzent">Selbstzahler</Badge>;

  return (
    <button
      type="button"
      className={`${kachelKlassen} border-line px-kachel-x py-kachel-y gap-1 ${
        abgeschlossen ? 'bg-surface-sunken text-ink-muted' : 'bg-surface hover:border-accent'
      }`}
      onClick={onTippen}
    >
      <span className="flex min-h-7 items-center">{kopf}</span>
      <span className={`text-base font-bold ${abgeschlossen ? '' : 'text-ink'}`}>
        {formatDate(verordnung.issued_on)}
      </span>
      <span className="text-ink-muted truncate text-sm">
        {verordnet ? (verordnung.prescriber_name ?? '—') : 'ohne Verordnung'}
      </span>
      <span className="border-line my-1 border-t" aria-hidden="true" />
      <span className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden text-sm">
        {verordnung.items.map((item) => (
          <span key={item.id} className="flex justify-between gap-2">
            <span className="truncate">{heilmittelKurz(item.remedy)}</span>
            <span className="tabular-nums">
              {item.used_quantity}/{item.prescribed_quantity}
            </span>
          </span>
        ))}
      </span>
      <span className="text-ink-muted text-sm font-semibold">
        {verordnet ? (icd ? `ICD ${icd}` : 'ICD –') : 'Vereinbarung'}
      </span>
    </button>
  );
}
