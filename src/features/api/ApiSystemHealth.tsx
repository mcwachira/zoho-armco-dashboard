import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiMode, getJson } from '@/lib/api/client'
import { dashboardServiceHealthSchema } from './schemas'
import './api-operational-pages.css'
import './system-health.css'

function timestamp(value: string | null) {
  return value ? new Date(value).toLocaleString() : 'Not returned'
}

function Dependency({ title, status, detail }: { title: string; status: string; detail?: string }) {
  const tone =
    status === 'available' || status === 'reachable'
      ? 'good'
      : status === 'unavailable'
        ? 'bad'
        : 'warn'
  return (
    <section className="panel api-panel">
      <div className="panel-heading">
        <h2>{title}</h2>
      </div>
      <div className="system-check">
        <span className={`badge ${tone}`}>{status.replaceAll('_', ' ')}</span>
        {detail && <p>{detail}</p>}
      </div>
    </section>
  )
}

export function ApiSystemHealth() {
  const telemetry = useQuery({
    queryKey: ['middleware', 'system-health-services'],
    queryFn: ({ signal }) =>
      getJson('/api/dashboard/services', dashboardServiceHealthSchema, signal),
    enabled: apiMode === 'api',
    retry: false,
  })
  const services = telemetry.data
  const data = services?.observability
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">MONITORING</span>
          <h1>System health</h1>
          <p>
            Middleware checks and process metrics returned through the authenticated dashboard
            gateway.
          </p>
        </div>
        <button
          className="button secondary"
          type="button"
          disabled={telemetry.isFetching || apiMode !== 'api'}
          onClick={() => void telemetry.refetch()}
        >
          Refresh telemetry
        </button>
      </div>
      <div className="api-source-note" role="status">
        {apiMode !== 'api'
          ? 'Live health and telemetry are unavailable in demo mode. No sample health results are substituted.'
          : 'Checks report their own scope. Configuration, liveness and historical counters do not establish device or integration health.'}
      </div>
      <div className="api-dashboard-grid">
        {services && (
          <>
            <Dependency
              title="Middleware process"
              status={services.middlewareApi.status}
              detail={`Process uptime: ${Math.floor(services.middlewareApi.processUptimeSeconds)} seconds. Historical uptime is unavailable.`}
            />
            <Dependency
              title="Database"
              status={services.database.status}
              detail="Database connectivity reported by the middleware services read."
            />
            <Dependency
              title="Gateway"
              status={services.gateway.status}
              detail={
                services.gateway.lastSuccessfulCommunicationAt
                  ? `Last successful communication ${timestamp(services.gateway.lastSuccessfulCommunicationAt)}`
                  : 'Last successful communication unavailable.'
              }
            />
            <Dependency
              title="Zoho Books"
              status={services.zohoBooks.status}
              detail="Configured credentials do not establish upstream connectivity."
            />
            <Dependency
              title="ZFPLabServer endpoint"
              status={services.zfplabserverEndpoint.status}
            />
            <Dependency
              title="G03 communication"
              status={services.g03Communication.status}
              detail="Persisted communication evidence does not establish physical health or fiscal readiness."
            />
            <Dependency title="Physical device" status={services.physicalDevice.status} />
            <Dependency title="eTIMS" status={services.etims.status} />
          </>
        )}
      </div>
      <section className="panel api-panel system-telemetry">
        <div className="panel-heading">
          <div>
            <h2>Middleware telemetry</h2>
            <p>In-process counters and worker observations reset when middleware restarts.</p>
          </div>
        </div>
        <div className="system-check">
          {apiMode !== 'api' ? (
            <p role="status">Telemetry requires an authenticated API session.</p>
          ) : telemetry.isLoading ? (
            <p role="status">Loading middleware telemetry…</p>
          ) : null}
          {telemetry.isError && (
            <p role="alert">
              Telemetry unavailable:{' '}
              {telemetry.error instanceof Error ? telemetry.error.message : 'No verified response.'}
              {data ? ' Showing the last successful response; these values are stale.' : ''}
            </p>
          )}
          {telemetry.dataUpdatedAt > 0 && (
            <small>
              Last response received {new Date(telemetry.dataUpdatedAt).toLocaleString()}
            </small>
          )}
          <p className="api-note">
            Telemetry comes from the documented services endpoint. Queue depth and historical uptime
            are unavailable. Permission failures remain unavailable data.
          </p>
        </div>
        {services && !data && (
          <p className="system-check" role="status">
            Telemetry unavailable: no in-process metrics snapshot was returned. Missing metrics are
            not zero.
          </p>
        )}
        {data && (
          <>
            <div className="system-metric-summary">
              <div>
                <span>HTTP duration observations</span>
                <strong>{data.httpDurationMs.count}</strong>
              </div>
              <div>
                <span>Mean HTTP duration</span>
                <strong>
                  {data.httpDurationMs.count > 0
                    ? `${(data.httpDurationMs.sum / data.httpDurationMs.count).toFixed(1)} ms`
                    : 'No observations'}
                </strong>
              </div>
            </div>
            <div className="table-scroll">
              <table className="data-table api-data-table">
                <caption>Recorded process counters</caption>
                <thead>
                  <tr>
                    <th scope="col">Metric and outcome</th>
                    <th scope="col">Count since process start</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(data.counters).map(([name, value]) => (
                    <tr key={name}>
                      <th scope="row">{name.replaceAll('_', ' ')}</th>
                      <td>{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {Object.keys(data.counters).length === 0 && (
              <p className="system-check" role="status">
                No counters have been recorded by this process. Missing counters are not reported as
                zero.
              </p>
            )}
            <div className="table-scroll">
              <table className="data-table api-data-table">
                <caption>HTTP duration histogram · cumulative observations</caption>
                <thead>
                  <tr>
                    <th scope="col">Duration upper bound</th>
                    <th scope="col">Observations</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(data.httpDurationMs.buckets).map(([bound, observations]) => (
                    <tr key={bound}>
                      <th scope="row">{bound === '+Inf' ? 'All durations' : `${bound} ms`}</th>
                      <td>{observations}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-scroll">
              <table className="data-table api-data-table">
                <caption>Background workers · execution observations, not queue depth</caption>
                <thead>
                  <tr>
                    <th scope="col">Worker</th>
                    <th scope="col">Execution</th>
                    <th scope="col">Active work</th>
                    <th scope="col">Runs / failures</th>
                    <th scope="col">Consecutive failures</th>
                    <th scope="col">Last started</th>
                    <th scope="col">Last finished</th>
                    <th scope="col">Last success</th>
                    <th scope="col">Last reconciliation</th>
                    <th scope="col">Last duration</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(data.jobs).map(([name, job]) => (
                    <tr key={name}>
                      <th scope="row">{name.replaceAll('_', ' ')}</th>
                      <td>
                        <span
                          className={`badge ${job.consecutiveFailures > 0 ? 'bad' : 'neutral'}`}
                        >
                          {job.running ? 'Running' : 'Idle'}
                          {job.consecutiveFailures > 0 ? ' · recent failures' : ''}
                        </span>
                      </td>
                      <td>{job.activeWork}</td>
                      <td>
                        {job.runs} / {job.failures}
                      </td>
                      <td>{job.consecutiveFailures}</td>
                      <td>{timestamp(job.lastStartedAt)}</td>
                      <td>{timestamp(job.lastFinishedAt)}</td>
                      <td>{timestamp(job.lastSuccessAt)}</td>
                      <td>{timestamp(job.lastReconciledAt)}</td>
                      <td>
                        {job.lastDurationMs === null ? 'Not returned' : `${job.lastDurationMs} ms`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {Object.keys(data.jobs).length === 0 && (
              <p className="system-check" role="status">
                No worker observations returned. Worker configuration and queue depth are unknown.
              </p>
            )}
          </>
        )}
      </section>
      <section className="panel api-panel system-telemetry">
        <div className="panel-heading">
          <h2>Other operational signals</h2>
        </div>
        <div className="system-check">
          <p>
            Fiscal readiness and physical device health remain unverified. Events are derived from
            durable operational evidence; pending operations do not form a unified queue.
          </p>
          <div className="system-links">
            <Link to="/device">Device availability</Link>
            <Link to="/monitoring">Review and reconciliation availability</Link>
            <Link to="/events">Derived operational events</Link>
            <Link to="/operations">Pending operations</Link>
            <Link to="/requests">Inspect persisted requests</Link>
          </div>
        </div>
      </section>
    </>
  )
}
