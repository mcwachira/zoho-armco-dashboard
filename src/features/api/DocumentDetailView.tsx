import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import type { DocumentDetail, DocumentKind } from './document-contracts'
import {
  documentAmount,
  documentDate,
  documentNumber,
  zohoId,
  type ProvisionalDocument,
} from './document-provisional'
import { ReceiptReconciliation } from './ReceiptReconciliation'
import { resolveReceiptReconciliation, safeVerificationUrl } from './reconciliation-contracts'
import type { WritebackOperation } from './operation-contracts'

export function DocumentStatus({
  value,
  source,
}: {
  value: string | null | undefined
  source: 'zoho' | 'fiscal' | 'writeback'
}) {
  // Preserve source status verbatim. No provisional status is assigned success,
  // failure or device-execution semantics; the color identifies its source.
  return value ? (
    <span className={`badge document-status-${source}`}>{value}</span>
  ) : (
    <span className="document-unavailable">Unavailable</span>
  )
}

/** Reuse the source relationship in registers and detail; reference text is not an ID. */
export function RelatedInvoice({ document }: { document: ProvisionalDocument }) {
  const references = document.invoices?.filter(
    (invoice) => zohoId(invoice, 'invoice') || invoice.invoice_number,
  )
  const invoices = references?.length ? references : [document]
  return (
    <>
      {invoices.map((invoice, index) => {
        const id = zohoId(invoice, 'invoice')
        const appliedAmount = 'amount' in invoice ? invoice.amount : undefined
        return (
          <div key={index}>
            {id ? (
              <Link className="document-number" to={`/invoices?${new URLSearchParams({ id })}`}>
                {invoice.invoice_number || id}
              </Link>
            ) : (
              invoice.invoice_number || '—'
            )}
            {appliedAmount != null && (
              <small className="document-line-description">
                Applied amount: {documentAmount(appliedAmount)}
              </small>
            )}
          </div>
        )
      })}
    </>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {children === null || children === undefined || children === '' ? (
          <span className="document-unavailable" title="Unavailable" aria-label="Unavailable">
            —
          </span>
        ) : (
          children
        )}
      </dd>
    </div>
  )
}

export function DocumentDetailView({
  data,
  kind,
  writebackOperation,
}: {
  data: DocumentDetail
  kind: DocumentKind
  writebackOperation?: WritebackOperation
}) {
  const doc = data.document
  const fiscal = data.fiscalizationRequest
  const address = doc.billing_address
  const verificationUrl = safeVerificationUrl(fiscal?.kraQrUrl)
  return (
    <article className="document-detail">
      <header className="document-detail-header">
        <div>
          <span className="eyebrow">{kind === 'invoice' ? 'INVOICE' : 'CREDIT NOTE'}</span>
          <h2>{documentNumber(doc, kind) || data.zohoDocumentId}</h2>
          <p>{doc.customer_name || 'Customer unavailable'}</p>
        </div>
        <div className="document-status-pair">
          <span>
            Zoho status <DocumentStatus value={doc.status} source="zoho" />
          </span>
          <span>
            Fiscalization{' '}
            {fiscal === null ? (
              <span className="badge neutral">Not processed</span>
            ) : (
              <DocumentStatus value={fiscal.status} source="fiscal" />
            )}
          </span>
        </div>
      </header>
      <section className="document-section" aria-label="Document information">
        <h3>Document information</h3>
        <dl className="document-fields">
          <Field label="Document type">{data.documentType}</Field>
          <Field label="Zoho document ID">{data.zohoDocumentId}</Field>
          <Field label="Document number">{documentNumber(doc, kind)}</Field>
          <Field label="Customer">{doc.customer_name}</Field>
          <Field label="Customer ID">{doc.customer_id}</Field>
          <Field label="Document date">{documentDate(doc.date)}</Field>
          {kind === 'invoice' && <Field label="Due date">{documentDate(doc.due_date)}</Field>}
          <Field label="Currency">{doc.currency_code}</Field>
          {kind === 'invoice' && (
            <>
              <Field label="Payment terms">{doc.payment_terms_label}</Field>
              <Field label="Payment terms (days)">
                {doc.payment_terms == null ? null : documentAmount(doc.payment_terms)}
              </Field>
            </>
          )}
          <Field label="Source discount">{doc.discount}</Field>
          <Field label="Discount type">{doc.discount_type}</Field>
          <Field label="Discount before tax">
            {doc.is_discount_before_tax == null ? null : doc.is_discount_before_tax ? 'Yes' : 'No'}
          </Field>
          <Field label="Tax inclusive">
            {doc.is_inclusive_tax == null ? null : doc.is_inclusive_tax ? 'Yes' : 'No'}
          </Field>
          <Field label="Reference">{doc.reference_number}</Field>
          <Field label="Created (Nairobi)">{documentDate(doc.created_time, true)}</Field>
          <Field label="Modified (Nairobi)">
            {documentDate(
              doc.last_modified_time ?? (kind === 'credit_note' ? doc.updated_time : undefined),
              true,
            )}
          </Field>
          {kind === 'credit_note' && (
            <Field label="Related invoice">
              <RelatedInvoice document={doc} />
            </Field>
          )}
          {address && (
            <Field label="Billing address">
              {[
                address.attention,
                address.address,
                address.street2,
                address.city,
                address.state,
                address.zip,
                address.country,
              ]
                .filter(Boolean)
                .join(', ')}
            </Field>
          )}
        </dl>
      </section>
      <section className="document-section document-lines" aria-label="Line items">
        <h3>Original Zoho line items</h3>
        <p className="api-note">
          Original values supplied by Zoho Books. Persisted snapshots and G03 command values appear
          separately below.
        </p>
        {doc.line_items?.length ? (
          <div
            className="document-table-scroll"
            tabIndex={0}
            role="region"
            aria-label="Line items table"
          >
            <table className="document-table">
              <thead>
                <tr>
                  <th scope="col">Item / description</th>
                  <th scope="col">Item ID / SKU</th>
                  <th scope="col">Unit</th>
                  <th scope="col" className="document-numeric">
                    Quantity
                  </th>
                  <th scope="col" className="document-numeric">
                    Unit price
                  </th>
                  <th scope="col" className="document-numeric">
                    Discount
                  </th>
                  <th scope="col">Tax</th>
                  <th scope="col" className="document-numeric">
                    Tax amount
                  </th>
                  <th scope="col" className="document-numeric">
                    Line total
                  </th>
                  <th scope="col">HS code / name (Zoho)</th>
                  <th scope="col">Line subtotal</th>
                </tr>
              </thead>
              <tbody>
                {doc.line_items.map((line, index) => (
                  <tr key={index}>
                    <td>
                      <strong>{line.name || '—'}</strong>
                      {line.description && (
                        <small className="document-line-description">{line.description}</small>
                      )}
                    </td>
                    <td>
                      {line.item_id || 'Unavailable'}
                      <small className="document-line-description">
                        {line.sku || 'Unavailable'}
                      </small>
                    </td>
                    <td>{line.unit || 'Unavailable'}</td>
                    <td className="document-numeric">{documentAmount(line.quantity)}</td>
                    <td className="document-numeric">{documentAmount(line.rate)}</td>
                    <td className="document-numeric">
                      {documentAmount(line.discount_amount)}
                      {line.discount != null && (
                        <small className="document-line-description">
                          Source discount: {line.discount}
                        </small>
                      )}
                    </td>
                    <td>
                      {line.tax_name || '—'}
                      {line.tax_percentage != null && (
                        <small className="document-line-description">{line.tax_percentage}%</small>
                      )}
                      {line.tax_id != null && (
                        <small className="document-line-description">Tax ID: {line.tax_id}</small>
                      )}
                    </td>
                    <td className="document-numeric">{documentAmount(line.tax_amount)}</td>
                    <td className="document-numeric">{documentAmount(line.item_total)}</td>
                    <td>
                      {line.hs_code || 'Unavailable'}
                      <small className="document-line-description">
                        {line.hs_name || 'Unavailable'}
                      </small>
                    </td>
                    <td>{documentAmount(line.line_subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="document-muted">Line items unavailable from the source response.</p>
        )}
      </section>
      <section className="document-section document-financials" aria-label="Document totals">
        <div>
          <h3>Notes and terms</h3>
          <p className="document-notes">{doc.notes || 'Notes unavailable.'}</p>
          {doc.terms && <p className="document-notes">{doc.terms}</p>}
          {!!doc.taxes?.length && (
            <>
              <h3>Taxes supplied by source</h3>
              <dl className="document-tax-list">
                {doc.taxes.map((tax, index) => (
                  <Field
                    key={index}
                    label={`${tax.tax_name || 'Tax'}${tax.tax_percentage != null ? ` (${tax.tax_percentage}%)` : ''}`}
                  >
                    {documentAmount(tax.tax_amount)}
                    {tax.tax_id != null && (
                      <small className="document-line-description">Tax ID: {tax.tax_id}</small>
                    )}
                  </Field>
                ))}
              </dl>
            </>
          )}
        </div>
        <dl className="document-totals">
          <Field label="Subtotal">{documentAmount(doc.sub_total)}</Field>
          <Field label="Discount">{documentAmount(doc.discount_total)}</Field>
          <Field label="Tax">{documentAmount(doc.tax_total)}</Field>
          <Field label="Adjustment">{documentAmount(doc.adjustment)}</Field>
          <Field label={`Total${doc.currency_code ? ` (${doc.currency_code})` : ''}`}>
            {documentAmount(doc.total)}
          </Field>
          <Field label={kind === 'invoice' ? 'Balance due' : 'Remaining credit balance'}>
            {documentAmount(doc.balance)}
          </Field>
          {kind === 'invoice' && (
            <>
              <Field label="Payments received">{documentAmount(doc.payment_made)}</Field>
              <Field label="Credits applied">{documentAmount(doc.credits_applied)}</Field>
            </>
          )}
        </dl>
      </section>
      <ReceiptReconciliation value={resolveReceiptReconciliation(data)} />
      {writebackOperation && (
        <section className="document-section" aria-label="Related writeback operation">
          <h3>Related Zoho writeback operation</h3>
          <p className="api-note">
            Writeback status is independent of fiscalization status. This is the persisted operation
            associated with the selected Zoho document.
          </p>
          <dl className="document-fields">
            <Field label="Writeback status">
              <DocumentStatus value={writebackOperation.status} source="writeback" />
            </Field>
            <Field label="Writeback operation ID">{writebackOperation.writebackId}</Field>
            <Field label="Fiscalization request ID">{writebackOperation.requestId}</Field>
            <Field label="Error category">{writebackOperation.errorCategory}</Field>
            <Field label="Last error">{writebackOperation.errorDetails}</Field>
            <Field label="Retry count">{writebackOperation.retryCount}</Field>
            <Field label="Provider exchanges">{writebackOperation.providerExchangeCount}</Field>
            <Field label="Next retry (local time)">
              {writebackOperation.nextRetryAt
                ? documentDate(writebackOperation.nextRetryAt, true)
                : 'Not scheduled'}
            </Field>
            <Field label="Completed (local time)">
              {writebackOperation.completedAt
                ? documentDate(writebackOperation.completedAt, true)
                : 'Not completed'}
            </Field>
            <Field label="Fields written">
              {writebackOperation.fieldsWritten?.length
                ? writebackOperation.fieldsWritten.join(', ')
                : null}
            </Field>
            <Field label="Fields remaining">
              {writebackOperation.fieldsRemaining?.length
                ? writebackOperation.fieldsRemaining.join(', ')
                : null}
            </Field>
            <Field label="Manual intervention required">
              {writebackOperation.manualInterventionRequired == null
                ? null
                : writebackOperation.manualInterventionRequired
                  ? 'Yes'
                  : 'No'}
            </Field>
            {writebackOperation.metrics && (
              <Field label="Writeback metrics">
                <pre className="document-evidence">
                  {JSON.stringify(writebackOperation.metrics, null, 2)}
                </pre>
              </Field>
            )}
          </dl>
        </section>
      )}
      <section className="document-section" aria-label="Fiscalization summary">
        <h3>Fiscalization summary</h3>
        {fiscal === null ? (
          <p className="document-muted">
            Not processed by this middleware. No fiscalization request is associated with this
            document.
          </p>
        ) : (
          <>
            <dl className="document-fields">
              <Field label="Request ID">
                {fiscal.requestId ? (
                  <Link
                    className="document-number"
                    to={`/requests?${new URLSearchParams({ id: fiscal.requestId, kind })}`}
                  >
                    {fiscal.requestId}
                  </Link>
                ) : null}
              </Field>
              <Field label="Persisted status">
                <DocumentStatus value={fiscal.status} source="fiscal" />
              </Field>
              <Field label="Execution status">{fiscal.executionStatus}</Field>
              <Field label="Device outcome">{fiscal.deviceOutcome}</Field>
              <Field label="KRA transmission status">{fiscal.kraTransmissionStatus}</Field>
              <Field label="Zoho writeback status">{fiscal.writebackStatus}</Field>
              <Field label="Submitted (Nairobi)">{documentDate(fiscal.submittedAt, true)}</Field>
              <Field label="Execution started (Nairobi)">
                {documentDate(fiscal.startedAt, true)}
              </Field>
              <Field label="Execution completed (Nairobi)">
                {documentDate(fiscal.completedAt, true)}
              </Field>
              <Field label="Receipt confirmed">
                {fiscal.receiptConfirmed == null
                  ? 'Unavailable'
                  : fiscal.receiptConfirmed
                    ? 'Yes'
                    : 'No'}
              </Field>
              <Field label="Requires manual review">
                {fiscal.requiresManualReview == null
                  ? 'Unavailable'
                  : fiscal.requiresManualReview
                    ? 'Yes'
                    : 'No'}
              </Field>
              <Field label="CU serial number">{fiscal.cuSerialNumber}</Field>
              <Field label="CU receipt number">{fiscal.cuReceiptNumber}</Field>
              <Field label="Fiscalized at (Nairobi)">
                {documentDate(fiscal.fiscalizedAt, true)}
              </Field>
              <Field label="Device result">{fiscal.deviceResult}</Field>
              <Field label="Error code">{fiscal.errorCode}</Field>
              <Field label="Error details">{fiscal.errorMessage}</Field>
              <Field label="KRA QR verification">
                {verificationUrl ? (
                  <a
                    className="document-number document-qr-link"
                    href={verificationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    referrerPolicy="no-referrer"
                  >
                    Open KRA verification <ExternalLink size={13} />
                  </a>
                ) : (
                  fiscal.kraQrUrl
                )}
              </Field>
            </dl>
            {(fiscal.executionStatus === 'OutcomeUnknown' ||
              fiscal.deviceOutcome === 'OutcomeUnknown' ||
              fiscal.requiresManualReview) && (
              <p className="g03-warning" role="alert">
                This result is unknown or requires manual review. Investigate the execution evidence
                before taking further action.
              </p>
            )}
            <h3 className="document-attempt-heading">Persisted fiscalization snapshot</h3>
            {fiscal.snapshot ? (
              <>
                <p>Captured: {documentDate(fiscal.snapshot.capturedAt, true)}</p>
                <div className="document-table-scroll">
                  <table className="document-table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Item ID</th>
                        <th>Quantity</th>
                        <th>Original unit price</th>
                        <th>G03 tax class</th>
                        <th>HS code</th>
                        <th>HS name</th>
                        <th>Exemption number</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fiscal.snapshot.lineItems?.map((line, index) => (
                        <tr key={index}>
                          <td>
                            {line.name ?? 'Unavailable'}
                            <small className="document-line-description">{line.description}</small>
                          </td>
                          <td>{line.itemId ?? 'Unavailable'}</td>
                          <td>{documentAmount(line.quantity)}</td>
                          <td>{documentAmount(line.unitPrice)}</td>
                          <td>{line.taxClass ?? 'Unavailable'}</td>
                          <td>{line.hsCode ?? 'Unavailable'}</td>
                          <td>{line.hsName === '' ? '(empty)' : (line.hsName ?? 'Unavailable')}</td>
                          <td>
                            {line.exemptionNum === ''
                              ? '(empty)'
                              : (line.exemptionNum ?? 'Unavailable')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="document-muted">Persisted fiscalization snapshot unavailable.</p>
            )}
            <h3 className="document-attempt-heading">Actual G03 command values and responses</h3>
            {fiscal.commandSequence?.length ? (
              fiscal.commandSequence.map((command, index) => (
                <details className="document-command" key={index}>
                  <summary>
                    {index + 1}. {command.command ?? 'Command unavailable'}
                  </summary>
                  <h4>Actual command arguments</h4>
                  <pre className="document-evidence">
                    {command.arguments ? JSON.stringify(command.arguments, null, 2) : 'Unavailable'}
                  </pre>
                  <h4>Actual device response</h4>
                  <pre className="document-evidence">{command.response ?? 'Unavailable'}</pre>
                  <p>
                    {command.errorCode} {command.errorMessage}
                  </p>
                </details>
              ))
            ) : (
              <p className="document-muted">Actual G03 command sequence unavailable.</p>
            )}
            <div className="document-provenance-grid">
              <section>
                <h3>Actual device response values</h3>
                <dl className="document-fields">
                  <Field label="CU serial number">{fiscal.deviceValues?.cuSerialNumber}</Field>
                  <Field label="CU receipt number">{fiscal.deviceValues?.cuReceiptNumber}</Field>
                  <Field label="KRA QR URL">{fiscal.deviceValues?.kraQrUrl}</Field>
                  <Field label="Fiscalized at">{fiscal.deviceValues?.fiscalizedAt}</Field>
                  <Field label="KRA transmission result">
                    {fiscal.deviceValues?.kraTransmissionResult}
                  </Field>
                </dl>
              </section>
              <section>
                <h3>Values written back to Zoho</h3>
                <dl className="document-fields">
                  <Field label="CU serial number">{fiscal.writebackValues?.cuSerialNumber}</Field>
                  <Field label="CU receipt number">{fiscal.writebackValues?.cuReceiptNumber}</Field>
                  <Field label="KRA QR URL">{fiscal.writebackValues?.kraQrUrl}</Field>
                  <Field label="Fiscalized at">{fiscal.writebackValues?.fiscalizedAt}</Field>
                  <Field label="Writeback result">{fiscal.writebackValues?.result}</Field>
                </dl>
              </section>
            </div>
            <h3 className="document-attempt-heading">Attempt history</h3>
            {fiscal.attempts?.length ? (
              <div
                className="document-table-scroll"
                tabIndex={0}
                role="region"
                aria-label="Attempt history table"
              >
                <table className="document-table">
                  <thead>
                    <tr>
                      <th scope="col">Attempt</th>
                      <th scope="col">Status</th>
                      <th scope="col">Started (Nairobi)</th>
                      <th scope="col">Completed (Nairobi)</th>
                      <th scope="col">Device result</th>
                      <th scope="col">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fiscal.attempts.map((attempt, index) => (
                      <tr key={index}>
                        <td>{attempt.attemptNumber ?? '—'}</td>
                        <td>
                          <DocumentStatus value={attempt.status} source="fiscal" />
                        </td>
                        <td>{documentDate(attempt.startedAt, true)}</td>
                        <td>{documentDate(attempt.completedAt, true)}</td>
                        <td>{attempt.deviceResult || '—'}</td>
                        <td>
                          {[attempt.errorCode, attempt.errorMessage].filter(Boolean).join(': ') ||
                            '—'}
                          {attempt.commandSequence?.map((command, commandIndex) => (
                            <details key={commandIndex}>
                              <summary>{command.command ?? 'Command'}</summary>
                              <pre className="document-evidence">
                                {JSON.stringify(command.arguments, null, 2) ??
                                  'Arguments unavailable'}
                              </pre>
                              <pre className="document-evidence">
                                {command.response ?? 'Response unavailable'}
                              </pre>
                              <p>
                                {command.errorCode} {command.errorMessage}
                              </p>
                            </details>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="document-muted">
                Attempt history unavailable from the source response.
              </p>
            )}
          </>
        )}
      </section>
      <footer className="document-detail-footer">
        Read-only source information. Amounts and taxes are displayed as supplied.
      </footer>
    </article>
  )
}
