import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { AlertTriangle, RefreshCw, ShieldAlert } from 'lucide-react'
import { useAuth } from '@/lib/auth/AuthProvider'
import { apiMode, cancelCurrentReceipt, getCurrentReceiptState } from '@/lib/api/client'
import {
  cancellationDescription,
  cancellationVerified,
  cancelReceiptSchema,
  g03ReceiptIntegration,
  receiptStateLabel,
  receiptStateSchema,
  type CancelReceiptResult,
} from './device-contracts'
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
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelResult, setCancelResult] = useState<CancelReceiptResult | null>(null)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const cancelGuard = useRef(false)
  const dialogWasOpen = useRef(false)
  const cancelTrigger = useRef<HTMLButtonElement>(null)
  const confirmButton = useRef<HTMLButtonElement>(null)
  const query = useReceiptState(!confirming && !cancelling)
  const state = g03ReceiptIntegration.monitoringAvailable && !query.isError ? query.data : undefined
  const receiptLabel = receiptStateLabel(state)
  const isAdministrator = user?.role === 'admin'
  const canCancel =
    g03ReceiptIntegration.cancellationAvailable &&
    isAdministrator &&
    receiptLabel === 'OPEN' &&
    !query.isFetching &&
    !cancelling

  useEffect(() => {
    if (confirming) {
      dialogWasOpen.current = true
      confirmButton.current?.focus()
    } else if (dialogWasOpen.current && !cancelling) {
      dialogWasOpen.current = false
      cancelTrigger.current?.focus()
    }
  }, [confirming, cancelling])

  async function confirmCancellation() {
    if (cancelGuard.current || !canCancel || !confirming) return
    cancelGuard.current = true
    setCancelling(true)
    setCancelError(null)
    setCancelResult(null)
    try {
      const result = await cancelCurrentReceipt(cancelReceiptSchema)
      setCancelResult(result)
    } catch (error) {
      setCancelError(
        error instanceof Error
          ? error.message
          : 'The cancellation outcome is uncertain. Refresh the physical receipt state.',
      )
    } finally {
      // A timeout or rejection is not proof that the device stayed open.
      await queryClient.refetchQueries({ queryKey: ['g03-receipt-state'], exact: true })
      setCancelling(false)
      setConfirming(false)
      cancelGuard.current = false
    }
  }

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
          disabled={!g03ReceiptIntegration.monitoringAvailable || query.isFetching || cancelling}
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
          Cancellation is available only to administrators when the latest verified receipt state is
          OPEN. UNKNOWN and CLOSED never enable the action.
        </p>
        {apiMode === 'api' &&
          isAdministrator &&
          g03ReceiptIntegration.cancellationAvailable &&
          receiptLabel === 'OPEN' && (
            <button
              ref={cancelTrigger}
              className="button danger"
              type="button"
              disabled={!canCancel}
              onClick={() => {
                setCancelError(null)
                setCancelResult(null)
                setConfirming(true)
              }}
            >
              <ShieldAlert size={15} /> Cancel Open Receipt
            </button>
          )}
        {cancelling && <p role="status">Requesting cancellation and verifying receipt state…</p>}
        {cancelError && (
          <div className="api-source-note g03-warning" role="alert">
            <AlertTriangle size={16} />
            <p>{cancelError} The receipt state was refreshed after the request.</p>
          </div>
        )}
        {cancelResult && <CancellationOutcome result={cancelResult} />}
      </section>
      {confirming && (
        <div className="g03-dialog-backdrop">
          <section
            className="panel g03-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="g03-cancel-title"
            aria-describedby="g03-cancel-description"
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !cancelling) setConfirming(false)
            }}
          >
            <h2 id="g03-cancel-title">Cancel the open physical receipt?</h2>
            <p id="g03-cancel-description">
              The middleware will read the current device state, send one cancellation command only
              if it is still OPEN, then independently read the state again. The dashboard reports
              success only after the command is acknowledged and CLOSED is verified. This does not
              submit or fiscalize an invoice.
            </p>
            <div className="document-page-buttons">
              <button
                className="button secondary"
                type="button"
                disabled={cancelling}
                onClick={() => setConfirming(false)}
              >
                Keep receipt open
              </button>
              <button
                ref={confirmButton}
                className="button danger"
                type="button"
                disabled={!canCancel || cancelling}
                onClick={() => void confirmCancellation()}
              >
                {cancelling ? 'Cancelling…' : 'Confirm cancellation'}
              </button>
            </div>
          </section>
        </div>
      )}
      <ApiDevice embedded />
    </>
  )
}

function CancellationOutcome({ result }: { result: CancelReceiptResult }) {
  const verified = cancellationVerified(result)
  const alreadyClosed = result.status === 'no_open_receipt'
  const role = verified || alreadyClosed ? 'status' : 'alert'
  return (
    <section className="api-source-note g03-cancellation-result" role={role}>
      <strong>
        {verified
          ? 'Cancellation verified'
          : alreadyClosed
            ? 'Receipt was already closed'
            : result.status === 'cancellation_outcome_unknown'
              ? 'Cancellation outcome uncertain'
              : 'Cancellation unsuccessful'}
      </strong>
      <p>{cancellationDescription(result)}</p>
      <dl className="document-fields g03-fields">
        <div>
          <dt>Initial physical state</dt>
          <dd>{receiptStateLabel(result.initialReceipt)}</dd>
        </div>
        <div>
          <dt>Cancellation command</dt>
          <dd>{result.cancellationCommand?.status ?? 'Not sent'}</dd>
        </div>
        <div>
          <dt>Command result code</dt>
          <dd>{result.cancellationCommand?.resultCode ?? 'Unavailable'}</dd>
        </div>
        <div>
          <dt>Independent verification</dt>
          <dd>{result.verification ? receiptStateLabel(result.verification) : 'Unavailable'}</dd>
        </div>
        <div>
          <dt>Requested at</dt>
          <dd>{documentDate(result.requestedAt, true)}</dd>
        </div>
        {result.initialReceipt.error && (
          <div>
            <dt>Initial receipt read error</dt>
            <dd>
              {result.initialReceipt.error.code}: {result.initialReceipt.error.message}
            </dd>
          </div>
        )}
        {result.cancellationCommand?.error && (
          <div>
            <dt>Command error</dt>
            <dd>
              {result.cancellationCommand.error.code}: {result.cancellationCommand.error.message}
            </dd>
          </div>
        )}
        {result.verification?.error && (
          <div>
            <dt>Verification error</dt>
            <dd>
              {result.verification.error.code}: {result.verification.error.message}
            </dd>
          </div>
        )}
      </dl>
    </section>
  )
}
