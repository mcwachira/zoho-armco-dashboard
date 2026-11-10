export type Status = 'healthy' | 'warning' | 'error' | 'offline' | 'unknown'
export type SubmissionStatus =
  'fiscalized' | 'pending' | 'processing' | 'failed' | 'manual_review' | 'outcome_unknown'
export type DocType = 'Invoice' | 'Credit note'
export type WritebackStatus = 'complete' | 'pending' | 'failed' | 'not_required'
export type EtimsStatus = 'confirmed' | 'pending' | 'failed' | 'unknown'

export interface Submission {
  id: string
  documentNumber: string
  documentId: string
  customer: string
  amount: number
  currency: string
  type: DocType
  status: SubmissionStatus
  attempts: number
  cuReceiptNumber?: string
  etimsStatus?: EtimsStatus
  etimsReceiptNumber?: string
  qrAvailable: boolean
  writeback: WritebackStatus
  createdAt: string
  updatedAt: string
  durationMs?: number
  error?: string
  writebackError?: string
  reviewReason?: string
  history: { at: string; title: string; detail: string; status: Status }[]
}

export interface ServiceHealth {
  name: string
  status: Status
  detail: string
  latency?: string
  checked: string
}
export interface Alert {
  id: string
  level: 'warning' | 'critical' | 'info'
  title: string
  detail: string
  at: string
}
export interface EventLog {
  id: string
  at: string
  severity: 'info' | 'warning' | 'error'
  component: string
  event: string
  related?: string
  detail: string
}
export interface DeviceInfo {
  status: Status
  endpointReachable: boolean | null
  serial: string | null
  cuSerial: string | null
  version: string | null
  endpoint: string | null
  lastCommunication: string | null
  readiness: Status
  pairing: Status
  mode: string | null
}
