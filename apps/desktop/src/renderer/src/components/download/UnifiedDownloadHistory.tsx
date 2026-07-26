import { Button } from '@renderer/components/ui/button'
import { CardContent, CardHeader } from '@renderer/components/ui/card'
import { Checkbox } from '@renderer/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { cn } from '@renderer/lib/utils'
import { useVirtualizer } from '@tanstack/react-virtual'
import { DownloadEmptyState } from '@vidbee/ui/components/ui/download-empty-state'
import {
  DownloadFilterBar,
  type DownloadFilterItem
} from '@vidbee/ui/components/ui/download-filter-bar'
import { useAtomValue, useSetAtom } from 'jotai'
import { type ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  buildFilePathCandidates,
  normalizeSavedFileName
} from '../../../../shared/utils/download-file'
import { useHistorySync } from '../../hooks/use-history-sync'
import { ipcServices } from '../../lib/ipc'
import type { DownloadRecord } from '../../store/downloads'
import {
  downloadStatsAtom,
  downloadsArrayAtom,
  hasLoadedHistoryAtom,
  isHistoryLoadingAtom,
  removeHistoryRecordsAtom,
  removeHistoryRecordsByPlaylistAtom
} from '../../store/downloads'
import { settingsAtom } from '../../store/settings'
import { DownloadDialog } from './DownloadDialog'
import { DownloadItem } from './DownloadItem'
import { PlaylistGroupHeader, savePlaylistExpandedState } from './PlaylistDownloadGroup'

type StatusFilter = 'all' | 'active' | 'completed' | 'error'
type ConfirmAction =
  | { type: 'delete-selected'; ids: string[] }
  | { type: 'delete-playlist'; playlistId: string; title: string; ids: string[] }

const tryFileOperation = async (
  paths: string[],
  operation: (filePath: string) => Promise<boolean>
): Promise<boolean> => {
  for (const filePath of paths) {
    const success = await operation(filePath)
    if (success) {
      return true
    }
  }
  return false
}

const getSavedFileExtension = (fileName?: string): string | undefined => {
  const normalized = normalizeSavedFileName(fileName)
  if (!normalized) {
    return undefined
  }
  if (!normalized.includes('.')) {
    return undefined
  }
  const ext = normalized.split('.').pop()
  return ext?.toLowerCase()
}

const resolveDownloadExtension = (download: DownloadRecord): string => {
  const savedExt = getSavedFileExtension(download.savedFileName)
  if (savedExt) {
    return savedExt
  }
  const selectedExt = download.selectedFormat?.ext?.toLowerCase()
  if (selectedExt) {
    return selectedExt
  }
  return download.type === 'audio' ? 'mp3' : 'mp4'
}

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target && target instanceof HTMLElement)) {
    return false
  }
  if (target.isContentEditable) {
    return true
  }
  const tagName = target.tagName
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT'
}

interface UnifiedDownloadHistoryProps {
  topContent?: ReactNode
  onOpenSupportedSites?: () => void
  onOpenSettings?: () => void
  onOpenCookiesSettings?: () => void
}

const SKELETON_KEYS = ['sk-1', 'sk-2', 'sk-3']

function HistorySkeletonList() {
  return (
    <div className="space-y-3 px-6 py-2">
      {SKELETON_KEYS.map((key) => (
        <div
          className="flex h-24 w-full animate-pulse items-center justify-between gap-4 rounded-xl border border-border/40 bg-muted/30 p-4"
          key={key}
        >
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 shrink-0 rounded-lg bg-muted/60" />
            <div className="space-y-2">
              <div className="h-4 w-48 rounded bg-muted/60" />
              <div className="h-3 w-32 rounded bg-muted/40" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-8 w-20 rounded-lg bg-muted/50" />
            <div className="h-8 w-8 rounded-lg bg-muted/50" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function UnifiedDownloadHistory({
  topContent,
  onOpenSupportedSites,
  onOpenSettings,
  onOpenCookiesSettings
}: UnifiedDownloadHistoryProps) {
  const { t } = useTranslation()
  const allRecords = useAtomValue(downloadsArrayAtom)
  const isHistoryLoading = useAtomValue(isHistoryLoadingAtom)
  const hasLoadedHistory = useAtomValue(hasLoadedHistoryAtom)
  const [isTransitionLoading, setIsTransitionLoading] = useState(false)
  const showSkeleton =
    isHistoryLoading || isTransitionLoading || (!hasLoadedHistory && allRecords.length === 0)

  useEffect(() => {
    setIsTransitionLoading(true)
    const timer = setTimeout(() => {
      setIsTransitionLoading(false)
    }, 150)
    return () => clearTimeout(timer)
  }, [])
  const downloadStats = useAtomValue(downloadStatsAtom)
  const removeHistoryRecords = useSetAtom(removeHistoryRecordsAtom)
  const removeHistoryRecordsByPlaylist = useSetAtom(removeHistoryRecordsByPlaylistAtom)
  const settings = useAtomValue(settingsAtom)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [confirmBusy, setConfirmBusy] = useState(false)
  const [alsoDeleteFiles, setAlsoDeleteFiles] = useState(false)
  const alsoDeleteFilesId = useId()
  const hasCookieConfig = useMemo(() => {
    const cookiesPath = settings.cookiesPath?.trim()
    if (cookiesPath) {
      return true
    }
    const browserSetting = settings.browserForCookies?.trim()
    return Boolean(browserSetting && browserSetting !== 'none')
  }, [settings.browserForCookies, settings.cookiesPath])
  const showCookiesTip = !hasCookieConfig
  const canOpenCookiesSettings = Boolean(onOpenCookiesSettings ?? onOpenSettings)

  useHistorySync()

  const historyRecords = useMemo(
    () => allRecords.filter((record) => record.entryType === 'history'),
    [allRecords]
  )
  const selectedCount = selectedIds.size

  const filteredRecords = useMemo(() => {
    return allRecords.filter((record) => {
      switch (statusFilter) {
        case 'all':
          return true
        case 'active':
          return (
            record.status === 'downloading' ||
            record.status === 'processing' ||
            record.status === 'pending'
          )
        case 'completed':
        case 'error':
          return record.status === statusFilter
        default:
          return true
      }
    })
  }, [allRecords, statusFilter])

  const visibleHistoryIds = useMemo(
    () =>
      filteredRecords.filter((record) => record.entryType === 'history').map((record) => record.id),
    [filteredRecords]
  )

  const filters: DownloadFilterItem<StatusFilter>[] = [
    { key: 'all', label: t('download.all'), count: downloadStats.total },
    { key: 'active', label: t('download.active'), count: downloadStats.active },
    { key: 'completed', label: t('download.completed'), count: downloadStats.completed },
    { key: 'error', label: t('download.error'), count: downloadStats.error }
  ]

  const selectableIds = useMemo(() => {
    if (visibleHistoryIds.length === 0) {
      return []
    }
    const ids = new Set(visibleHistoryIds)
    const playlistIds = new Set(
      filteredRecords
        .filter((record) => record.entryType === 'history' && record.playlistId)
        .map((record) => record.playlistId as string)
    )
    if (playlistIds.size === 0) {
      return Array.from(ids)
    }
    for (const record of historyRecords) {
      if (record.playlistId && playlistIds.has(record.playlistId)) {
        ids.add(record.id)
      }
    }
    return Array.from(ids)
  }, [filteredRecords, historyRecords, visibleHistoryIds])
  const selectableCount = selectableIds.length
  const visibleSelectableCount = visibleHistoryIds.length
  const selectionSummary =
    selectableCount === 0
      ? t('history.selectedCount', { count: selectedCount })
      : selectableCount > visibleSelectableCount
        ? t('history.selectedCount', { count: selectedCount })
        : t('history.selectionSummary', { selected: selectedCount, total: selectableCount })

  useEffect(() => {
    if (selectedIds.size === 0) {
      return
    }
    const historyIdSet = new Set(historyRecords.map((record) => record.id))
    setSelectedIds((prev) => {
      let changed = false
      const next = new Set<string>()
      for (const id of prev) {
        if (historyIdSet.has(id)) {
          next.add(id)
        } else {
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [historyRecords, selectedIds.size])

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const handleClearSelection = () => {
    setSelectedIds(new Set())
  }

  const handleRequestDeleteSelected = () => {
    if (selectedIds.size === 0) {
      return
    }
    setConfirmAction({ type: 'delete-selected', ids: Array.from(selectedIds) })
  }

  const handleRequestDeletePlaylist = useCallback(
    (playlistId: string, title: string, ids: string[]) => {
      if (ids.length === 0) {
        return
      }
      setConfirmAction({ type: 'delete-playlist', playlistId, title, ids })
    },
    []
  )

  const pruneSelectedIds = (ids: string[]) => {
    if (ids.length === 0) {
      return
    }
    setSelectedIds((prev) => {
      const next = new Set(prev)
      let changed = false
      ids.forEach((id) => {
        if (next.delete(id)) {
          changed = true
        }
      })
      return changed ? next : prev
    })
  }

  const confirmContent = useMemo(() => {
    if (!confirmAction) {
      return null
    }
    switch (confirmAction.type) {
      case 'delete-selected': {
        return {
          title: t('history.confirmDeleteSelectedTitle'),
          description: t('history.confirmDeleteSelectedDescription', {
            count: confirmAction.ids.length
          }),
          actionLabel: t('history.removeAction')
        }
      }
      case 'delete-playlist': {
        return {
          title: t('history.confirmDeletePlaylistTitle'),
          description: t('history.confirmDeletePlaylistDescription', {
            count: confirmAction.ids.length,
            title: confirmAction.title
          }),
          actionLabel: t('history.removeAction')
        }
      }
      default:
        return null
    }
  }, [confirmAction, t])

  const deleteHistoryFiles = async (records: DownloadRecord[]) => {
    const failedIds: string[] = []
    for (const record of records) {
      if (!record.title) {
        continue
      }
      const downloadPath = record.downloadPath || settings.downloadPath
      if (!downloadPath) {
        continue
      }
      const formatForPath = resolveDownloadExtension(record)
      const filePaths = buildFilePathCandidates(
        downloadPath,
        record.title,
        formatForPath,
        record.savedFileName
      )
      const deleted = await tryFileOperation(filePaths, (filePath) =>
        ipcServices.fs.deleteFile(filePath)
      )
      if (!deleted) {
        failedIds.push(record.id)
      }
    }
    if (failedIds.length > 0) {
      console.warn('Failed to delete some playlist files:', failedIds)
    }
  }

  const handleConfirmAction = async () => {
    if (!confirmAction) {
      return
    }
    setConfirmBusy(true)
    try {
      if (confirmAction.type === 'delete-selected') {
        await ipcServices.history.removeHistoryItems(confirmAction.ids)
        removeHistoryRecords(confirmAction.ids)
        if (alsoDeleteFiles) {
          const idSet = new Set(confirmAction.ids)
          const recordsToDelete = historyRecords.filter((record) => idSet.has(record.id))
          await deleteHistoryFiles(recordsToDelete)
        }
        pruneSelectedIds(confirmAction.ids)
        toast.success(t('notifications.itemsRemoved', { count: confirmAction.ids.length }))
      }
      if (confirmAction.type === 'delete-playlist') {
        const idSet = new Set(confirmAction.ids)
        const playlistRecords = historyRecords.filter((record) => idSet.has(record.id))
        await ipcServices.history.removeHistoryByPlaylistId(confirmAction.playlistId)
        removeHistoryRecordsByPlaylist(confirmAction.playlistId)
        await deleteHistoryFiles(playlistRecords)
        pruneSelectedIds(confirmAction.ids)
        toast.success(
          t('notifications.playlistHistoryRemoved', { count: confirmAction.ids.length })
        )
      }
      setConfirmAction(null)
      setAlsoDeleteFiles(false)
    } catch (error) {
      if (confirmAction.type === 'delete-selected') {
        console.error('Failed to remove selected history items:', error)
        toast.error(t('notifications.itemsRemoveFailed'))
      }
      if (confirmAction.type === 'delete-playlist') {
        console.error('Failed to remove playlist history:', error)
        toast.error(t('notifications.playlistHistoryRemoveFailed'))
      }
    } finally {
      setConfirmBusy(false)
    }
  }

  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(() => {
    const set = new Set<string>()
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key?.startsWith('playlist_expanded_') && localStorage.getItem(key) === 'true') {
          set.add(key.replace('playlist_expanded_', ''))
        }
      }
    } catch (error) {
      console.error('Failed to load playlist expanded states:', error)
    }
    return set
  })

  const handleToggleGroupExpand = useCallback((groupId: string) => {
    setExpandedGroupIds((prev) => {
      const next = new Set(prev)
      const isExpanded = !next.has(groupId)
      if (isExpanded) {
        next.add(groupId)
      } else {
        next.delete(groupId)
      }
      savePlaylistExpandedState(groupId, isExpanded)
      return next
    })
  }, [])

  const groupedView = useMemo(() => {
    const groups = new Map<
      string,
      { id: string; title: string; totalCount: number; records: DownloadRecord[] }
    >()

    for (const record of filteredRecords) {
      if (record.playlistId) {
        let group = groups.get(record.playlistId)
        if (!group) {
          group = {
            id: record.playlistId,
            title: record.playlistTitle || record.title,
            totalCount: record.playlistSize || 0,
            records: []
          }
          groups.set(record.playlistId, group)
        }
        group.records.push(record)
        if (!group.title && record.playlistTitle) {
          group.title = record.playlistTitle
        }
        if (!group.totalCount && record.playlistSize) {
          group.totalCount = record.playlistSize
        }
      }
    }

    for (const group of groups.values()) {
      group.records.sort((a, b) => {
        const aIndex = a.playlistIndex ?? Number.MAX_SAFE_INTEGER
        const bIndex = b.playlistIndex ?? Number.MAX_SAFE_INTEGER
        if (aIndex !== bIndex) {
          return aIndex - bIndex
        }
        return b.createdAt - a.createdAt
      })
      if (!group.totalCount) {
        group.totalCount = group.records.length
      }
    }

    type OrderItem =
      | { type: 'single'; record: DownloadRecord }
      | {
          type: 'group-header'
          groupId: string
          group: { id: string; title: string; totalCount: number; records: DownloadRecord[] }
        }
      | { type: 'group-item'; record: DownloadRecord; groupId: string }

    const order: OrderItem[] = []
    const processedGroups = new Set<string>()

    for (const record of filteredRecords) {
      if (record.playlistId) {
        if (!processedGroups.has(record.playlistId)) {
          processedGroups.add(record.playlistId)
          const group = groups.get(record.playlistId)
          if (group) {
            order.push({ type: 'group-header', groupId: record.playlistId, group })
            if (expandedGroupIds.has(record.playlistId)) {
              for (const gRecord of group.records) {
                order.push({ type: 'group-item', record: gRecord, groupId: record.playlistId })
              }
            }
          }
        }
      } else {
        order.push({ type: 'single', record })
      }
    }

    return { order, groups }
  }, [filteredRecords, expandedGroupIds])

  const scrollParentRef = useRef<HTMLDivElement>(null)

  const rowVirtualizer = useVirtualizer({
    count: groupedView.order.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: (index) => {
      const item = groupedView.order[index]
      if (item?.type === 'group-header') {
        return 52
      }
      return 110
    },
    overscan: 5
  })

  const prevStatusFilterRef = useRef(statusFilter)
  useEffect(() => {
    if (prevStatusFilterRef.current !== statusFilter) {
      prevStatusFilterRef.current = statusFilter
      if (scrollParentRef.current) {
        scrollParentRef.current.scrollTop = 0
      }
      rowVirtualizer.scrollToOffset(0)
    }
  }, [statusFilter, rowVirtualizer])

  const handleFilterChange = useCallback((filter: StatusFilter) => {
    setStatusFilter(filter)
    setIsTransitionLoading(true)
    setTimeout(() => {
      setIsTransitionLoading(false)
    }, 150)
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return
      }
      if (isEditableTarget(event.target)) {
        return
      }
      if (event.key === 'Escape') {
        if (confirmAction) {
          return
        }
        if (selectedIds.size === 0) {
          return
        }
        setSelectedIds(new Set())
        return
      }
      if (!(event.metaKey || event.ctrlKey)) {
        return
      }
      if (event.key.toLowerCase() !== 'a') {
        return
      }
      if (selectableIds.length === 0) {
        return
      }
      event.preventDefault()
      setSelectedIds(new Set(selectableIds))
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [confirmAction, selectableIds, selectedIds])

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col')}>
      <CardHeader className="z-50 gap-4 bg-background p-0 px-6 py-4 backdrop-blur">
        <DownloadFilterBar
          actions={
            <DownloadDialog
              onOpenSettings={onOpenSettings}
              onOpenSupportedSites={onOpenSupportedSites}
            />
          }
          activeFilter={statusFilter}
          filters={filters}
          onFilterChange={handleFilterChange}
        />
      </CardHeader>
      <div className="flex-1 overflow-y-auto" ref={scrollParentRef}>
        <CardContent className="w-full space-y-3 overflow-x-hidden p-0">
          {topContent}
          {showCookiesTip && (
            <div className="mx-6 mt-4 rounded-xl bg-muted/40 px-6 py-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col items-start gap-2.5">
                  <div className="space-y-1">
                    <p className="font-bold text-[10px] text-muted-foreground/70 uppercase tracking-wider">
                      {t('history.cookiesTipTitle')}
                    </p>
                    <p className="max-w-[540px] text-foreground/85 text-sm leading-relaxed">
                      <Trans
                        components={{
                          strong: <strong className="font-semibold text-foreground" />
                        }}
                        i18nKey="history.cookiesTipDescription"
                      />
                    </p>
                  </div>
                  <Button
                    className="h-8 rounded-lg px-4 font-medium text-xs"
                    disabled={!canOpenCookiesSettings}
                    onClick={() => {
                      if (onOpenCookiesSettings) {
                        onOpenCookiesSettings()
                        return
                      }
                      onOpenSettings?.()
                    }}
                    size="sm"
                    variant="secondary"
                  >
                    {t('history.cookiesTipCta')}
                  </Button>
                </div>
              </div>
            </div>
          )}
          {showSkeleton ? (
            <HistorySkeletonList />
          ) : filteredRecords.length === 0 ? (
            <DownloadEmptyState message={t('download.noItems')} />
          ) : (
            <div
              className="relative w-full pb-4"
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const item = groupedView.order[virtualRow.index]
                if (!item) {
                  return null
                }
                const key =
                  item.type === 'single'
                    ? `single:${item.record.entryType}:${item.record.id}`
                    : item.type === 'group-header'
                      ? `header:${item.groupId}`
                      : `item:${item.groupId}:${item.record.entryType}:${item.record.id}`

                return (
                  <div
                    data-index={virtualRow.index}
                    key={key}
                    ref={rowVirtualizer.measureElement}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`
                    }}
                  >
                    {item.type === 'single' ? (
                      <DownloadItem
                        download={item.record}
                        isSelected={selectedIds.has(item.record.id)}
                        onToggleSelect={handleToggleSelect}
                      />
                    ) : item.type === 'group-header' ? (
                      <PlaylistGroupHeader
                        groupId={item.groupId}
                        isExpanded={expandedGroupIds.has(item.groupId)}
                        onDeletePlaylist={handleRequestDeletePlaylist}
                        onToggleExpand={() => handleToggleGroupExpand(item.groupId)}
                        records={item.group.records}
                        title={item.group.title}
                        totalCount={item.group.totalCount}
                      />
                    ) : (
                      <div className="pr-2 pl-6">
                        <DownloadItem
                          download={item.record}
                          isSelected={selectedIds.has(item.record.id)}
                          onToggleSelect={handleToggleSelect}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </div>
      {selectedCount > 0 && (
        <div className="fixed bottom-4 left-1/2 z-40 w-[calc(100%-2rem)] -translate-x-1/2 sm:right-6 sm:left-auto sm:w-auto sm:translate-x-0">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-full border border-border/50 bg-background/80 py-2 pr-2 pl-5 shadow-lg backdrop-blur">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground text-xs">{selectionSummary}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                className="h-8 rounded-full px-3"
                onClick={handleClearSelection}
                size="sm"
                variant="ghost"
              >
                {t('history.clearSelection')}
              </Button>
              <Button
                className="h-8 rounded-full px-3"
                onClick={handleRequestDeleteSelected}
                size="sm"
                variant="destructive"
              >
                {t('history.deleteSelected')}
              </Button>
            </div>
          </div>
        </div>
      )}
      <Dialog
        onOpenChange={(open) => {
          if (!(open || confirmBusy)) {
            setConfirmAction(null)
            setAlsoDeleteFiles(false)
          }
        }}
        open={Boolean(confirmAction)}
      >
        {confirmContent && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{confirmContent.title}</DialogTitle>
              <DialogDescription>{confirmContent.description}</DialogDescription>
            </DialogHeader>
            {confirmAction?.type === 'delete-selected' && (
              <div className="flex items-center space-x-2">
                <Checkbox
                  checked={alsoDeleteFiles}
                  id={alsoDeleteFilesId}
                  onCheckedChange={(checked) => setAlsoDeleteFiles(checked === true)}
                />
                <label
                  className="cursor-pointer font-medium text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  htmlFor={alsoDeleteFilesId}
                >
                  {t('history.alsoDeleteFiles')}
                </label>
              </div>
            )}
            <DialogFooter>
              <Button
                disabled={confirmBusy}
                onClick={() => {
                  setConfirmAction(null)
                  setAlsoDeleteFiles(false)
                }}
                variant="outline"
              >
                {t('download.cancel')}
              </Button>
              <Button disabled={confirmBusy} onClick={handleConfirmAction} variant="destructive">
                {confirmContent.actionLabel}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}
