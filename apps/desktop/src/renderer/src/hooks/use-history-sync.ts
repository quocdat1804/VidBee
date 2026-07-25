import { useSetAtom } from 'jotai'
import { startTransition, useEffect } from 'react'
import { ipcServices } from '../lib/ipc'
import { setHistoryRecordsAtom } from '../store/downloads'

let hasLoadedInitialHistory = false

export function useHistorySync() {
  const setHistoryRecords = useSetAtom(setHistoryRecordsAtom)

  useEffect(() => {
    if (hasLoadedInitialHistory) {
      return
    }

    let cancelled = false
    const loadHistory = async () => {
      try {
        const historyData = await ipcServices.history.getHistory()
        if (!cancelled) {
          startTransition(() => {
            setHistoryRecords(historyData)
            hasLoadedInitialHistory = true
          })
        }
      } catch (error) {
        console.error('Failed to load history:', error)
      }
    }

    const timer = setTimeout(() => {
      void loadHistory()
    }, 0)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [setHistoryRecords])
}
