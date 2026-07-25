import { useSetAtom } from 'jotai'
import { useEffect } from 'react'
import { ipcServices } from '../lib/ipc'
import { setHistoryRecordsAtom } from '../store/downloads'

export function useHistorySync() {
  const setHistoryRecords = useSetAtom(setHistoryRecordsAtom)

  useEffect(() => {
    let cancelled = false
    const loadHistory = async () => {
      try {
        const historyData = await ipcServices.history.getHistory()
        if (!cancelled) {
          setHistoryRecords(historyData)
        }
      } catch (error) {
        console.error('Failed to load history:', error)
      }
    }

    void loadHistory()
    return () => {
      cancelled = true
    }
  }, [setHistoryRecords])
}
