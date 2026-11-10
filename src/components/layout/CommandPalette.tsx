import { AnimatePresence, motion } from 'framer-motion'
import {
  Activity,
  ArrowRight,
  FileCheck2,
  FileText,
  LayoutDashboard,
  MonitorCog,
  RefreshCw,
  Search,
  Settings,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { useDemoData } from '@/mocks/demo-data-context'
import type { Submission } from '@/types/domain'
import {
  useDashboardCreditNoteListQuery,
  useDashboardInvoiceListQuery,
} from '@/features/api/queries'
import type { DashboardCreditNoteItem, DashboardInvoiceItem } from '@/features/api/schemas'
import './global-ux.css'

const destinations = [
  {
    title: 'Overview',
    detail: 'Operational snapshot and analytics',
    path: '/overview',
    Icon: LayoutDashboard,
  },
  {
    title: 'Fiscalization',
    detail: 'Invoices, credit notes and receipt evidence',
    path: '/fiscalization',
    Icon: FileCheck2,
  },
  {
    title: 'G03 Device',
    detail: 'Connectivity, health and readiness',
    path: '/device',
    Icon: MonitorCog,
  },
  {
    title: 'Writeback',
    detail: 'Zoho Books transmission outcomes',
    path: '/writeback',
    Icon: RefreshCw,
  },
  {
    title: 'Monitoring',
    detail: 'Queue, recovery and system activity',
    path: '/monitoring',
    Icon: Activity,
  },
  {
    title: 'Settings',
    detail: 'Connection, session and display settings',
    path: '/settings',
    Icon: Settings,
  },
] as const

type CommandItem =
  | { kind: 'route'; key: string; title: string; detail: string; path: string; icon: typeof Search }
  | { kind: 'submission'; key: string; title: string; detail: string; submission: Submission }
  | {
      kind: 'api-record'
      key: string
      title: string
      detail: string
      requestId: string
      documentType: 'invoice' | 'credit_note'
      status: string
    }

function recordCommandItems(items: Array<DashboardInvoiceItem | DashboardCreditNoteItem>) {
  return items.map((item) => ({
    kind: 'api-record' as const,
    key: `middleware-${item.documentType}-${item.requestId}`,
    title: item.documentNumber ?? item.requestId,
    detail: `${item.documentType === 'invoice' ? 'Invoice' : 'Credit note'} · ${item.zohoDocumentId} · ${item.requestId}`,
    requestId: item.requestId,
    documentType: item.documentType,
    status: item.fiscalizationStatus,
  }))
}

export interface CommandPaletteProps {
  /** Optional handoff for opening a selected row in the host's transaction drawer. */
  onSelectSubmission?: (submission: Submission) => void
  /** Disable demo transaction lookup while the shell is connected to the API adapter. */
  allowDemoRecords?: boolean
  /** Only query protected record APIs after the authentication provider is active. */
  allowApiRecords?: boolean
}

/** Search known destinations and, when enabled, demo or authorized middleware records. */
export function CommandPalette({
  onSelectSubmission,
  allowDemoRecords = true,
  allowApiRecords = false,
}: CommandPaletteProps) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const demoData = useDemoData()
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [query])
  const searchEnabled = allowApiRecords && !allowDemoRecords && open && debouncedQuery.length >= 2
  const invoices = useDashboardInvoiceListQuery(
    { page: 1, pageSize: 5, search: searchEnabled ? debouncedQuery : undefined },
    searchEnabled,
  )
  const creditNotes = useDashboardCreditNoteListQuery(
    { page: 1, pageSize: 5, search: searchEnabled ? debouncedQuery : undefined },
    searchEnabled,
  )
  const apiSearchLoading = searchEnabled && (invoices.isLoading || creditNotes.isLoading)
  const apiSearchFailed = searchEnabled && (invoices.isError || creditNotes.isError)

  const items = useMemo<CommandItem[]>(() => {
    const needle = query.trim().toLocaleLowerCase()
    const routes = destinations
      .filter(
        (item) => !needle || `${item.title} ${item.detail}`.toLocaleLowerCase().includes(needle),
      )
      .map((item) => ({
        kind: 'route' as const,
        key: `route-${item.path}`,
        title: item.title,
        detail: item.detail,
        path: item.path,
        icon: item.Icon,
      }))
    const records =
      needle && allowDemoRecords
        ? (demoData?.submissions ?? [])
            .filter((item) => {
              const searchable = [
                item.documentNumber,
                item.documentId,
                item.cuReceiptNumber,
                item.etimsReceiptNumber,
                item.id,
                item.customer,
              ]
                .filter(Boolean)
                .join(' ')
                .toLocaleLowerCase()
              return searchable.includes(needle)
            })
            .slice(0, 6)
            .map((submission) => ({
              kind: 'submission' as const,
              key: `submission-${submission.id}`,
              title: submission.documentNumber,
              detail: `${submission.type} · ${submission.customer} · ${submission.id}`,
              submission,
            }))
        : []
    const apiRecords =
      allowApiRecords && !allowDemoRecords && needle.length >= 2
        ? recordCommandItems([
            ...(invoices.data?.items ?? []),
            ...(creditNotes.data?.items ?? []),
          ]).slice(0, 8)
        : []
    return [...routes, ...records, ...apiRecords]
  }, [
    allowApiRecords,
    allowDemoRecords,
    creditNotes.data?.items,
    demoData,
    invoices.data?.items,
    query,
  ])

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setActiveIndex(0)
  }, [])

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen(true)
      }
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [close])

  useEffect(() => {
    if (!open) return
    previousFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus())
    return () => {
      window.cancelAnimationFrame(frame)
      if (previousFocus.current?.isConnected) previousFocus.current.focus()
    }
  }, [open])

  useEffect(() => setActiveIndex(0), [query])

  const select = (item: CommandItem) => {
    if (item.kind === 'route') {
      navigate(item.path)
    } else if (item.kind === 'api-record') {
      navigate('/fiscalization', {
        state: { requestId: item.requestId, documentType: item.documentType },
      })
    } else if (onSelectSubmission) {
      onSelectSubmission(item.submission)
    } else {
      navigate('/fiscalization', { state: { paletteSubmissionId: item.submission.id } })
    }
    close()
  }

  const onInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => (items.length ? Math.min(index + 1, items.length - 1) : 0))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter' && items[activeIndex]) {
      event.preventDefault()
      select(items[activeIndex])
    }
  }

  return (
    <>
      <button
        className="command-trigger"
        type="button"
        aria-haspopup="dialog"
        aria-label="Search dashboard. Press Control or Command plus K."
        onClick={() => setOpen(true)}
      >
        <Search size={15} aria-hidden="true" />
        <span>
          {allowDemoRecords
            ? 'Search pages and demo records'
            : allowApiRecords
              ? 'Search pages and middleware records'
              : 'Search dashboard pages'}
        </span>
        <kbd>Ctrl K</kbd>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="command-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={(event) => event.target === event.currentTarget && close()}
          >
            <motion.section
              className="command-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="command-title"
              initial={{ opacity: 0, y: -10, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.99 }}
              transition={{ duration: 0.16 }}
              onKeyDown={(event) => {
                if (event.key === 'Tab') {
                  event.preventDefault()
                  inputRef.current?.focus()
                }
              }}
            >
              <h2 id="command-title" className="sr-only">
                Dashboard search
              </h2>
              <div className="command-search-row">
                <Search size={18} aria-hidden="true" />
                <input
                  ref={inputRef}
                  role="combobox"
                  aria-label={
                    allowDemoRecords
                      ? 'Search pages and demo transactions'
                      : allowApiRecords
                        ? 'Search pages and middleware records'
                        : 'Search dashboard pages'
                  }
                  aria-expanded="true"
                  aria-controls="command-results"
                  aria-activedescendant={
                    items[activeIndex] ? `command-option-${activeIndex}` : undefined
                  }
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={onInputKeyDown}
                  placeholder={
                    allowDemoRecords
                      ? 'Search a page, document, Zoho ID, CU number or request ID…'
                      : allowApiRecords
                        ? 'Search a page, invoice, credit note, Zoho ID or request ID…'
                        : 'Search a dashboard page…'
                  }
                  autoComplete="off"
                  spellCheck={false}
                />
                <button type="button" className="command-esc" onClick={close}>
                  Esc
                </button>
              </div>
              <div className="command-subtitle">
                {query.trim()
                  ? allowDemoRecords
                    ? 'Matching local demonstration records and pages'
                    : allowApiRecords
                      ? 'Matching authenticated middleware records and pages'
                      : 'Matching dashboard pages'
                  : 'Jump to a workspace'}
                {query.trim() && allowDemoRecords && (
                  <span className="command-demo-tag">DEMO DATA</span>
                )}
              </div>
              <div
                id="command-results"
                role="listbox"
                aria-label="Search results"
                className="command-results"
              >
                {items.map((item, index) => {
                  const Icon =
                    item.kind === 'route'
                      ? (destinations.find((destination) => destination.path === item.path)?.Icon ??
                        Search)
                      : FileText
                  return (
                    <button
                      id={`command-option-${index}`}
                      key={item.key}
                      type="button"
                      role="option"
                      aria-selected={activeIndex === index}
                      className={`command-option ${activeIndex === index ? 'is-active' : ''}`}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => select(item)}
                    >
                      <span
                        className={`command-option-icon ${item.kind !== 'route' ? 'is-record' : ''}`}
                      >
                        <Icon size={16} aria-hidden="true" />
                      </span>
                      <span className="command-option-copy">
                        <strong>{item.title}</strong>
                        <small>{item.detail}</small>
                      </span>
                      {item.kind === 'submission' || item.kind === 'api-record' ? (
                        <span className="command-status">
                          {item.kind === 'submission'
                            ? item.submission.status.replaceAll('_', ' ')
                            : item.status.replaceAll('_', ' ')}
                        </span>
                      ) : (
                        <ArrowRight size={14} className="command-arrow" aria-hidden="true" />
                      )}
                    </button>
                  )
                })}
                {items.length === 0 && (
                  <div className="command-empty" role="status">
                    <Search size={18} aria-hidden="true" />
                    <strong>
                      {apiSearchLoading
                        ? 'Searching middleware records…'
                        : apiSearchFailed
                          ? 'Middleware record search unavailable'
                          : allowDemoRecords
                            ? 'No matching demo records'
                            : query.trim().length >= 2
                              ? 'No matching middleware records or pages'
                              : 'No matching pages'}
                    </strong>
                    <span>
                      {apiSearchFailed
                        ? 'Check the dashboard API connection or open Fiscalization to see its error details.'
                        : allowDemoRecords
                          ? 'Try a document number, customer, Zoho ID or request ID.'
                          : 'Search uses the authenticated paginated invoice and credit-note APIs.'}
                    </span>
                  </div>
                )}
              </div>
              <div className="command-footer">
                <span>
                  <kbd>↑</kbd>
                  <kbd>↓</kbd> to navigate
                </span>
                <span>
                  <kbd>Enter</kbd> to open
                </span>
                <span>
                  <kbd>Esc</kbd> to close
                </span>
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
