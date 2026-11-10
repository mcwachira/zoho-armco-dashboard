import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, AlertTriangle, Bell, Check, CheckCheck, Info, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDemoData } from '@/mocks/demo-data-context'
import type { Alert } from '@/types/domain'
import { useDashboardManualReviewQuery } from '@/features/api/queries'
import './global-ux.css'

export interface NotificationCenterProps {
  alerts?: Alert[]
  isDemo?: boolean
  allowApiRead?: boolean
}

const ago = (value: string) => {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`
}

const LevelIcon = ({ level }: { level: Alert['level'] }) => {
  if (level === 'critical') return <AlertCircle size={16} aria-hidden="true" />
  if (level === 'warning') return <AlertTriangle size={16} aria-hidden="true" />
  return <Info size={16} aria-hidden="true" />
}

/** Notification popover for safe, read-only operational alerts. */
export function NotificationCenter({
  alerts,
  isDemo = true,
  allowApiRead = false,
}: NotificationCenterProps) {
  const navigate = useNavigate()
  const demoData = useDemoData()
  const demoAlerts = alerts ?? demoData?.alerts ?? []
  const manualReviews = useDashboardManualReviewQuery(
    { page: 1, pageSize: 8 },
    allowApiRead && !isDemo,
  )
  const apiAlerts: Alert[] =
    !isDemo && manualReviews.data?.availability === 'partial'
      ? manualReviews.data.items.map((item) => ({
          id: item.caseId,
          level: 'warning',
          title: 'Manual review required',
          detail: item.reason,
          at: item.updatedAt,
        }))
      : []
  const activeAlerts = isDemo ? demoAlerts : apiAlerts
  const [open, setOpen] = useState(false)
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set())
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const unreadCount = useMemo(
    () => activeAlerts.filter((alert) => !readIds.has(alert.id)).length,
    [activeAlerts, readIds],
  )
  const closePanel = () => {
    setOpen(false)
    triggerRef.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    const closeOnOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closePanel()
      }
    }
    document.addEventListener('pointerdown', closeOnOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const openActivity = (alert: Alert) => {
    setReadIds((current) => new Set(current).add(alert.id))
    setOpen(false)
    navigate('/monitoring', { state: { alertId: alert.id } })
  }

  const markAllRead = () => setReadIds(new Set(activeAlerts.map((alert) => alert.id)))

  return (
    <div className="notification-center" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`notification-trigger ${open ? 'is-open' : ''}`}
        aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Bell size={17} aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="notification-count" aria-hidden="true">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.section
            className="notification-popover"
            role="dialog"
            aria-label="Operational notifications"
            initial={{ opacity: 0, y: -5, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.99 }}
            transition={{ duration: 0.14 }}
          >
            <header className="notification-header">
              <div>
                <h2>Notifications</h2>
                <span>{unreadCount ? `${unreadCount} unread` : 'All caught up'}</span>
              </div>
              <button
                type="button"
                className="notification-close"
                onClick={closePanel}
                aria-label="Close notifications"
              >
                <X size={16} />
              </button>
            </header>
            {isDemo && (
              <div className="notification-demo">
                <span /> DEMO ALERTS · SAMPLE DATA
              </div>
            )}
            {!isDemo && (
              <div className="notification-demo">
                <span /> API SOURCE · PERSISTED MANUAL REVIEW · EVENT FEED UNAVAILABLE
              </div>
            )}
            {!isDemo && manualReviews.isLoading ? (
              <div className="notification-empty" role="status">
                Checking persisted manual-review cases…
              </div>
            ) : !isDemo && manualReviews.isError ? (
              <div className="notification-empty" role="alert">
                Manual-review notifications could not be loaded.
              </div>
            ) : !isDemo && manualReviews.data?.availability === 'unavailable' ? (
              <div className="notification-empty" role="status">
                {manualReviews.data.reason}
              </div>
            ) : !isDemo && !allowApiRead ? (
              <div className="notification-empty" role="status">
                Sign in to view authorized dashboard notifications.
              </div>
            ) : activeAlerts.length > 0 ? (
              <div className="notification-list">
                {activeAlerts.map((alert) => {
                  const isRead = readIds.has(alert.id)
                  return (
                    <button
                      type="button"
                      key={alert.id}
                      className={`notification-item ${alert.level} ${isRead ? 'is-read' : 'is-unread'}`}
                      onClick={() => openActivity(alert)}
                    >
                      <span className="notification-level">
                        <LevelIcon level={alert.level} />
                      </span>
                      <span className="notification-copy">
                        <strong>{alert.title}</strong>
                        <small>{alert.detail}</small>
                        <time dateTime={alert.at}>{ago(alert.at)}</time>
                      </span>
                      {!isRead && <span className="notification-unread-dot" aria-label="Unread" />}
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="notification-empty" role="status">
                <CheckCheck size={20} />
                <strong>No active notifications</strong>
                <span>
                  {isDemo
                    ? 'New operational alerts will appear here.'
                    : 'No unresolved manual-review cases. The system event feed is not exposed by the current API.'}
                </span>
              </div>
            )}
            <footer className="notification-footer">
              <button type="button" onClick={markAllRead} disabled={!unreadCount}>
                <Check size={13} /> Mark all read
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  navigate('/monitoring')
                }}
              >
                View activity <span aria-hidden="true">→</span>
              </button>
            </footer>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  )
}
