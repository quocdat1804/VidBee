import { useAtom, useSetAtom } from 'jotai'
import { startTransition, useEffect } from 'react'
import { ipcServices } from '../lib/ipc'
import {
  hasLoadedHistoryAtom,
  isHistoryLoadingAtom,
  setHistoryRecordsAtom
} from '../store/downloads'

export function useHistorySync() {
  const setHistoryRecords = useSetAtom(setHistoryRecordsAtom)
  const [hasLoaded, setHasLoaded] = useAtom(hasLoadedHistoryAtom)
  const setIsHistoryLoading = useSetAtom(isHistoryLoadingAtom)

  useEffect(() => {
    if (hasLoaded) {
      setIsHistoryLoading(false)
      return
    }

    let cancelled = false
    const loadHistory = async () => {
      try {
        const historyData = await ipcServices.history.getHistory()
        if (!cancelled) {
          startTransition(() => {
            setHistoryRecords(historyData)
            setHasLoaded(true)
            setIsHistoryLoading(false)
          })
        }
      } catch (error) {
        console.error('Failed to load history:', error)
        if (!cancelled) {
          setIsHistoryLoading(false)
        }
      }
    }

    const timer = setTimeout(() => {
      void loadHistory()
    }, 0)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [hasLoaded, setHasLoaded, setHistoryRecords, setIsHistoryLoading])
}
