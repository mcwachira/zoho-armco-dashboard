import type { ReceiptReconciliation } from './reconciliation-contracts'
import { safeVerificationUrl } from './reconciliation-contracts'

export function ReconciliationBadge({ value }: { value?: ReceiptReconciliation | null }) {
  return (
    <span
      className={`badge ${value?.status === 'MATCH' ? 'success' : value?.status === 'MISMATCH' ? 'danger' : 'warning'}`}
      title={value?.reason}
    >
      {value?.status ?? 'NOT_AVAILABLE'}
    </span>
  )
}

export function ReceiptReconciliation({
  value,
  compact = false,
}: {
  value?: ReceiptReconciliation | null
  compact?: boolean
}) {
  const href = safeVerificationUrl(value?.kraUrl)
  return (
    <section
      className={compact ? 'document-reconciliation-evidence' : 'document-section'}
      aria-label="CU/KRA receipt reconciliation"
    >
      {!compact && (
        <>
          <h3>CU/KRA receipt reconciliation</h3>
          <ReconciliationBadge value={value} />
        </>
      )}
      <p>{value?.reason ?? 'Persisted reconciliation source data is not available.'}</p>
      <dl className="document-fields">
        <div>
          <dt>Persisted CU receipt number</dt>
          <dd className="document-mono">{value?.cuReceiptNumber ?? 'Unavailable'}</dd>
        </div>
        <div>
          <dt>Invoice number extracted from KRA URL</dt>
          <dd className="document-mono">{value?.invoiceNo ?? 'Unavailable'}</dd>
        </div>
        <div>
          <dt>KRA verification URL</dt>
          <dd>
            {href ? (
              <a
                className="document-number"
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                referrerPolicy="no-referrer"
              >
                {value?.kraUrl}
              </a>
            ) : (
              (value?.kraUrl ?? 'Unavailable')
            )}
          </dd>
        </div>
      </dl>
    </section>
  )
}
