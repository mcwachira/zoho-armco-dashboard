// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  documentDetailPath,
  documentListPath,
  documentPagination,
  documentQuerySchema,
  documentPageSchema,
  documentDetailSchema,
} from './document-contracts'
import {
  invoiceDocumentFixture,
  creditNoteDocumentFixture,
  fiscalizationFixture,
  documentPageFixture,
  reconciledReceiptFixture,
  detailedFiscalizationFixture,
} from './__fixtures__/document-fixtures'
import { documentAmount, documentDate } from './document-provisional'
import {
  zohoInvoiceDetailSample,
  zohoCreditNoteDetailSample,
} from './__fixtures__/zoho-response-samples'

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('user-provided Zoho source samples inside the existing dashboard envelope', () => {
  it('shows a related persisted writeback separately from the invoice fiscalization summary', async () => {
    const document = zohoInvoiceDetailSample.invoice
    const id = String(document.invoice_id)
    const writebackOperation = {
      writebackId: 'wb-fixture-1',
      documentType: 'INVOICE',
      documentId: id,
      requestId: 'request-fixture-1',
      status: 'failed',
      errorCategory: 'CONFIGURATION_REQUIRED',
      errorDetails: 'A custom field needs configuration.',
      retryCount: 2,
      providerExchangeCount: 3,
      nextRetryAt: null,
      createdAt: '2026-11-14T07:00:00Z',
      updatedAt: '2026-11-14T07:01:00Z',
      completedAt: null,
      fieldsWritten: ['CU Receipt Number'],
      fieldsRemaining: ['KRA QR URL'],
      manualInterventionRequired: true,
    }
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        documentType: 'invoice',
        zohoDocumentId: id,
        document,
        fiscalizationRequest: null,
      }),
    )
    await renderDocuments('invoice', `/invoices?id=${id}`, fetch, false, writebackOperation)
    const section = await screen.findByRole('region', { name: 'Related writeback operation' })
    expect(within(section).getByText('failed')).toBeInTheDocument()
    expect(within(section).getByText('request-fixture-1')).toBeInTheDocument()
    expect(within(section).getByText('A custom field needs configuration.')).toBeInTheDocument()
    expect(within(section).getByText('CU Receipt Number')).toBeInTheDocument()
    expect(within(section).getByText('KRA QR URL')).toBeInTheDocument()
    expect(screen.getByText(/No fiscalization request is associated/)).toBeInTheDocument()
  })

  it('shows the writeback operation for a credit-note detail without changing fiscalization state', async () => {
    const document = zohoCreditNoteDetailSample.creditnote
    const writebackOperation = {
      writebackId: 'wb-credit-note-fixture',
      documentType: 'CREDIT_NOTE',
      documentId: document.creditnote_id,
      requestId: null,
      status: 'retry_scheduled',
      errorCategory: null,
      retryCount: 1,
      providerExchangeCount: 1,
      nextRetryAt: '2026-11-26T07:00:00.000Z',
      createdAt: '2026-11-14T07:00:00Z',
      updatedAt: '2026-11-14T07:01:00Z',
      completedAt: null,
    }
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        documentType: 'credit_note',
        zohoDocumentId: document.creditnote_id,
        document,
        fiscalizationRequest: null,
      }),
    )
    await renderDocuments(
      'credit_note',
      `/credit-notes?id=${document.creditnote_id}`,
      fetch,
      false,
      writebackOperation,
    )
    const section = await screen.findByRole('region', { name: 'Related writeback operation' })
    expect(within(section).getByText('retry_scheduled')).toBeInTheDocument()
    expect(section.querySelector('.document-unavailable')).toBeInTheDocument()
    expect(
      within(section).getByText('Next retry (local time)').nextElementSibling,
    ).toHaveTextContent('26 Nov 2026, 10:00 EAT')
    expect(screen.getByText(/No fiscalization request is associated/)).toBeInTheDocument()
  })

  it('links a numeric invoice ID and shows supplied balances, tax values, discount metadata and compact-offset dates', async () => {
    const document = zohoInvoiceDetailSample.invoice
    const id = String(document.invoice_id)
    const fetch = vi
      .fn()
      .mockImplementation(async (url: string) =>
        Response.json(
          /\/api\/dashboard\/documents\/(?:invoices|credit-notes)\/[^/?]+$/.test(url)
            ? { documentType: 'invoice', zohoDocumentId: id, document, fiscalizationRequest: null }
            : documentPageFixture([{ ...document, fiscalizationRequest: null }]),
        ),
      )
    await renderDocuments('invoice', '/invoices', fetch)
    const link = await screen.findByRole('link', { name: 'INV-00003' })
    expect(link).toHaveAttribute('href', `/invoices?id=${id}`)
    const register = screen.getByRole('region', { name: 'Invoice table' })
    expect(within(register).getByRole('cell', { name: '40.6' })).toBeInTheDocument()
    expect(within(register).getByText('draft')).toBeInTheDocument()
    await userEvent.click(link)
    const info = await screen.findByRole('region', { name: 'Document information' })
    expect(within(info).getByText('Customer ID').nextElementSibling).toHaveTextContent(
      '982000000567001',
    )
    expect(within(info).getByText('Billing address').nextElementSibling).toHaveTextContent('94588')
    expect(within(info).getByText('Created (Nairobi)').nextElementSibling).toHaveTextContent(
      '18 Nov 2013, 13:17 EAT',
    )
    expect(within(info).getByText('Modified (Nairobi)').nextElementSibling).toHaveTextContent(
      '18 Nov 2013, 13:02 EAT',
    )
    expect(within(info).getByText('Source discount').nextElementSibling).toHaveTextContent(/^0$/)
    expect(within(info).getByText('Discount type').nextElementSibling).toHaveTextContent(
      'item_level',
    )
    expect(within(info).getByText('Discount before tax').nextElementSibling).toHaveTextContent(
      'Yes',
    )
    expect(within(info).getByText('Tax inclusive').nextElementSibling).toHaveTextContent('No')
    const totals = screen.getByRole('region', { name: 'Document totals' })
    expect(within(totals).getByText('Tax').nextElementSibling).toHaveTextContent('22.6')
    expect(within(totals).getByText('VAT').nextElementSibling).toHaveTextContent('19.13')
    expect(within(totals).getByText('Discount').nextElementSibling).toHaveTextContent('—')
    expect(within(totals).getByText('Adjustment').nextElementSibling).toHaveTextContent(/^0$/)
    expect(within(totals).getByText('Looking forward for your business.')).toBeInTheDocument()
    expect(within(totals).getByText('Terms & Conditions apply')).toBeInTheDocument()
    const lines = screen.getByRole('region', { name: 'Line items table' })
    expect(within(lines).getByText('982000000030049')).toBeInTheDocument()
    expect(within(lines).getByText('12.5%')).toBeInTheDocument()
    expect(within(lines).getByText('Tax ID: 982000000557028')).toBeInTheDocument()
    const cells = within(within(lines).getAllByRole('row')[1]).getAllByRole('cell')
    expect(cells[7]).toHaveTextContent('—')
    expect(screen.queryByRole('link', { name: 'Open KRA verification' })).not.toBeInTheDocument()
  })

  it('uses the supplied credit-note invoices array and string tax amount without inventing missing financial fields', async () => {
    const document = zohoCreditNoteDetailSample.creditnote
    const fetch = vi.fn().mockImplementation(async (url: string) =>
      Response.json(
        /\/api\/dashboard\/documents\/(?:invoices|credit-notes)\/[^/?]+$/.test(url)
          ? {
              documentType: 'credit_note',
              zohoDocumentId: document.creditnote_id,
              document,
              fiscalizationRequest: null,
            }
          : documentPageFixture([{ ...document, fiscalizationRequest: null }]),
      ),
    )
    await renderDocuments('credit_note', '/credit-notes', fetch)
    await screen.findByRole('link', { name: 'CN-29' })
    expect(screen.getByText('draft')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'INV-384' })).toHaveAttribute(
      'href',
      '/invoices?id=90300000079426',
    )
    await userEvent.click(screen.getByRole('link', { name: 'CN-29' }))
    const info = await screen.findByRole('region', { name: 'Document information' })
    expect(within(info).getByText('Modified (Nairobi)').nextElementSibling).toHaveTextContent(
      '05 Jun 2016, 12:30 EAT',
    )
    expect(within(info).getByRole('link', { name: 'INV-384' })).toHaveAttribute(
      'href',
      '/invoices?id=90300000079426',
    )
    const totals = screen.getByRole('region', { name: 'Document totals' })
    expect(within(totals).getByText('Basic Tax').nextElementSibling).toHaveTextContent('2.50')
    expect(
      within(totals).getByText('Remaining credit balance').nextElementSibling,
    ).toHaveTextContent('10')
    expect(within(totals).getByText('Offer for the referral')).toBeInTheDocument()
    expect(within(totals).getByText('Tax ID: 903000000000356')).toBeInTheDocument()
    for (const label of ['Subtotal', 'Tax', 'Discount']) {
      expect(within(totals).getByText(label).nextElementSibling).toHaveTextContent('—')
    }
    expect(within(totals).getByText('Total (USD)').nextElementSibling).toHaveTextContent('450')
    const lines = screen.getByRole('region', { name: 'Line items table' })
    const cells = within(within(lines).getAllByRole('row')[1]).getAllByRole('cell')
    expect(within(lines).getByText('Tax ID: 903000000000356')).toBeInTheDocument()
    for (const column of [4, 6, 7, 8]) expect(cells[column]).toHaveTextContent('—')
    expect(within(lines).queryByText(/%/)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Open KRA verification' })).not.toBeInTheDocument()
  })

  it('renders every related invoice from an array consistently and prefers it to conflicting flat fields', async () => {
    // Relationship edge case extending the supplied source shape with a second entry.
    const document = {
      ...zohoCreditNoteDetailSample.creditnote,
      invoice_id: 'conflicting-flat',
      invoice_number: 'Conflicting flat reference',
      invoices: [
        ...zohoCreditNoteDetailSample.creditnote.invoices,
        { invoice_id: 0, invoice_number: 'Additional related invoice' },
      ],
    }
    const fetch = vi.fn().mockImplementation(async (url: string) =>
      Response.json(
        /\/api\/dashboard\/documents\/(?:invoices|credit-notes)\/[^/?]+$/.test(url)
          ? {
              documentType: 'credit_note',
              zohoDocumentId: document.creditnote_id,
              document,
              fiscalizationRequest: null,
            }
          : documentPageFixture([{ ...document, fiscalizationRequest: null }]),
      ),
    )
    await renderDocuments('credit_note', '/credit-notes', fetch)
    await screen.findByRole('link', { name: 'CN-29' })
    expect(screen.getByRole('link', { name: 'Additional related invoice' })).toHaveAttribute(
      'href',
      '/invoices?id=0',
    )
    expect(screen.getByRole('link', { name: 'INV-384' })).toHaveAttribute(
      'href',
      '/invoices?id=90300000079426',
    )
    expect(screen.queryByText('Conflicting flat reference')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'CN-29' }))
    const info = await screen.findByRole('region', { name: 'Document information' })
    expect(within(info).getByRole('link', { name: 'Additional related invoice' })).toHaveAttribute(
      'href',
      '/invoices?id=0',
    )
    expect(within(info).getByRole('link', { name: 'INV-384' })).toHaveAttribute(
      'href',
      '/invoices?id=90300000079426',
    )
    expect(screen.queryByText('Conflicting flat reference')).not.toBeInTheDocument()
  })

  it('does not infer a related-invoice link from a credit-note reference number', async () => {
    const document = { ...zohoCreditNoteDetailSample.creditnote, invoices: undefined }
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        documentType: 'credit_note',
        zohoDocumentId: document.creditnote_id,
        document,
        fiscalizationRequest: null,
      }),
    )
    await renderDocuments('credit_note', `/credit-notes?id=${document.creditnote_id}`, fetch)
    const info = await screen.findByRole('region', { name: 'Document information' })
    expect(within(info).getByText('Reference').nextElementSibling).toHaveTextContent('INV-384')
    expect(within(info).getByText('Related invoice').nextElementSibling).toHaveTextContent('—')
    expect(within(info).queryByRole('link', { name: 'INV-384' })).not.toBeInTheDocument()
  })
})

describe('document registers with synthetic provisional-field fixtures', () => {
  it.each([
    ['invoice', '/invoices', invoiceDocumentFixture, 'UI-INV-0042'],
    ['credit_note', '/credit-notes', creditNoteDocumentFixture, 'UI-CN-0042'],
  ] as const)(
    'renders %s rows, distinct statuses and authoritative hasMore pagination',
    async (kind, path, document, number) => {
      const fetch = vi.fn().mockImplementation(async (url: string) => {
        const query = new URL(url, 'https://dashboard.invalid').searchParams
        return Response.json(
          documentPageFixture(
            [
              { ...document, fiscalizationRequest: fiscalizationFixture },
              {
                ...document,
                invoice_id: 'fixture-other',
                creditnote_id: 'fixture-other',
                fiscalizationRequest: null,
              },
            ],
            {
              page: Number(query.get('page')),
              pageSize: Number(query.get('pageSize')),
              hasMore: query.get('page') === '1',
            },
          ),
        )
      })
      await renderDocuments(kind, path, fetch)
      await screen.findAllByRole('link', { name: number })
      const table = screen.getByRole('region', {
        name: kind === 'invoice' ? 'Invoice table' : 'Credit-note table',
      })
      expect(within(table).getAllByText(document.status)).toHaveLength(2)
      expect(within(table).getByText('FIXTURE_REVIEW_PENDING')).toBeInTheDocument()
      expect(within(table).getByText('Not processed')).toBeInTheDocument()
      expect(within(table).getByRole('cell', { name: 'UI-FIXTURE-RECEIPT' })).toBeInTheDocument()
      if (kind === 'invoice') {
        expect(within(table).getByRole('columnheader', { name: 'Balance' })).toBeInTheDocument()
        expect(within(table).getAllByRole('cell', { name: '0.00' })).toHaveLength(2)
      } else {
        expect(
          within(table).queryByRole('columnheader', { name: 'Balance' }),
        ).not.toBeInTheDocument()
      }
      expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
      await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
      await waitFor(() => expect(screen.getByText(/Page 2/)).toBeInTheDocument())
      expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Previous page' })).toBeEnabled()
      await userEvent.selectOptions(screen.getByLabelText('Rows per page'), '50')
      await waitFor(() => expect(fetch.mock.calls.at(-1)?.[0]).toContain('page=1&pageSize=50'))
    },
  )

  it.each(['invoice', 'credit_note'] as const)(
    'navigates from %s register to detail and back with filters intact',
    async (kind) => {
      const isInvoice = kind === 'invoice'
      const doc = isInvoice ? invoiceDocumentFixture : creditNoteDocumentFixture
      const id = isInvoice ? 'fixture-invoice-42' : 'fixture-credit-note-42'
      const number = isInvoice ? 'UI-INV-0042' : 'UI-CN-0042'
      const fetch = vi.fn().mockImplementation(async (url: string) =>
        Response.json(
          /\/api\/dashboard\/documents\/(?:invoices|credit-notes)\/[^/?]+$/.test(url)
            ? {
                documentType: kind,
                zohoDocumentId: id,
                document: doc,
                fiscalizationRequest: fiscalizationFixture,
              }
            : documentPageFixture([{ ...doc, fiscalizationRequest: null }], { page: 3 }),
        ),
      )
      await renderDocuments(
        kind,
        `${isInvoice ? '/invoices' : '/credit-notes'}?page=3&search=UI&status=${doc.status}`,
        fetch,
      )
      await userEvent.click(await screen.findByRole('link', { name: number }))
      await screen.findByRole('heading', { name: number })
      expect(screen.getByRole('link', { name: 'Back to register' }).getAttribute('href')).toContain(
        `?page=3&search=UI&status=${doc.status}`,
      )
      expect(screen.getByText('fixture-request-42')).toBeInTheDocument()
      expect(screen.getByText('FIXTURE_EXECUTION_STATUS')).toBeInTheDocument()
      expect(screen.getByText('FIXTURE_ATTEMPT_STATUS')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Open KRA verification' })).toHaveAttribute(
        'href',
        fiscalizationFixture.kraQrUrl,
      )
      expect(screen.getByRole('link', { name: 'Open KRA verification' })).toHaveAttribute(
        'rel',
        'noopener noreferrer',
      )
      expect(
        screen.queryByRole('button', { name: /fiscalize|writeback|execute/i }),
      ).not.toBeInTheDocument()
      if (isInvoice) {
        expect(screen.getByText('UI fixture item')).toBeInTheDocument()
        expect(screen.getByText('UI fixture notes')).toBeInTheDocument()
        expect(
          within(screen.getByRole('region', { name: 'Document totals' })).getByText('116.00'),
        ).toBeInTheDocument()
      } else {
        expect(screen.getByText('Related invoice').nextElementSibling).toHaveTextContent('—')
      }
      await userEvent.click(screen.getByRole('link', { name: 'Back to register' }))
      await screen.findByRole('link', { name: number })
      expect(screen.getByLabelText('Document number or customer search')).toHaveValue('UI')
    },
  )

  it('displays a successful empty page without guessing the next-page state', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(Response.json(documentPageFixture([], { hasMore: true })))
    await renderDocuments('invoice', '/invoices', fetch)
    await screen.findByText('No documents found')
    expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled()
  })

  it('preserves invoice balance precision and distinguishes unavailable balances from zero', async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json(
        documentPageFixture([
          { ...invoiceDocumentFixture, balance: '9007199254740993.25' },
          { ...invoiceDocumentFixture, invoice_id: 'null-balance', balance: null },
          { ...invoiceDocumentFixture, invoice_id: 'missing-balance', balance: undefined },
        ]),
      ),
    )
    await renderDocuments('invoice', '/invoices', fetch)
    const table = await screen.findByRole('region', { name: 'Invoice table' })
    const rows = within(table).getAllByRole('row')
    const balanceColumn = within(rows[0])
      .getAllByRole('columnheader')
      .findIndex((heading) => heading.textContent === 'Balance')
    expect(within(rows[1]).getAllByRole('cell')[balanceColumn]).toHaveTextContent(
      '9,007,199,254,740,993.25',
    )
    expect(within(rows[2]).getAllByRole('cell')[balanceColumn]).toHaveTextContent('—')
    expect(within(rows[3]).getAllByRole('cell')[balanceColumn]).toHaveTextContent('—')
  })

  it.each([
    ['invoice', {}],
    [
      'invoice',
      {
        customer_name: null,
        date: null,
        total: null,
        balance: null,
        line_items: null,
        taxes: null,
      },
    ],
    ['credit_note', {}],
    [
      'credit_note',
      { customer_name: null, date: null, total: null, line_items: null, taxes: null },
    ],
  ] as const)(
    'renders %s detail with missing or null optional provisional fields: %j',
    async (kind, document) => {
      const fetch = vi.fn().mockResolvedValue(
        Response.json({
          documentType: kind,
          zohoDocumentId: 'fixture-optional',
          document,
          fiscalizationRequest: null,
        }),
      )
      await renderDocuments(
        kind,
        `${kind === 'invoice' ? '/invoices' : '/credit-notes'}?id=fixture-optional`,
        fetch,
      )
      await screen.findByRole('heading', { name: 'fixture-optional' })
      expect(screen.getByText('Customer unavailable')).toBeInTheDocument()
      expect(
        screen.getByText('Line items unavailable from the source response.'),
      ).toBeInTheDocument()
      const totals = screen.getByRole('region', { name: 'Document totals' })
      expect(within(totals).getByText('Total').nextElementSibling).toHaveTextContent('—')
      expect(screen.getByText('NOT_AVAILABLE')).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Open KRA verification' })).not.toBeInTheDocument()
      expect(fetch).toHaveBeenCalledOnce()
    },
  )

  it('retries a gateway failure without using fallback documents', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { error: { code: 'DOCUMENT_READ_FAILED', message: 'Source temporarily unavailable.' } },
          { status: 502 },
        ),
      )
      .mockResolvedValueOnce(
        Response.json(
          documentPageFixture([{ ...invoiceDocumentFixture, fiscalizationRequest: null }]),
        ),
      )
    await renderDocuments('invoice', '/invoices', fetch)
    expect(await screen.findByRole('alert')).toHaveTextContent('Source temporarily unavailable.')
    expect(screen.queryByText('No documents found')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByRole('link', { name: 'UI-INV-0042' })
  })

  it('does not infer a fiscalization status from paid Zoho status or from absent fields', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json(
          documentPageFixture([{ invoice_number: 'Unbound document', status: 'paid' }]),
        ),
      )
    await renderDocuments('invoice', '/invoices', fetch)
    await screen.findByText('Unbound document')
    expect(screen.getByText('paid')).toBeInTheDocument()
    expect(
      screen.getByText('Unavailable', { selector: '.document-unavailable' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Not processed')).not.toBeInTheDocument()
    expect(screen.queryByText(/Fiscalized successfully|Failed/)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Unbound document' })).not.toBeInTheDocument()
  })

  it.each([
    '/invoices?page=abc',
    '/invoices?pageSize=201',
    '/invoices?from=2026-02-30',
    '/invoices?id=..%2Fservices',
  ])('rejects invalid URL input before fetching: %s', async (entry) => {
    const fetch = vi.fn()
    await renderDocuments('invoice', entry, fetch)
    expect(screen.getByRole('alert')).toHaveTextContent('Check the document ID')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects mismatched response pagination and document identity', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(documentPageFixture([], { page: 2 })))
    await renderDocuments('invoice', '/invoices', fetch)
    expect(await screen.findByRole('alert')).toHaveTextContent('pagination does not match')
  })

  it.each([
    ['credit_note', 'fixture-invoice-42', 'fixture-invoice-42', 'type'],
    ['invoice', 'different-outer-id', 'fixture-invoice-42', 'ID'],
    ['invoice', 'fixture-invoice-42', 'different-source-id', 'ID'],
    ['invoice', 'fixture-invoice-42', '../invalid-source-id', 'ID'],
  ])(
    'rejects a conflicting document response (%s, %s, %s)',
    async (documentType, zohoDocumentId, invoiceId, mismatch) => {
      const fetch = vi.fn().mockResolvedValue(
        Response.json({
          documentType,
          zohoDocumentId,
          document: { ...invoiceDocumentFixture, invoice_id: invoiceId },
          fiscalizationRequest: null,
        }),
      )
      await renderDocuments('invoice', '/invoices?id=fixture-invoice-42', fetch)
      expect(await screen.findByRole('alert')).toHaveTextContent(
        `The returned document ${mismatch} does not match`,
      )
      expect(screen.queryByRole('heading', { name: 'UI-INV-0042' })).not.toBeInTheDocument()
    },
  )

  it('renders the pending state while a request is in progress', async () => {
    let resolve!: (response: Response) => void
    const fetch = vi.fn(
      () =>
        new Promise<Response>((done) => {
          resolve = done
        }),
    )
    await renderDocuments('invoice', '/invoices', fetch)
    expect(screen.getByRole('status')).toHaveTextContent('Loading document information')
    resolve(Response.json(documentPageFixture([])))
    await screen.findByText('No documents found')
  })
})

describe('provisional projection safety and formatting', () => {
  it('strips private fields and retains invalid receipt URL text without coercing nested values', () => {
    const data = documentDetailSchema.parse({
      documentType: 'invoice',
      zohoDocumentId: 'fixture',
      document: {
        total: { unverified: true },
        access_token: 'private',
        customer_pin: 'excluded-customer-tax-identifier',
        line_items: [{ name: 'fixture', privatePayload: 'hidden' }],
      },
      fiscalizationRequest: {
        status: 'UNFAMILIAR_SOURCE_STATUS',
        kraQrUrl: 'javascript:alert(1)',
        access_token: 'private',
        attempts: [{ privatePayload: 'hidden' }],
      },
      privatePayload: 'hidden',
    })
    expect(JSON.stringify(data)).not.toMatch(/private|hidden/)
    expect(data.fiscalizationRequest?.kraQrUrl).toBe('javascript:alert(1)')
    expect(data.document.total).toBeUndefined()
    expect(data.document).not.toHaveProperty('customer_pin')
    expect(JSON.stringify(data)).not.toContain('excluded-customer-tax-identifier')
    expect(data.fiscalizationRequest?.status).toBe('UNFAMILIAR_SOURCE_STATUS')
    expect(documentAmount('9007199254740993.25')).toBe('9,007,199,254,740,993.25')
    expect(documentAmount('0.00')).toBe('0.00')
    expect(documentAmount(null)).toBe('—')
    expect(documentDate('invalid')).toBe('—')
    expect(documentDate('2026-02-30')).toBe('—')
    expect(documentDate('2026-11-10', true)).toBe('—')
  })
})

describe('persisted CU/KRA document reconciliation', () => {
  const reconciliationCases = [
    {
      label: 'matching leading zeros',
      status: 'MATCH',
      fiscal: {
        cuReceiptNumber: '001',
        kraQrUrl: 'https://verification.example.test/?invoiceNo=001',
      },
    },
    {
      label: 'mismatched identifiers',
      status: 'MISMATCH',
      fiscal: {
        cuReceiptNumber: '001',
        kraQrUrl: 'https://verification.example.test/?invoiceNo=1',
      },
    },
    {
      label: 'missing CU receipt',
      status: 'MISSING_CU_RECEIPT_NUMBER',
      fiscal: {
        cuReceiptNumber: null,
        kraQrUrl: 'https://verification.example.test/?invoiceNo=001',
      },
    },
    {
      label: 'missing KRA URL',
      status: 'MISSING_KRA_URL',
      fiscal: { cuReceiptNumber: '001', kraQrUrl: null },
    },
    {
      label: 'malformed KRA URL',
      status: 'INVALID_KRA_URL',
      fiscal: { cuReceiptNumber: '001', kraQrUrl: 'not-an-absolute-url' },
    },
    {
      label: 'missing invoiceNo',
      status: 'MISSING_INVOICE_NO',
      fiscal: {
        cuReceiptNumber: '001',
        kraQrUrl: 'https://verification.example.test/?receiptNumber=001',
      },
    },
    { label: 'unavailable receipt values', status: 'NOT_AVAILABLE', fiscal: null },
    {
      label: 'inconsistent supplied MATCH',
      status: 'MISMATCH',
      fiscal: null,
      reconciliation: {
        status: 'MATCH',
        cuReceiptNumber: '001',
        kraUrl: 'https://verification.example.test/?invoiceNo=002',
        invoiceNo: '001',
        reason: 'Unverified supplied result',
      },
    },
    {
      label: 'nonblank CU whitespace',
      status: 'MISMATCH',
      fiscal: {
        cuReceiptNumber: ' 001',
        kraQrUrl: 'https://verification.example.test/?invoiceNo=001',
      },
    },
  ] as const

  it.each(
    (['invoice', 'credit_note'] as const).flatMap((kind) =>
      reconciliationCases.map((scenario) => ({ kind, ...scenario })),
    ),
  )(
    'keeps $kind $status consistent across list, current-page filter and detail: $label',
    async (scenario) => {
      const { kind, status, fiscal } = scenario
      const doc = kind === 'invoice' ? invoiceDocumentFixture : creditNoteDocumentFixture
      const number =
        kind === 'invoice'
          ? invoiceDocumentFixture.invoice_number
          : creditNoteDocumentFixture.creditnote_number
      const id =
        kind === 'invoice'
          ? invoiceDocumentFixture.invoice_id
          : creditNoteDocumentFixture.creditnote_id
      const reconciliation = 'reconciliation' in scenario ? scenario.reconciliation : undefined
      const fetch = vi.fn().mockImplementation(async (url: string) =>
        Response.json(
          /\/api\/dashboard\/documents\/(?:invoices|credit-notes)\/[^/?]+$/.test(url)
            ? {
                documentType: kind,
                zohoDocumentId: id,
                document: doc,
                fiscalizationRequest: fiscal,
                reconciliation,
              }
            : documentPageFixture([{ ...doc, fiscalizationRequest: fiscal, reconciliation }]),
        ),
      )
      await renderDocuments(kind, kind === 'invoice' ? '/invoices' : '/credit-notes', fetch)
      await screen.findByRole('link', { name: number })
      const table = screen.getByRole('region', {
        name: kind === 'invoice' ? 'Invoice table' : 'Credit-note table',
      })
      expect(within(table).getAllByText(status).length).toBeGreaterThan(0)
      await userEvent.selectOptions(
        screen.getByLabelText('CU/KRA reconciliation (current page)'),
        status,
      )
      expect(screen.getByRole('link', { name: number })).toBeInTheDocument()
      expect(fetch).toHaveBeenCalledOnce()
      await userEvent.click(screen.getByRole('link', { name: number }))
      const comparison = await screen.findByRole('region', {
        name: 'CU/KRA receipt reconciliation',
      })
      expect(within(comparison).getByText(status)).toBeInTheDocument()
      expect(
        fetch.mock.calls.every(
          ([url, options]) =>
            options.method === 'GET' &&
            !new URL(url, 'https://dashboard.invalid').searchParams.has('reconciliationStatus'),
        ),
      ).toBe(true)
    },
  )

  it.each(['invoice', 'credit_note'] as const)(
    'uses the same leading-zero comparison in the %s list and detail',
    async (kind) => {
      const doc = kind === 'invoice' ? invoiceDocumentFixture : creditNoteDocumentFixture
      const id =
        kind === 'invoice'
          ? invoiceDocumentFixture.invoice_id
          : creditNoteDocumentFixture.creditnote_id
      const number =
        kind === 'invoice'
          ? invoiceDocumentFixture.invoice_number
          : creditNoteDocumentFixture.creditnote_number
      const fiscal = { ...fiscalizationFixture, ...reconciledReceiptFixture }
      const fetch = vi.fn().mockImplementation(async (url: string) =>
        Response.json(
          /\/api\/dashboard\/documents\/(?:invoices|credit-notes)\/[^/?]+$/.test(url)
            ? {
                documentType: kind,
                zohoDocumentId: id,
                document: doc,
                fiscalizationRequest: fiscal,
              }
            : documentPageFixture([{ ...doc, fiscalizationRequest: fiscal }]),
        ),
      )
      await renderDocuments(kind, kind === 'invoice' ? '/invoices' : '/credit-notes', fetch)
      await screen.findByRole('link', { name: number })
      const table = screen.getByRole('region', {
        name: kind === 'invoice' ? 'Invoice table' : 'Credit-note table',
      })
      expect(within(table).getAllByText('MATCH').length).toBeGreaterThan(0)
      expect(
        within(table).getAllByText(reconciledReceiptFixture.cuReceiptNumber).length,
      ).toBeGreaterThan(0)
      await userEvent.click(screen.getByRole('link', { name: number }))
      const comparison = await screen.findByRole('region', {
        name: 'CU/KRA receipt reconciliation',
      })
      expect(within(comparison).getByText('MATCH')).toBeInTheDocument()
      expect(
        within(comparison).getAllByText(reconciledReceiptFixture.cuReceiptNumber),
      ).toHaveLength(2)
      expect(within(comparison).getByRole('link')).toHaveAttribute(
        'href',
        reconciledReceiptFixture.kraQrUrl,
      )
      expect(fetch.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true)
    },
  )

  it.each(['invoice', 'credit_note'] as const)(
    'filters %s mismatch and missing values only on the loaded source page',
    async (kind) => {
      const doc = kind === 'invoice' ? invoiceDocumentFixture : creditNoteDocumentFixture
      const makeRow = (label: string, fiscal: unknown) => ({
        ...doc,
        invoice_id: kind === 'invoice' ? `fixture-${label.replaceAll(' ', '-')}` : undefined,
        creditnote_id: `fixture-${label.replaceAll(' ', '-')}`,
        invoice_number: kind === 'invoice' ? label : undefined,
        creditnote_number: label,
        fiscalizationRequest: fiscal,
      })
      const fetch = vi.fn().mockImplementation(async (url: string) => {
        const page = Number(new URL(url, 'https://dashboard.invalid').searchParams.get('page'))
        return Response.json(
          documentPageFixture(
            [
              makeRow('Matching document', reconciledReceiptFixture),
              makeRow('Mismatched document', {
                ...reconciledReceiptFixture,
                cuReceiptNumber: '000DIFFERENT',
              }),
              makeRow('Missing URL document', { cuReceiptNumber: '000RECEIPT' }),
            ],
            { page, total: 80, hasMore: true },
          ),
        )
      })
      await renderDocuments(
        kind,
        `${kind === 'invoice' ? '/invoices' : '/credit-notes'}?page=3`,
        fetch,
      )
      await screen.findByRole('link', { name: 'Matching document' })
      const filter = screen.getByLabelText('CU/KRA reconciliation (current page)')
      await userEvent.selectOptions(filter, 'MISMATCH')
      expect(screen.getByRole('link', { name: 'Mismatched document' })).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Matching document' })).not.toBeInTheDocument()
      expect(
        screen.getByText('1 of 3 documents on this page match the reconciliation filter'),
      ).toBeInTheDocument()
      expect(screen.getByText(/80 documents.*Page 3/)).toBeInTheDocument()
      expect(fetch).toHaveBeenCalledTimes(1)
      await userEvent.selectOptions(filter, 'MISSING_KRA_URL')
      expect(screen.getByRole('link', { name: 'Missing URL document' })).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Mismatched document' })).not.toBeInTheDocument()
      await userEvent.selectOptions(filter, 'MISSING_INVOICE_NO')
      expect(
        screen.getByText('No documents on this page match the reconciliation filter'),
      ).toBeInTheDocument()
      expect(screen.queryByText('No documents found')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled()
      expect(fetch).toHaveBeenCalledTimes(1)
      await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
      await waitFor(() => expect(screen.getByText(/80 documents.*Page 4/)).toBeInTheDocument())
      for (const [url] of fetch.mock.calls) {
        expect(
          new URL(url, 'https://dashboard.invalid').searchParams.has('reconciliationStatus'),
        ).toBe(false)
      }
    },
  )

  it('shows an invalid persisted URL as reconciliation evidence without rendering an unsafe link', async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        documentType: 'invoice',
        zohoDocumentId: invoiceDocumentFixture.invoice_id,
        document: invoiceDocumentFixture,
        fiscalizationRequest: { ...reconciledReceiptFixture, kraQrUrl: 'javascript:alert(1)' },
      }),
    )
    await renderDocuments('invoice', `/invoices?id=${invoiceDocumentFixture.invoice_id}`, fetch)
    const comparison = await screen.findByRole('region', { name: 'CU/KRA receipt reconciliation' })
    expect(within(comparison).getByText('INVALID_KRA_URL')).toBeInTheDocument()
    expect(within(comparison).getByText('javascript:alert(1)')).toBeInTheDocument()
    expect(within(comparison).queryByRole('link')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Open KRA verification' })).not.toBeInTheDocument()
    expect(
      screen
        .getAllByRole('link')
        .every((link) => !link.getAttribute('href')?.startsWith('javascript:')),
    ).toBe(true)
  })
})

describe('rich persisted document evidence', () => {
  it.each(['invoice', 'credit_note'] as const)(
    'keeps original %s lines, fiscal snapshots, device replies and writeback values distinct',
    async (kind) => {
      const isInvoice = kind === 'invoice'
      const id = isInvoice
        ? invoiceDocumentFixture.invoice_id
        : creditNoteDocumentFixture.creditnote_id
      const doc = {
        ...invoiceDocumentFixture,
        ...(isInvoice ? {} : creditNoteDocumentFixture),
        ...(isInvoice
          ? {
              payment_made: '50.00',
              credits_applied: '10.00',
              payment_terms: 30,
              payment_terms_label: 'Net 30',
            }
          : {}),
        customer_pin: 'FIXTURE-CUSTOMER-PIN',
        line_items: [
          {
            ...invoiceDocumentFixture.line_items[0],
            name: 'Original Zoho first item',
            sku: 'SOURCE-SKU-1',
            hs_code: '5678.90',
            hs_name: 'Original source HS name',
            line_subtotal: '100.00',
          },
          { name: 'Original Zoho second item', quantity: '1', rate: '20.00', item_total: '20.00' },
        ],
      }
      const fetch = vi.fn().mockResolvedValue(
        Response.json({
          documentType: kind,
          zohoDocumentId: id,
          document: doc,
          fiscalizationRequest: detailedFiscalizationFixture,
        }),
      )
      await renderDocuments(kind, `${isInvoice ? '/invoices' : '/credit-notes'}?id=${id}`, fetch)
      expect(fetch).toHaveBeenCalledWith(
        `/api/dashboard/documents/${isInvoice ? 'invoices' : 'credit-notes'}/${id}`,
        expect.objectContaining({ method: 'GET', credentials: 'same-origin' }),
      )
      const lines = await screen.findByRole('region', { name: 'Line items table' })
      expect(within(lines).getByText('Original Zoho first item')).toBeInTheDocument()
      expect(within(lines).getByText('Original Zoho second item')).toBeInTheDocument()
      expect(within(lines).getByText('SOURCE-SKU-1')).toBeInTheDocument()
      expect(within(lines).getByText('Original source HS name')).toBeInTheDocument()
      expect(screen.queryByText('FIXTURE-CUSTOMER-PIN')).not.toBeInTheDocument()
      expect(screen.queryByText('Customer PIN')).not.toBeInTheDocument()
      if (isInvoice) {
        expect(screen.getByText('Payments received').parentElement).toHaveTextContent('50.00')
        expect(screen.getByText('Credits applied').parentElement).toHaveTextContent('10.00')
        expect(screen.getByText('Payment terms').parentElement).toHaveTextContent('Net 30')
      }
      expect(screen.getByText('Snapshot item before device commands')).toBeInTheDocument()
      expect(screen.getByText('Snapshot HS description')).toBeInTheDocument()
      expect(screen.getByRole('cell', { name: 'A' })).toBeInTheDocument()
      await userEvent.click(screen.getByText('1. FixtureRegisterItem'))
      expect(screen.getByText(/Actual device item argument/)).toBeInTheDocument()
      expect(screen.getByText(/FixtureDeviceValue.*DEVICE-REPLY/)).toBeInTheDocument()
      const deviceValues = screen.getByRole('heading', {
        name: 'Actual device response values',
      }).parentElement!
      const writebackValues = screen.getByRole('heading', {
        name: 'Values written back to Zoho',
      }).parentElement!
      expect(within(deviceValues).getByText('000DEVICE-RECEIPT')).toBeInTheDocument()
      expect(within(deviceValues).queryByText('000WRITEBACK-RECEIPT')).not.toBeInTheDocument()
      expect(within(writebackValues).getByText('000WRITEBACK-RECEIPT')).toBeInTheDocument()
      expect(
        within(writebackValues).getByText('Persisted Zoho writeback response'),
      ).toBeInTheDocument()
      const attempts = screen.getByRole('region', { name: 'Attempt history table' })
      expect(
        within(attempts).getByText(/FIXTURE_ATTEMPT_DEVICE_ERROR: Actual attempt failure evidence/),
      ).toBeInTheDocument()
      await userEvent.click(within(attempts).getByText('FixtureAttemptCommand'))
      expect(
        within(attempts).getByText('<Res Code="42">Fixture attempt device failure</Res>'),
      ).toBeInTheDocument()
      expect(
        within(attempts).getByText(/FIXTURE_COMMAND_ERROR Persisted command error/),
      ).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: /retry|fiscalize|execute/i }),
      ).not.toBeInTheDocument()
      if (!isInvoice) {
        expect(
          screen.getByRole('link', { name: invoiceDocumentFixture.invoice_number }),
        ).toHaveAttribute('href', `/invoices?id=${invoiceDocumentFixture.invoice_id}`)
      }
    },
  )
})

describe('document contract boundaries', () => {
  it('uses only documented filters and preserves null-total pagination', () => {
    const path = new URL(
      documentListPath('invoice', {
        page: 3,
        pageSize: 200,
        search: 'INV 42',
        status: 'sent',
        customerId: 'customer-1',
        dateFrom: '2026-11-01T00:00:00Z',
        dateTo: '2026-11-15T23:59:59Z',
        sortBy: 'date',
        sortOrder: 'D',
      }),
      'https://dashboard.invalid',
    )
    expect(path.pathname).toBe('/api/dashboard/documents/invoices')
    expect(Object.fromEntries(path.searchParams)).toEqual({
      page: '3',
      pageSize: '200',
      search: 'INV 42',
      status: 'sent',
      customerId: 'customer-1',
      dateFrom: '2026-11-01T00:00:00Z',
      dateTo: '2026-11-15T23:59:59Z',
      sortBy: 'date',
      sortOrder: 'D',
    })
    expect(documentPagination({ page: 3, pageSize: 25, total: null, hasMore: false })).toEqual({
      previousPage: 2,
      nextPage: null,
      totalLabel: 'Total unavailable from Zoho Books',
    })
    expect(documentPagination({ page: 1, pageSize: 25, total: null, hasMore: true }).nextPage).toBe(
      2,
    )
    expect(
      documentPagination({ page: 1, pageSize: 25, total: null, hasMore: true }).previousPage,
    ).toBeNull()
  })

  it('keeps invoice and credit-note detail paths separate and encodes document IDs', () => {
    expect(documentListPath('credit_note')).toBe(
      '/api/dashboard/documents/credit-notes?page=1&pageSize=25',
    )
    expect(documentDetailPath('invoice', 'zoho-inv-1')).toBe(
      '/api/dashboard/documents/invoices/zoho-inv-1',
    )
    expect(documentDetailPath('credit_note', 'cn-1')).toBe(
      '/api/dashboard/documents/credit-notes/cn-1',
    )
    expect(() => documentDetailPath('invoice', ' ')).toThrow('Zoho document ID')
    expect(() => documentDetailPath('invoice', 'inv/?1')).toThrow('Zoho document ID')
  })

  it('rejects unsupported middleware-only filters, bad dates and out-of-range pages', () => {
    expect(documentQuerySchema.safeParse({ fiscalizationStatus: 'Failed' }).success).toBe(false)
    expect(documentQuerySchema.safeParse({ transmissionStatus: 'pending' }).success).toBe(false)
    expect(documentQuerySchema.safeParse({ pageSize: 201 }).success).toBe(false)
    expect(documentQuerySchema.safeParse({ page: 0 }).success).toBe(false)
    expect(documentQuerySchema.safeParse({ sortOrder: 'desc' }).success).toBe(false)
    expect(
      documentQuerySchema.safeParse({
        dateFrom: '2026-11-15T00:00:00Z',
        dateTo: '2026-11-01T00:00:00Z',
      }).success,
    ).toBe(false)
    expect(
      documentQuerySchema.safeParse({
        dateFrom: '2026-11-15T01:00:00+03:00',
        dateTo: '2026-11-15T00:00:00Z',
      }).success,
    ).toBe(true)
  })

  it('accepts confirmed envelopes and strips fields outside the provisional projection', () => {
    expect(
      documentPageSchema.safeParse({
        page: 1,
        pageSize: 25,
        total: null,
        hasMore: false,
        items: [],
      }).success,
    ).toBe(true)
    expect(documentDetailSchema.safeParse({ invoice: { invoice_id: 'invented' } }).success).toBe(
      false,
    )
  })
})

async function renderDocuments(
  kind: 'invoice' | 'credit_note',
  entry: string,
  fetch: ReturnType<typeof vi.fn>,
  reconciliation = false,
  writebackOperation?: unknown,
) {
  vi.stubEnv('DEV', false)
  vi.stubEnv('VITE_DATA_MODE', 'api')
  vi.stubGlobal('fetch', fetch)
  const { ApiDocuments, ApiReceiptReconciliation } = await import('./ApiDocuments')
  const initialEntry = writebackOperation
    ? {
        pathname: entry.split('?')[0],
        search: entry.includes('?') ? `?${entry.split('?').slice(1).join('?')}` : '',
        state: { writebackOperation },
      }
    : entry
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[initialEntry]}>
        {reconciliation ? <ApiReceiptReconciliation /> : <ApiDocuments kind={kind} />}
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('document register and detail unavailable states', () => {
  it.each(['invoice', 'credit_note'] as const)(
    'keeps the selected %s reconciliation register when clearing filters',
    async (kind) => {
      const fetch = vi.fn().mockImplementation(async (url: string) => {
        const query = new URL(url, 'https://dashboard.invalid').searchParams
        return Response.json(documentPageFixture([], { page: Number(query.get('page')) }))
      })
      await renderDocuments(
        kind,
        `/reconciliation?kind=${kind}&search=reference&status=open&page=3&from=2026-11-01&reconciliationStatus=MISMATCH`,
        fetch,
        true,
      )
      await screen.findByText('No documents found')
      await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
      expect(screen.getByLabelText('Document type')).toHaveValue(kind)
      await waitFor(() =>
        expect(screen.getByLabelText('Document number or customer search')).toHaveValue(''),
      )
      expect(screen.getByLabelText('Zoho status')).toHaveValue('')
      expect(screen.getByLabelText('Document date from (UTC)')).toHaveValue('')
      expect(screen.getByLabelText('CU/KRA reconciliation (current page)')).toHaveValue('')
      const resource = kind === 'invoice' ? 'invoices' : 'credit-notes'
      await waitFor(() =>
        expect(fetch).toHaveBeenLastCalledWith(
          `/api/dashboard/documents/${resource}?page=1&pageSize=25`,
          expect.anything(),
        ),
      )
      expect(
        fetch.mock.calls.every(([url]) => String(url).includes(`/documents/${resource}?`)),
      ).toBe(true)
    },
  )

  it('preserves register filters on the return link from document detail', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: { code: 'CONTRACT_SCHEMA_UNAVAILABLE', message: 'Exact detail schema missing.' },
          }),
          { status: 503 },
        ),
    )
    await renderDocuments(
      'invoice',
      '/invoices?id=zoho-1&search=INV-42&page=3&from=2026-11-01',
      fetch,
    )
    expect(screen.getByRole('link', { name: 'Back to register' })).toHaveAttribute(
      'href',
      '/invoices?search=INV-42&page=3&from=2026-11-01',
    )
    await screen.findByRole('alert')
  })

  it('clears applied filters and the search draft together', async () => {
    const fetch = vi.fn<(path: string) => Promise<Response>>(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              code: 'CONTRACT_SCHEMA_UNAVAILABLE',
              message: 'Exact register schema missing.',
            },
          }),
          { status: 503 },
        ),
    )
    await renderDocuments('invoice', '/invoices?search=INV-42&customerId=c-1&page=3', fetch)
    expect(screen.getByLabelText('Document number or customer search')).toHaveValue('INV-42')
    await screen.findByRole('alert')
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    await waitFor(() =>
      expect(screen.getByLabelText('Document number or customer search')).toHaveValue(''),
    )
    expect(screen.getByLabelText('Customer ID')).toHaveValue('')
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(
          ([path]) => path === '/api/dashboard/documents/invoices?page=1&pageSize=25',
        ),
      ).toBe(true),
    )
  })

  it.each([
    ['invoice', '/invoices', '/api/dashboard/documents/invoices'],
    ['credit_note', '/credit-notes', '/api/dashboard/documents/credit-notes'],
  ] as const)(
    'shows the actual gateway failure for %s instead of a successful empty register',
    async (kind, entry, endpoint) => {
      const fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: 'CONTRACT_SCHEMA_UNAVAILABLE',
              message: 'Exact document row schema is missing from the supplied contract.',
            },
          }),
          { status: 503 },
        ),
      )
      await renderDocuments(kind, entry, fetch)
      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent('Exact document row schema is missing'),
      )
      expect(fetch.mock.calls[0][0]).toBe(`${endpoint}?page=1&pageSize=25`)
      expect(
        screen.getByText(/Zoho status and middleware fiscalization are independent/i),
      ).toBeInTheDocument()
      expect(screen.queryByText('No documents found')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /next page/i })).not.toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'View fiscalization history' })).toHaveAttribute(
        'href',
        '/fiscalization',
      )
    },
  )

  it('passes supported search and date filters to the gateway without filtering page rows', async () => {
    const fetch = vi.fn().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            error: { code: 'CONTRACT_SCHEMA_UNAVAILABLE', message: 'Schema unavailable.' },
          }),
          { status: 503 },
        ),
    )
    await renderDocuments(
      'invoice',
      '/invoices?from=2026-11-01&to=2026-11-15&customerId=c-1',
      fetch,
    )
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Document number or customer search'), 'INV-42')
    await user.click(screen.getByRole('button', { name: /^Search$/ }))
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    const path = new URL(fetch.mock.calls[1][0], 'https://dashboard.invalid')
    expect(path.searchParams.get('search')).toBe('INV-42')
    expect(path.searchParams.get('dateFrom')).toBe('2026-11-01T00:00:00.000Z')
    expect(path.searchParams.get('dateTo')).toBe('2026-11-15T23:59:59.999Z')
    expect(path.searchParams.get('customerId')).toBe('c-1')
    expect(
      screen.getByText(/Fiscalization filters are available in fiscalization history/),
    ).toBeInTheDocument()
  })

  it('opens a credit note by Zoho ID without confusing the ID with a request ID', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: 'CONTRACT_SCHEMA_UNAVAILABLE', message: 'Exact detail schema missing.' },
        }),
        { status: 503 },
      ),
    )
    await renderDocuments('credit_note', '/credit-notes?id=zoho-cn-1', fetch)
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    expect(fetch.mock.calls[0][0]).toBe('/api/dashboard/documents/credit-notes/zoho-cn-1')
    expect(screen.getByRole('heading', { name: 'Credit-note detail' })).toBeInTheDocument()
    expect(screen.getByText(/Zoho document ID: zoho-cn-1/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to register' })).toHaveAttribute(
      'href',
      '/credit-notes',
    )
    expect(screen.queryByRole('button', { name: /fiscaliz|writeback/i })).not.toBeInTheDocument()
  })
})
