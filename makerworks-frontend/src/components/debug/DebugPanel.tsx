import { useUser } from '@/hooks/useUser'
import { useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'

type LogEntry = string

declare global {
  interface Window {
    __DEBUG_LOG__?: (log: LogEntry) => void
  }
}

const DebugPanel: React.FC = () => {
  const { user, isAdmin, isUser, loading } = useUser()
  const location = useLocation()
  const [logs, setLogs] = useState<LogEntry[]>([])

  useEffect(() => {
    const handleLog = (log: LogEntry) => {
      setLogs((prev) => {
        const next = [...prev, log]
        return next.length > 20 ? next.slice(-20) : next
      })
    }

    window.__DEBUG_LOG__ = handleLog

    return () => {
      delete window.__DEBUG_LOG__
    }
  }, [])

  return (
    <div className="fixed bottom-4 right-4 w-[400px] max-h-[60vh] z-[9999] overflow-hidden rounded-xl border border-zinc-300/30 dark:border-zinc-700/50 bg-white/90 dark:bg-zinc-900/90 shadow-lg backdrop-blur-md text-xs font-mono">
      <div className="p-3 border-b border-zinc-200 dark:border-zinc-700 font-semibold text-sm bg-zinc-100 dark:bg-zinc-800">
        🧪 Debug Panel
      </div>
      <div className="p-3 overflow-y-auto max-h-[40vh]">
        <div className="mb-2">
          <strong>Path:</strong> <code>{location.pathname}</code>
        </div>
        <div className="mb-2">
          <strong>User:</strong>{' '}
          <pre className="whitespace-pre-wrap text-xs">
            {user ? JSON.stringify(user, null, 2) : 'null'}
          </pre>
        </div>
        <div className="mb-2">
          <strong>Auth Flags:</strong>{' '}
          <code>
            loading={String(loading)} isUser={String(isUser)} isAdmin={String(isAdmin)}
          </code>
        </div>
        <div className="mb-2">
          <strong>Axios Log:</strong>
          <ul className="pl-4 list-disc text-zinc-700 dark:text-zinc-300">
            {logs.map((log, i) => (
              <li key={i} className="mb-1">
                {log}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

export default DebugPanel
