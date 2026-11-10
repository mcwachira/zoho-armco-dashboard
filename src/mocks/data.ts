import type { Alert, DeviceInfo, EventLog, ServiceHealth, Submission } from '@/types/domain'

const now = new Date()
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString()
const hist = (
  items: [number, string, string, 'healthy' | 'warning' | 'error'][],
): Submission['history'] =>
  items.map(([m, title, detail, status]) => ({ at: ago(m), title, detail, status }))

export const submissions: Submission[] = [
  {
    id: 'req-8f2a91',
    documentNumber: 'INV-2026-0482',
    documentId: '4897000000924101',
    customer: 'Mara Holdings Ltd',
    amount: 184500,
    currency: 'KES',
    type: 'Invoice',
    status: 'fiscalized',
    attempts: 1,
    cuReceiptNumber: 'CU-004821',
    qrAvailable: true,
    writeback: 'complete',
    createdAt: ago(48),
    updatedAt: ago(45),
    durationMs: 2320,
    history: hist([
      [48, 'Submission received', 'Invoice accepted from Zoho Books.', 'healthy'],
      [47, 'Fiscalization confirmed', 'Receipt evidence recorded by middleware.', 'healthy'],
      [45, 'Zoho writeback complete', 'Confirmed receipt fields written back.', 'healthy'],
    ]),
  },
  {
    id: 'req-5c3d77',
    documentNumber: 'CN-2026-0097',
    documentId: '4897000000924090',
    customer: 'Greenline Supplies',
    amount: 28700,
    currency: 'KES',
    type: 'Credit note',
    status: 'fiscalized',
    attempts: 2,
    cuReceiptNumber: 'CU-004819',
    qrAvailable: true,
    writeback: 'pending',
    createdAt: ago(83),
    updatedAt: ago(69),
    durationMs: 4630,
    history: hist([
      [83, 'Submission received', 'Credit note accepted from Zoho Books.', 'healthy'],
      [78, 'Device attempt', 'First attempt returned a transient communication error.', 'warning'],
      [69, 'Fiscalization confirmed', 'Receipt evidence confirmed on second attempt.', 'healthy'],
    ]),
  },
  {
    id: 'req-12ab40',
    documentNumber: 'INV-2026-0483',
    documentId: '4897000000924208',
    customer: 'Nairobi Office Mart',
    amount: 76200,
    currency: 'KES',
    type: 'Invoice',
    status: 'pending',
    attempts: 0,
    qrAvailable: false,
    writeback: 'pending',
    createdAt: ago(7),
    updatedAt: ago(7),
    history: hist([[7, 'Queued', 'Waiting for an available processing worker.', 'warning']]),
  },
  {
    id: 'req-22d710',
    documentNumber: 'INV-2026-0481',
    documentId: '4897000000924081',
    customer: 'Atlas Engineering',
    amount: 392000,
    currency: 'KES',
    type: 'Invoice',
    status: 'processing',
    attempts: 1,
    qrAvailable: false,
    writeback: 'pending',
    createdAt: ago(16),
    updatedAt: ago(2),
    history: hist([
      [16, 'Submission received', 'Invoice accepted from Zoho Books.', 'healthy'],
      [2, 'Processing', 'Device response is being awaited.', 'warning'],
    ]),
  },
  {
    id: 'req-773e1c',
    documentNumber: 'INV-2026-0479',
    documentId: '4897000000924012',
    customer: 'Coastal Logistics',
    amount: 128900,
    currency: 'KES',
    type: 'Invoice',
    status: 'failed',
    attempts: 3,
    qrAvailable: false,
    writeback: 'pending',
    createdAt: ago(144),
    updatedAt: ago(110),
    error: 'Device communication timed out before a confirmed response.',
    history: hist([
      [144, 'Submission received', 'Invoice accepted from Zoho Books.', 'healthy'],
      [123, 'Attempt failed', 'Device communication timed out.', 'error'],
      [110, 'Processing stopped', 'Three attempts recorded; operator review required.', 'error'],
    ]),
  },
  {
    id: 'req-a904bd',
    documentNumber: 'CN-2026-0095',
    documentId: '4897000000924007',
    customer: 'Kifaru Foods',
    amount: 12500,
    currency: 'KES',
    type: 'Credit note',
    status: 'manual_review',
    attempts: 2,
    qrAvailable: false,
    writeback: 'pending',
    createdAt: ago(265),
    updatedAt: ago(221),
    reviewReason: 'Device outcome could not be correlated with a confirmed receipt.',
    history: hist([
      [265, 'Submission received', 'Credit note accepted from Zoho Books.', 'healthy'],
      [243, 'Outcome uncertain', 'Response was interrupted after device request.', 'warning'],
      [221, 'Manual review opened', 'Receipt evidence needs operator reconciliation.', 'error'],
    ]),
  },
  {
    id: 'req-019fe2',
    documentNumber: 'INV-2026-0476',
    documentId: '4897000000923951',
    customer: 'Maple Retail Kenya',
    amount: 45600,
    currency: 'KES',
    type: 'Invoice',
    status: 'outcome_unknown',
    attempts: 1,
    qrAvailable: false,
    writeback: 'pending',
    createdAt: ago(308),
    updatedAt: ago(293),
    error: 'Connection closed before a final fiscalization outcome was recorded.',
    history: hist([
      [308, 'Submission received', 'Invoice accepted from Zoho Books.', 'healthy'],
      [293, 'Outcome unknown', 'No confirmed receipt evidence is available.', 'warning'],
    ]),
  },
  {
    id: 'req-4e88c1',
    documentNumber: 'INV-2026-0477',
    documentId: '4897000000923968',
    customer: 'Lakeside Distribution',
    amount: 97200,
    currency: 'KES',
    type: 'Invoice',
    status: 'fiscalized',
    attempts: 1,
    cuReceiptNumber: 'CU-004813',
    qrAvailable: true,
    writeback: 'failed',
    writebackError:
      'Zoho Books rejected the custom-field update. Confirmed fiscal evidence remains recorded.',
    createdAt: ago(344),
    updatedAt: ago(280),
    durationMs: 2410,
    history: hist([
      [344, 'Submission received', 'Invoice accepted from Zoho Books.', 'healthy'],
      [331, 'Fiscalization confirmed', 'Receipt evidence confirmed by middleware.', 'healthy'],
      [280, 'Zoho writeback failed', 'Custom-field update was rejected by Zoho Books.', 'error'],
    ]),
  },
  ...Array.from({ length: 17 }, (_, index): Submission => {
    const n = index + 1
    const done = n % 4 !== 0
    return {
      id: `req-demo-${String(n).padStart(3, '0')}`,
      documentNumber: `${n % 5 ? 'INV' : 'CN'}-2026-${String(470 - n).padStart(4, '0')}`,
      documentId: `4897000000923${String(900 - n).padStart(4, '0')}`,
      customer: ['Kibo Traders', 'Harbor Systems', 'Sunrise Medical', 'Orbit Telecom'][n % 4],
      amount: 18200 + n * 7925,
      currency: 'KES',
      type: n % 5 ? 'Invoice' : 'Credit note',
      status: done ? 'fiscalized' : 'pending',
      attempts: done ? 1 : 0,
      cuReceiptNumber: done ? `CU-${String(4800 - n).padStart(6, '0')}` : undefined,
      qrAvailable: done,
      writeback: done ? 'complete' : 'pending',
      createdAt: ago(n * 410),
      updatedAt: ago(n * 410 - 3),
      durationMs: done ? 1900 + n * 90 : undefined,
      history: hist([
        [
          n * 410,
          done ? 'Fiscalization confirmed' : 'Queued',
          done ? 'Receipt evidence confirmed.' : 'Awaiting worker availability.',
          done ? 'healthy' : 'warning',
        ],
      ]),
    }
  }),
]

export const services: ServiceHealth[] = [
  {
    name: 'Middleware API',
    status: 'healthy',
    detail: 'Ready and accepting requests',
    latency: '42 ms',
    checked: ago(0),
  },
  {
    name: 'Database',
    status: 'healthy',
    detail: 'Dependency check passed',
    latency: '18 ms',
    checked: ago(0),
  },
  {
    name: 'Queue worker',
    status: 'warning',
    detail: 'Worker healthy; 3 items waiting',
    latency: '1.8 s',
    checked: ago(1),
  },
  {
    name: 'Zoho Books',
    status: 'healthy',
    detail: 'Integration credentials available',
    latency: '316 ms',
    checked: ago(2),
  },
  {
    name: 'Tremol G03',
    status: 'warning',
    detail: 'Endpoint reachable; physical readiness unverified',
    latency: '91 ms',
    checked: ago(3),
  },
  {
    name: 'KRA / eTIMS',
    status: 'unknown',
    detail: 'Registration state not exposed by verified API',
    checked: ago(3),
  },
]

export const alerts: Alert[] = [
  {
    id: 'a1',
    level: 'critical',
    title: '1 outcome needs manual review',
    detail: 'CN-2026-0095 has no correlated receipt evidence.',
    at: ago(3),
  },
  {
    id: 'a2',
    level: 'warning',
    title: 'G03 readiness is unverified',
    detail: 'Reachability does not confirm fiscalization readiness.',
    at: ago(12),
  },
  {
    id: 'a3',
    level: 'warning',
    title: 'Zoho writeback pending',
    detail: '1 confirmed transaction still needs its Zoho fields updated.',
    at: ago(27),
  },
]

export const events: EventLog[] = submissions.slice(0, 12).map((s, i) => ({
  id: `evt-${i}`,
  at: s.updatedAt,
  severity:
    s.status === 'failed' || s.status === 'manual_review' || s.writeback === 'failed'
      ? 'error'
      : s.status === 'pending' || s.status === 'outcome_unknown'
        ? 'warning'
        : 'info',
  component:
    s.writeback === 'failed'
      ? 'Writeback'
      : s.status === 'fiscalized'
        ? 'Fiscalization'
        : s.status === 'failed' || s.status === 'manual_review'
          ? 'Recovery'
          : 'Queue',
  event: s.history.at(-1)?.title ?? 'Activity',
  related: s.documentNumber,
  detail: s.history.at(-1)?.detail ?? 'Status updated.',
}))

export const device: DeviceInfo = {
  status: 'warning',
  endpointReachable: true,
  serial: null,
  cuSerial: null,
  version: null,
  endpoint: 'Configured endpoint (masked)',
  lastCommunication: ago(3),
  readiness: 'unknown',
  pairing: 'unknown',
  mode: 'Unreported',
}
