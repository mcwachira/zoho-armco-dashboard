import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { apiMode, cancelOpenReceipt, getCurrentReceiptState } from '@/lib/api/client'
import { useAuth } from '@/lib/auth/AuthProvider'
import {
  cancelReceiptSchema,
  cancellationVerified,
  cancellationDescription,
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
  const canCancel = user?.role === 'admin'
  const [confirm, setConfirm] = useState(false)
  const [running, setRunning] = useState(false)
  const runningRef = useRef(false)
  const dialogRef = useRef<HTMLElement>(null)
  const [result, setResult] = useState<CancelReceiptResult | null>(null)
  const [operationError, setOperationError] = useState('')
  const query = useReceiptState(!running)
  const client = useQueryClient()
  const state = g03ReceiptIntegration.monitoringAvailable && !query.isError ? query.data : undefined
  const receiptLabel = receiptStateLabel(state)

  useEffect(() => {
    if (!confirm) return
    const previous = document.activeElement
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setConfirm(false)
      if (event.key === 'Tab') {
        const buttons = dialogRef.current?.querySelectorAll('button')
        if (!buttons?.length) return
        const first = buttons[0]
        const last = buttons[buttons.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (previous instanceof HTMLElement) previous.focus()
    }
  }, [confirm])

  async function cancel() {
    if (
      runningRef.current ||
      !confirm ||
      !canCancel ||
      !g03ReceiptIntegration.cancellationAvailable ||
      query.isFetching ||
      receiptStateLabel(state) !== 'OPEN'
    )
      return
    runningRef.current = true
    setRunning(true)
    setConfirm(false)
    setResult(null)
    setOperationError('')
    try {
      await client.cancelQueries({ queryKey: ['g03-receipt-state'] })
      const response = await cancelOpenReceipt(cancelReceiptSchema)
      setResult(response)
      if (cancellationVerified(response)) toast.success(cancellationDescription(response))
      else if (response.status === 'no_open_receipt') toast.info(cancellationDescription(response))
      else toast.error(cancellationDescription(response))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Cancellation could not be verified.'
      setOperationError(message)
      toast.error(message)
    } finally {
      try {
        await query.refetch({ cancelRefetch: false })
      } finally {
        runningRef.current = false
        setRunning(false)
      }
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
          disabled={!g03ReceiptIntegration.monitoringAvailable || query.isFetching || running}
          onClick={() => void query.refetch({ cancelRefetch: false })}
        >
          <RefreshCw size={14} /> Refresh state
        </button>
      </div>
      <section
        className="panel api-panel"
        aria-label="G03 current receipt state"
        aria-busy={query.isFetching || running}
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
        {canCancel && (
          <button
            className="button secondary"
            disabled={
              !g03ReceiptIntegration.cancellationAvailable ||
              receiptLabel !== 'OPEN' ||
              running ||
              query.isFetching
            }
            onClick={() => setConfirm(true)}
          >
            {running ? 'Cancelling and verifying…' : 'Cancel Open Receipt'}
          </button>
        )}
        {canCancel && receiptLabel !== 'OPEN' && (
          <p className="api-note">
            Cancellation requires a confirmed OPEN receipt. Current state: {receiptLabel}.
          </p>
        )}
        {!canCancel && <p className="api-note">Cancellation requires an administrator account.</p>}
        {!g03ReceiptIntegration.cancellationAvailable && (
          <p className="api-note">
            Cancellation needs the verified administrator-authorized middleware route and
            independent CLOSED verification. No device command is sent while this integration is
            unavailable.
          </p>
        )}
      </section>
      <ApiDevice embedded />
      {operationError && (
        <div className="api-availability" role="alert">
          <strong>Cancellation unsuccessful or unverified</strong>
          <p>{operationError}</p>
          <p>Read the device state before taking further action.</p>
        </div>
      )}
      {result && (
        <section
          className="panel api-panel"
          role={
            cancellationVerified(result) || result.status === 'no_open_receipt' ? 'status' : 'alert'
          }
          aria-label="Cancellation result"
        >
          <h2>
            {cancellationVerified(result)
              ? 'Cancellation verified'
              : result.status === 'no_open_receipt'
                ? 'Receipt already closed'
                : 'Cancellation unsuccessful or unverified'}
          </h2>
          <p>
            {result.status}: {cancellationDescription(result)}
          </p>
          <p>Requested: {documentDate(result.requestedAt, true)}</p>
          <p>Initial receipt: {receiptStateLabel(result.initialReceipt)}</p>
          <p>
            Verification:{' '}
            {result.verification ? receiptStateLabel(result.verification) : 'Not available'}
          </p>
          <p>
            {cancellationVerified(result)
              ? 'Device independently confirmed CLOSED.'
              : result.status === 'no_open_receipt'
                ? 'No cancellation command was needed.'
                : 'Successful cancellation is not confirmed.'}
          </p>
          {result.initialReceipt.error && (
            <p>
              Initial read error: {result.initialReceipt.error.code}:{' '}
              {result.initialReceipt.error.message}
            </p>
          )}
          <h3>Cancellation command</h3>
          {result.cancellationCommand ? (
            <dl className="document-fields">
              <div>
                <dt>Command status</dt>
                <dd>{result.cancellationCommand.status}</dd>
              </div>
              <div>
                <dt>Command HTTP status</dt>
                <dd>{result.cancellationCommand.httpStatus ?? 'Unavailable'}</dd>
              </div>
              <div>
                <dt>Command result code</dt>
                <dd>{result.cancellationCommand.resultCode ?? 'Unavailable'}</dd>
              </div>
              <div>
                <dt>STE1</dt>
                <dd>{result.cancellationCommand.ste1 ?? 'Unavailable'}</dd>
              </div>
              <div>
                <dt>STE2</dt>
                <dd>{result.cancellationCommand.ste2 ?? 'Unavailable'}</dd>
              </div>
              <div>
                <dt>FP library error</dt>
                <dd>{result.cancellationCommand.fpLibErrorCode ?? 'Unavailable'}</dd>
              </div>
            </dl>
          ) : (
            <p>No cancellation command result was reported.</p>
          )}
          {result.cancellationCommand?.error && (
            <p>
              Command error: {result.cancellationCommand.error.code}:{' '}
              {result.cancellationCommand.error.message}
            </p>
          )}
          {result.verification && (
            <p>
              Verification device: {result.verification.device.connectivity}; HTTP{' '}
              {result.verification.device.httpStatus ?? 'unavailable'}; result code{' '}
              {result.verification.device.resultCode ?? 'unavailable'}.
            </p>
          )}
          {result.verification?.error && (
            <p>
              Verification error: {result.verification.error.code}:{' '}
              {result.verification.error.message}
            </p>
          )}
          <details>
            <summary>Middleware response details</summary>
            <pre className="document-evidence">{JSON.stringify(result, null, 2)}</pre>
          </details>
        </section>
      )}
      {confirm && canCancel && (
        <div className="g03-dialog-backdrop">
          <section
            ref={dialogRef}
            className="panel g03-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="cancel-title"
            aria-describedby="cancel-description"
          >
            <h2 id="cancel-title">Cancel the open fiscal receipt?</h2>
            <p id="cancel-description">
              This affects the currently open fiscal receipt on the physical G03 device. It may
              belong to an active transaction. The middleware will check before cancellation and
              read the device again to verify the result.
            </p>
            <div className="document-page-buttons">
              <button autoFocus className="button secondary" onClick={() => setConfirm(false)}>
                Keep receipt
              </button>
              <button
                className="button primary"
                disabled={
                  running ||
                  query.isFetching ||
                  receiptLabel !== 'OPEN' ||
                  !g03ReceiptIntegration.cancellationAvailable
                }
                onClick={() => void cancel()}
              >
                Confirm cancellation
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  )
}
