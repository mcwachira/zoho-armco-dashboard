import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth/AuthProvider'
import { apiMode, getWritebackRecovery, retryWritebackRecovery } from '@/lib/api/client'
import { writebackRecoverySchema, type WritebackRecovery } from './writeback-recovery-contracts'

type Kind = 'invoice' | 'credit-note'

function timestamp(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : 'Not reported'
}

function lastError(value: WritebackRecovery['lastError']) {
  if (!value) return 'None reported'
  return typeof value === 'string'
    ? value
    : [value.code, value.category, value.message].filter(Boolean).join(': ')
}

export function WritebackRecovery({ kind, requestId }: { kind: Kind; requestId: string }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const queryKey = ['writeback-recovery', kind, requestId]
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => getWritebackRecovery(kind, requestId, writebackRecoverySchema, signal),
    enabled: apiMode === 'api' && Boolean(requestId),
    retry: false,
    refetchInterval: false,
  })
  const mutation = useMutation({
    mutationFn: () => retryWritebackRecovery(kind, requestId, writebackRecoverySchema),
    retry: false,
    onSuccess: (result) => {
      queryClient.setQueryData(queryKey, result)
      toast.success('Zoho writeback recovery request accepted by the gateway.')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Zoho writeback recovery failed.')
    },
    onSettled: async () => {
      await query.refetch({ cancelRefetch: false })
    },
  })

  const current = query.data
  const inProgress = current?.status === 'in_progress'
  const succeeded = current?.status === 'succeeded'
  const canRetry = ['failed', 'outcome_unknown', 'pending'].includes(current?.status ?? '')
  const authorized = user?.role === 'admin' || user?.role === 'operator'
  const errorText = query.error instanceof Error ? query.error.message : null
  const configurationRequired =
    /config|unconfigured/i.test(current?.errorCategory ?? '') ||
    [query.error, mutation.error].some((error) =>
      /config|unconfigured/i.test(
        `${error instanceof Error ? error.message : ''} ${
          error && typeof error === 'object' && 'code' in error ? error.code : ''
        }`,
      ),
    )

  return (
    <section className="writeback-recovery" aria-label={`${kind} Zoho writeback recovery`}>
      <div className="writeback-recovery-heading">
        <strong>Request-specific writeback status</strong>
        <button
          className="button button-ghost button-compact"
          type="button"
          disabled={apiMode !== 'api' || query.isFetching || mutation.isPending}
          onClick={() => void query.refetch()}
          aria-label="Refresh writeback status"
        >
          <RefreshCw size={13} /> Refresh
        </button>
      </div>
      {apiMode !== 'api' && <p role="status">Live writeback status is unavailable in demo mode.</p>}
      {query.isLoading && <p role="status">Loading request-specific writeback status…</p>}
      {errorText && (
        <p role="alert">
          {errorText}
          {current && ' The last validated status remains displayed.'}
        </p>
      )}
      {configurationRequired && (
        <p role="status">
          Correct the dashboard or gateway configuration before expecting another successful
          writeback attempt.
        </p>
      )}
      {current && (
        <>
          <dl className="writeback-recovery-fields">
            <div>
              <dt>Status</dt>
              <dd>
                <span
                  className={`badge ${succeeded ? 'success' : inProgress ? 'warning' : 'neutral'}`}
                >
                  {current.status.replaceAll('_', ' ')}
                </span>
              </dd>
            </div>
            <div>
              <dt>Fiscalization request</dt>
              <dd>{current.requestId}</dd>
            </div>
            <div>
              <dt>Retry count</dt>
              <dd>{current.retryCount ?? 'Not reported'}</dd>
            </div>
            <div>
              <dt>Last attempt</dt>
              <dd>{timestamp(current.lastAttemptAt)}</dd>
            </div>
            <div>
              <dt>Next retry</dt>
              <dd>{timestamp(current.nextRetryAt)}</dd>
            </div>
            <div>
              <dt>Last error</dt>
              <dd>{lastError(current.lastError)}</dd>
            </div>
            <div>
              <dt>Error category</dt>
              <dd>{current.errorCategory ?? 'Not reported'}</dd>
            </div>
            <div>
              <dt>Manual attention</dt>
              <dd>
                {(current.manualInterventionRequired ?? current.manualAttentionRequired)
                  ? 'Required'
                  : 'Not reported'}
              </dd>
            </div>
            <div>
              <dt>Correlation ID</dt>
              <dd>{current.correlationId ?? 'Not reported'}</dd>
            </div>
            <div>
              <dt>Fields written</dt>
              <dd>
                {(
                  current.fieldsWritten ??
                  current.updatedFields ??
                  current.writtenCustomFieldIds ??
                  []
                ).join(', ') || 'Not reported'}
              </dd>
            </div>
            <div>
              <dt>Fields remaining</dt>
              <dd>{current.remainingFields?.join(', ') || 'Not reported'}</dd>
            </div>
          </dl>
          {inProgress && <p role="status">A writeback operation is already in progress.</p>}
          {succeeded && <p role="status">Zoho writeback has succeeded.</p>}
          {mutation.isError && (
            <p role="alert">
              {mutation.error instanceof Error
                ? mutation.error.message
                : 'The gateway did not confirm this recovery request.'}
            </p>
          )}
        </>
      )}
      {!query.isLoading && !current && !errorText && (
        <p role="status">No request-specific writeback status was returned.</p>
      )}
      {authorized && canRetry && !inProgress && !succeeded && (
        <button
          className="button secondary"
          type="button"
          disabled={mutation.isPending || query.isFetching}
          onClick={() => setConfirming(true)}
        >
          {mutation.isPending ? 'Requesting recovery…' : 'Retry Zoho Writeback'}
        </button>
      )}
      {confirming && (
        <div className="g03-dialog-backdrop">
          <section
            className="panel g03-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={`writeback-retry-title-${requestId}`}
            aria-describedby={`writeback-retry-description-${requestId}`}
          >
            <h3 id={`writeback-retry-title-${requestId}`}>Retry Zoho writeback?</h3>
            <p id={`writeback-retry-description-${requestId}`}>
              This calls only the {kind === 'invoice' ? 'invoice' : 'credit-note'} writeback
              recovery route for request {requestId}. Middleware will reuse its existing
              fiscalization evidence. No new fiscalization submission or G03 receipt will be issued.
            </p>
            <div className="document-page-buttons">
              <button
                className="button secondary"
                type="button"
                disabled={mutation.isPending}
                onClick={() => setConfirming(false)}
              >
                Cancel
              </button>
              <button
                className="button primary"
                type="button"
                disabled={mutation.isPending}
                onClick={() => {
                  setConfirming(false)
                  mutation.mutate()
                }}
              >
                {mutation.isPending ? 'Requesting…' : 'Confirm retry'}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}
