import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { apiMode, getCurrentReceiptState } from '@/lib/api/client'
import { g03ReceiptIntegration, receiptStateLabel, receiptStateSchema } from './device-contracts'
import { documentDate } from './document-provisional'
import { ApiDevice } from './ApiOperationalPages'
import './documents.css'

function useReceiptState(polling = true) {
  return useQuery({
    queryKey: ['g03-receipt-state'],
    queryFn: ({ signal }) => getCurrentReceiptState(receiptStateSchema, signal),
    enabled: g03ReceiptIntegration.monitoringAvailable && apiMode === 'api',
    refetchInterval: g03ReceiptIntegration.monitoringAvailable && polling ? 15_000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
    staleTime: 0,
  })
}

export function G03PreflightWarning() {
  const query = useReceiptState()
  const state = g03ReceiptIntegration.monitoringAvailable && !query.isError ? query.data : undefined
  const label = receiptStateLabel(state)
  const diagnostic =
    query.error instanceof Error
      ? query.error.message
      : state?.error
        ? state.error.code + ': ' + state.error.message
        : 'Current receipt data is unavailable.'
  return (
    <div
      className={'api-source-note' + (label !== 'CLOSED' ? ' g03-warning' : '')}
      role={label === 'CLOSED' ? 'status' : 'alert'}
    >
      <AlertTriangle size={17} />
      <p>
        {!g03ReceiptIntegration.monitoringAvailable
          ? 'G03 receipt state UNKNOWN. ' +
            g03ReceiptIntegration.reason +
            ' Readiness cannot be confirmed.'
          : label === 'OPEN'
            ? 'G03 has an open fiscal receipt. Sales number: ' +
              (state?.salesNumber ?? 'Unavailable') +
              '. An operator should investigate.'
            : query.isFetching
              ? 'Checking current G03 receipt state…'
              : label === 'UNKNOWN'
                ? 'G03 receipt state UNKNOWN. ' + diagnostic + ' Readiness cannot be confirmed.'
                : 'G03 receipt is CLOSED at the last check; receipt state alone does not confirm full device readiness.'}{' '}
        <Link to="/device">View G03 Device</Link>. This check is diagnostic and does not change
        submission eligibility. Request progress, unknown fiscalization outcomes and Zoho writeback
        failures are separate from the current physical receipt state.
      </p>
    </div>
  )
}

export function G03Device() {
  const query = useReceiptState()
  const state = g03ReceiptIntegration.monitoringAvailable && !query.isError ? query.data : undefined
  const receiptLabel = receiptStateLabel(state)

  return (
    <>
      <div className="page-heading api-page-heading">
        <div>
          <span className="eyebrow">PHYSICAL FISCAL DEVICE</span>
          <h1>G03 Device</h1>
          <p>Receipt-state availability and passive middleware diagnostics.</p>
        </div>
        <button
          className="button secondary"
          disabled={!g03ReceiptIntegration.monitoringAvailable || query.isFetching}
          onClick={() => void query.refetch({ cancelRefetch: false })}
        >
          <RefreshCw size={14} /> Refresh state
        </button>
      </div>
      <section
        className="panel api-panel"
        aria-label="G03 current receipt state"
        aria-busy={query.isFetching}
      >
        <div
          className={`g03-state ${receiptLabel !== 'CLOSED' ? 'g03-warning' : ''}`}
          role={receiptLabel === 'CLOSED' ? 'status' : 'alert'}
        >
          <span className={`badge ${receiptLabel === 'CLOSED' ? 'success' : 'warning'}`}>
            {query.isPending && query.isFetching
              ? 'Checking connectivity…'
              : (state?.device.connectivity ?? 'Unavailable')}
          </span>
          <h2>Receipt state: {receiptLabel}</h2>
          {!g03ReceiptIntegration.monitoringAvailable && (
            <p>
              {g03ReceiptIntegration.reason} Device connectivity and receipt state cannot be
              confirmed from passive communication evidence.
            </p>
          )}
          {query.isFetching && <p>Reading current device state…</p>}
          {query.isError && (
            <p>
              {query.error instanceof Error
                ? query.error.message
                : 'The middleware could not be reached.'}
            </p>
          )}
          {state?.error && (
            <p>
              {state.error.code}: {state.error.message}
            </p>
          )}
          {apiMode !== 'api' && (
            <p>
              Live device monitoring requires the authenticated dashboard connection. Device
              readings are not simulated.
            </p>
          )}
        </div>
        <dl className="document-fields g03-fields">
          <div>
            <dt>Sales number</dt>
            <dd className="document-mono">{state?.salesNumber ?? 'Unavailable'}</dd>
          </div>
          <div>
            <dt>Last checked (Nairobi)</dt>
            <dd>{state ? documentDate(state.checkedAt, true) : 'Unavailable'}</dd>
          </div>
          <div>
            <dt>Device connectivity</dt>
            <dd>{state?.device.connectivity ?? 'Unavailable'}</dd>
          </div>
          <div>
            <dt>Device HTTP status</dt>
            <dd>{state?.device.httpStatus ?? 'Unavailable'}</dd>
          </div>
          <div>
            <dt>Device result code</dt>
            <dd>{state?.device.resultCode ?? 'Unavailable'}</dd>
          </div>
          {(['A', 'B', 'C', 'D', 'E'] as const).map((vat) => (
            <div key={vat}>
              <dt>VAT {vat} subtotal</dt>
              <dd>{state?.vatSubtotals?.[vat] ?? 'Unavailable'}</dd>
            </div>
          ))}
        </dl>
        <p className="api-note">
          {g03ReceiptIntegration.monitoringAvailable
            ? 'Refreshes every 15 seconds while this page is open.'
            : 'Live receipt refresh is unavailable until the middleware integration is verified.'}{' '}
          Unavailable readings never mean the receipt is closed.
        </p>
        <p className="api-note">
          G03 receipt cancellation is unavailable pending a separate authorization security review.
          This dashboard does not send cancellation commands.
        </p>
      </section>
      <ApiDevice embedded />
    </>
  )
}
