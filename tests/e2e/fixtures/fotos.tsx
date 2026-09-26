import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import type { CurrentUser } from '@/features/session/types';
import type { Datenschutzvermerk } from '@/features/datenschutz/vermerke';
import { Dateienbereich } from '@/features/files/PatientFilesPage';
import { Ansicht, Patientenfotos, type Geladen } from '@/features/files/Patientenfotos';
import type { Patientenfoto } from '@/features/files/patientenfotos';
import { entferneMetadaten } from '@/features/files/metadaten';
import { basis, CHROMIUM_PNG, jpegVomHandy, pngVomHandy } from '@/features/files/testbilder';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `fotos.html` (DOK-006).
 *
 * Vier Ansichten über `?ansicht=`:
 *
 *   * `fotos` — der Abschnitt „Fotos" im Verlauf mit Einwilligung und drei
 *     Fotos; „Foto aufnehmen" öffnet den Kameradialog, den die künstliche
 *     Kamera von Chromium speist. Gespeichert wird nichts: Es gibt keinen
 *     Server, und genau das zeigt die Fehlermeldung mit dem Angebot, es
 *     erneut zu versuchen.
 *   * `vergleich` — zwei Fotos nebeneinander, aus Formen im Canvas gezeichnet.
 *   * `dokument` — der Bereich „Dateien" mit „Foto aufnehmen" neben dem
 *     Dateiwähler.
 *   * `bereinigung` — ein JPEG und ein PNG mit Ortsangabe und Vorschaubild,
 *     durch die Metadatenentfernung geschickt und im echten Browser
 *     dekodiert: Der Test sieht, ob das Bild danach noch ein Bild ist.
 *
 * Die Daten liegen vorab im Cache und werden nicht nachgeladen.
 */
const ansicht = new URLSearchParams(window.location.search).get('ansicht') ?? 'fotos';
const PATIENT = '66666666-6666-4666-8666-000000000001';

const nutzer: CurrentUser = {
  profile: {
    id: '11111111-1111-4111-8111-000000000002',
    organization_id: '22222222-2222-4222-8222-000000000001',
    person_id: '44444444-4444-4444-8444-000000000002',
    display_name: 'Anna Beispiel',
    is_active: true,
  },
  roles: ['therapist'],
  organizationName: 'Test Praxis Tuebingen',
  organizationTimeZone: 'Europe/Berlin',
  appointmentGridMinutes: 5,
  staffMemberId: '55555555-5555-4555-8555-000000000002',
};

const FOTOS: Patientenfoto[] = [
  {
    id: 'f3',
    display_name: 'Testgegenstand, dritte Aufnahme',
    taken_at: '2026-09-24T09:15:00Z',
    taken_by_name: 'Anna Beispiel',
    delete_after: '2027-09-24T09:15:00Z',
    object_missing: false,
  },
  {
    id: 'f2',
    display_name: 'Testgegenstand, zweite Aufnahme',
    taken_at: '2026-09-10T14:30:00Z',
    taken_by_name: 'Tim Teamleitung',
    delete_after: '2027-09-10T14:30:00Z',
    object_missing: false,
  },
  {
    id: 'f1',
    display_name: 'Testgegenstand, erste Aufnahme',
    taken_at: '2026-08-27T08:00:00Z',
    taken_by_name: 'Anna Beispiel',
    delete_after: '2027-08-27T08:00:00Z',
    object_missing: false,
  },
];

const VERMERKE: Datenschutzvermerk[] = [
  {
    id: 'v1',
    record_kind: 'consent_granted',
    purpose: 'patient_photos',
    notice_version: null,
    occurred_on: '2026-08-27',
    recorded_at: '2026-08-27T07:55:00Z',
  },
];

const client = new QueryClient({
  defaultOptions: {
    queries: { staleTime: Infinity, retry: false, refetchOnMount: false },
  },
});
client.setQueryData(['patient-photos', PATIENT], FOTOS);
client.setQueryData(['datenschutzvermerke', PATIENT], VERMERKE);
client.setQueryData(['patient-files', PATIENT], []);

/** Eine synthetische Aufnahme: ein Gegenstand als Form, kein Mensch. */
function gezeichnet(farbe: string, groesse: number): Promise<string> {
  const leinwand = document.createElement('canvas');
  leinwand.width = 600;
  leinwand.height = 800;
  const stift = leinwand.getContext('2d')!;
  stift.fillStyle = '#e8e4dc';
  stift.fillRect(0, 0, 600, 800);
  stift.fillStyle = farbe;
  stift.beginPath();
  stift.ellipse(300, 400, groesse, groesse * 1.3, 0, 0, Math.PI * 2);
  stift.fill();
  return new Promise((fertig) =>
    leinwand.toBlob((bild) => fertig(URL.createObjectURL(bild!)), 'image/jpeg', 0.9),
  );
}

/**
 * Die Ansichten entstehen ohne eigene Komponenten: Eine Prüfseite exportiert
 * nichts, und React Refresh verlangt Komponenten nur in exportierenden Dateien.
 */
async function vergleich() {
  const [alt, neu] = await Promise.all([gezeichnet('#b5654a', 170), gezeichnet('#b5654a', 130)]);
  const fotos: Geladen[] = [
    { foto: FOTOS[2]!, adresse: alt },
    { foto: FOTOS[0]!, adresse: neu },
  ];
  return <Ansicht fotos={fotos} zeitzone="Europe/Berlin" onSchliessen={() => undefined} />;
}

/** Bereinigt im echten Browser und zeigt das Ergebnis als Bild. */
function bereinigung() {
  const jpeg = entferneMetadaten(jpegVomHandy(6), 'image/jpeg');
  const png = entferneMetadaten(pngVomHandy(8), 'image/png');
  const original = basis(CHROMIUM_PNG);
  const adresse = (bytes: Uint8Array, typ: string) =>
    URL.createObjectURL(new Blob([bytes as BlobPart], { type: typ }));
  return (
    <div className="flex gap-4">
      <img src={adresse(jpeg, 'image/jpeg')} alt="JPEG nach der Bereinigung" width={80} />
      <img src={adresse(png, 'image/png')} alt="PNG nach der Bereinigung" width={80} />
      <img src={adresse(original, 'image/png')} alt="PNG ohne Metadaten" width={80} />
    </div>
  );
}

async function inhalt() {
  if (ansicht === 'vergleich') return vergleich();
  if (ansicht === 'dokument') return <Dateienbereich patientId={PATIENT} user={nutzer} />;
  if (ansicht === 'bereinigung') return bereinigung();
  return <Patientenfotos patientId={PATIENT} user={nutzer} />;
}

// Ein Data Router wie in der Anwendung: Der Fotoverlustschutz braucht ihn.
void inhalt().then((seite) => {
  const router = createMemoryRouter([
    { path: '*', element: <main className="mx-auto max-w-5xl px-4 py-6">{seite}</main> },
  ]);
  createRoot(document.getElementById('wurzel')!).render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
});
