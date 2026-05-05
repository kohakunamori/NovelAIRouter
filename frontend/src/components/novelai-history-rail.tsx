import { useState } from "react"

import Image from "next/image"

import { NovelAIArrowRightIcon, NovelAIHelpIcon, NovelAIHistoryIcon } from "@/components/icons"
import { cn } from "@/lib/utils"
import type { GenerationRun, WorkspaceStage } from "@/types/novelai"

interface NovelAIHistoryRailProps {
  hidden: boolean
  onApplyHistorySettings: (id: string) => void
  onClearHistory: () => void
  onSelectRun: (id: string) => void
  onToggleHidden: () => void
  runs: GenerationRun[]
  selectedRunId: string | null
  stage: WorkspaceStage
}

export function NovelAIHistoryRail({
  hidden,
  onApplyHistorySettings,
  onClearHistory,
  onSelectRun,
  onToggleHidden,
  runs,
  selectedRunId,
  stage,
}: NovelAIHistoryRailProps) {
  const [isDownloadingZip, setIsDownloadingZip] = useState(false)
  const isCompact = runs.length === 0 && stage === "gallery"

  const handleDownloadZip = async () => {
    if (isDownloadingZip) {
      return
    }

    setIsDownloadingZip(true)
    try {
      const zip = await createHistoryZip(runs)
      downloadBlob(zip, `novelai-history-${formatZipTimestamp(new Date())}.zip`)
    } catch {
      window.alert("Failed to download history ZIP.")
    } finally {
      setIsDownloadingZip(false)
    }
  }

  return (
    <>
      <button
        aria-hidden={!hidden}
        aria-label="Open history"
        className={cn(
          "fixed top-5 right-5 z-20 flex h-[34px] w-[34px] items-center justify-center rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(25,27,49)] text-white shadow-[0_0_0_1px_rgba(34,37,63,0.65)] transition-[opacity,transform] duration-200 ease-out",
          hidden ? "pointer-events-auto opacity-100 translate-x-0" : "pointer-events-none opacity-0 translate-x-2"
        )}
        onClick={onToggleHidden}
        tabIndex={hidden ? 0 : -1}
        type="button"
      >
        <NovelAIHistoryIcon className="h-[14px] w-[14px] text-white/85" />
      </button>

      <aside
        aria-hidden={hidden}
        className={cn(
          "relative h-screen shrink-0 overflow-visible bg-[rgb(19,21,44)] text-white transition-[width,opacity,transform] duration-200 ease-out will-change-transform",
          hidden ? "w-0 opacity-0 translate-x-2" : "w-[140px] opacity-100 translate-x-0"
        )}
      >
        <div className={cn("flex h-full w-[140px] flex-col transition-[opacity,transform] duration-200 ease-out", hidden ? "pointer-events-none opacity-0 translate-x-3" : "opacity-100 translate-x-0")}>
          <div className="flex items-center justify-between px-5 pt-5">
            <div className={cn("flex items-center gap-1", isCompact ? "text-[12px] leading-4 text-white/85" : "text-[16px] leading-6")}>
              <span>History</span>
              <div className="group relative flex items-center">
                <NovelAIHelpIcon className="h-[14px] w-[14px] opacity-45 transition-opacity group-hover:opacity-85" />
                <div className="pointer-events-none absolute right-[calc(100%+10px)] top-1/2 z-30 hidden w-[230px] -translate-y-1/2 rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(25,27,49)] px-3 py-2 text-[12px] leading-[18px] text-white/80 shadow-[0_10px_30px_rgba(0,0,0,0.35)] group-hover:block">
                  Ctrl+Click on an image to set your settings to the ones used to generate it (except for any init image).
                </div>
              </div>
            </div>
            <button className="flex h-[34px] w-[34px] items-center justify-center text-white" onClick={onToggleHidden} tabIndex={hidden ? -1 : 0} type="button">
              <NovelAIArrowRightIcon className="h-[14px] w-[8px] text-white" />
            </button>
          </div>

          <div className={isCompact ? "mt-5 flex-1 border-l border-white/5" : "scrollbar-thin mt-5 flex-1 overflow-y-auto border-l border-white/5 px-5 pb-6"}>
            {!isCompact ? (
              <>
                <div className="space-y-3">
                  {runs.map((run) => {
                    const thumbnail = run.results[0]
                    if (!thumbnail) {
                      return null
                    }

                    return (
                      <button
                        key={run.id}
                        className={selectedRunId === run.id ? "relative block h-[94px] w-full overflow-hidden rounded-[3px] border border-[rgb(245,243,194)] bg-[rgb(25,27,49)] transition-transform duration-150 ease-out hover:scale-[1.018]" : "relative block h-[94px] w-full overflow-hidden rounded-[3px] border border-[rgb(34,37,63)] bg-[rgb(25,27,49)] transition-transform duration-150 ease-out hover:scale-[1.018]"}
                        onClick={(event) => {
                          if (event.ctrlKey || event.metaKey) {
                            onApplyHistorySettings(run.id)
                            return
                          }
                          onSelectRun(run.id)
                        }}
                        tabIndex={hidden ? -1 : 0}
                        type="button"
                      >
                        <Image alt="choose image" className="object-cover" fill sizes="94px" src={thumbnail.asset.src} unoptimized />
                        {run.results.length > 1 ? <div className="absolute right-1.5 bottom-1.5 rounded-[3px] bg-black/50 px-1.5 py-0.5 text-[11px] text-white">x{run.results.length}</div> : null}
                      </button>
                    )
                  })}
                </div>

                {runs.length > 0 ? (
                  <div className="mt-4 space-y-2 text-sm text-white/85">
                    <button className="flex items-center gap-2 whitespace-nowrap disabled:cursor-wait disabled:text-white/45" disabled={isDownloadingZip} onClick={handleDownloadZip} tabIndex={hidden ? -1 : 0} type="button">
                      {isDownloadingZip ? "Preparing ZIP" : "Download ZIP"}
                    </button>
                    <button className="flex items-center gap-2 whitespace-nowrap" onClick={onClearHistory} tabIndex={hidden ? -1 : 0} type="button">
                      Clear History
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </aside>
    </>
  )
}

interface HistoryZipSource {
  name: string
  src: string
}

type ZipBytes = Uint8Array<ArrayBuffer>

interface ZipEntry {
  nameBytes: ZipBytes
  data: ZipBytes
  crc32: number
  dosTime: number
  dosDate: number
}

const crc32Table = buildCrc32Table()

async function createHistoryZip(runs: GenerationRun[]) {
  const timestamp = getDosTimestamp(new Date())
  const sources = runs.flatMap((run, runIndex) =>
    run.results.map((result, resultIndex) => ({
      src: result.asset.src,
      name: `${formatZipSegment(`run-${runIndex + 1}`, run.id)}/${formatZipSegment(`image-${resultIndex + 1}`, result.id)}.${getImageExtension(result.asset.src)}`,
    }))
  )

  const entries = await Promise.all(
    sources.map(async (source) => {
      const response = await fetch(source.src)
      if (!response.ok) {
        throw new Error("Failed to fetch history image.")
      }
      const blob = await response.blob()
      const data = new Uint8Array(await blob.arrayBuffer())
      return createZipEntry({ ...source, name: replaceZipExtension(source.name, blob.type), data, timestamp })
    })
  )

  return createZipBlob(entries)
}

function createZipEntry({
  data,
  name,
  timestamp,
}: HistoryZipSource & { data: ZipBytes; timestamp: ReturnType<typeof getDosTimestamp> }): ZipEntry {
  return {
    nameBytes: toZipBytes(new TextEncoder().encode(name)),
    data,
    crc32: getCrc32(data),
    dosTime: timestamp.time,
    dosDate: timestamp.date,
  }
}

function createZipBlob(entries: ZipEntry[]) {
  const localParts: ZipBytes[] = []
  const centralParts: ZipBytes[] = []
  let localOffset = 0

  for (const entry of entries) {
    const localHeader = createLocalFileHeader(entry)
    localParts.push(localHeader, entry.data)
    centralParts.push(createCentralDirectoryHeader(entry, localOffset))
    localOffset += localHeader.byteLength + entry.data.byteLength
  }

  const centralOffset = localOffset
  const centralSize = centralParts.reduce((total, part) => total + part.byteLength, 0)
  const endRecord = createEndOfCentralDirectoryRecord(entries.length, centralSize, centralOffset)
  const archive = concatZipBytes([...localParts, ...centralParts, endRecord])

  return new Blob([archive], { type: "application/zip" })
}

function createLocalFileHeader(entry: ZipEntry) {
  const header = new Uint8Array(new ArrayBuffer(30 + entry.nameBytes.byteLength))
  const view = new DataView(header.buffer)
  view.setUint32(0, 0x04034b50, true)
  view.setUint16(4, 20, true)
  view.setUint16(6, 0x0800, true)
  view.setUint16(8, 0, true)
  view.setUint16(10, entry.dosTime, true)
  view.setUint16(12, entry.dosDate, true)
  view.setUint32(14, entry.crc32, true)
  view.setUint32(18, entry.data.byteLength, true)
  view.setUint32(22, entry.data.byteLength, true)
  view.setUint16(26, entry.nameBytes.byteLength, true)
  view.setUint16(28, 0, true)
  header.set(entry.nameBytes, 30)
  return header
}

function createCentralDirectoryHeader(entry: ZipEntry, localOffset: number) {
  const header = new Uint8Array(new ArrayBuffer(46 + entry.nameBytes.byteLength))
  const view = new DataView(header.buffer)
  view.setUint32(0, 0x02014b50, true)
  view.setUint16(4, 20, true)
  view.setUint16(6, 20, true)
  view.setUint16(8, 0x0800, true)
  view.setUint16(10, 0, true)
  view.setUint16(12, entry.dosTime, true)
  view.setUint16(14, entry.dosDate, true)
  view.setUint32(16, entry.crc32, true)
  view.setUint32(20, entry.data.byteLength, true)
  view.setUint32(24, entry.data.byteLength, true)
  view.setUint16(28, entry.nameBytes.byteLength, true)
  view.setUint16(30, 0, true)
  view.setUint16(32, 0, true)
  view.setUint16(34, 0, true)
  view.setUint16(36, 0, true)
  view.setUint32(38, 0, true)
  view.setUint32(42, localOffset, true)
  header.set(entry.nameBytes, 46)
  return header
}

function createEndOfCentralDirectoryRecord(entryCount: number, centralSize: number, centralOffset: number) {
  const record = new Uint8Array(new ArrayBuffer(22))
  const view = new DataView(record.buffer)
  view.setUint32(0, 0x06054b50, true)
  view.setUint16(4, 0, true)
  view.setUint16(6, 0, true)
  view.setUint16(8, entryCount, true)
  view.setUint16(10, entryCount, true)
  view.setUint32(12, centralSize, true)
  view.setUint32(16, centralOffset, true)
  view.setUint16(20, 0, true)
  return record
}

function concatZipBytes(parts: ZipBytes[]) {
  const byteLength = parts.reduce((total, part) => total + part.byteLength, 0)
  const bytes = new Uint8Array(new ArrayBuffer(byteLength))
  let offset = 0

  for (const part of parts) {
    bytes.set(part, offset)
    offset += part.byteLength
  }

  return bytes
}

function toZipBytes(bytes: Uint8Array) {
  const zipBytes = new Uint8Array(new ArrayBuffer(bytes.byteLength))
  zipBytes.set(bytes)
  return zipBytes
}

function buildCrc32Table() {
  const table = new Uint32Array(256)
  for (let index = 0; index < table.length; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value >>> 0
  }
  return table
}

function getCrc32(data: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of data) {
    crc = crc32Table[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function getDosTimestamp(date: Date) {
  const year = Math.min(Math.max(date.getFullYear(), 1980), 2107)
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  }
}

function formatZipTimestamp(date: Date) {
  return date.toISOString().replace(/[:.]/g, "-")
}

function formatZipSegment(prefix: string, value: string) {
  const normalized = value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80)
  return `${prefix}-${normalized || "item"}`
}

function getImageExtension(src: string) {
  const match = src.split("?")[0]?.toLowerCase().match(/\.(png|jpe?g|webp|gif)$/)
  return match?.[1] === "jpeg" ? "jpg" : match?.[1] ?? "webp"
}

function replaceZipExtension(name: string, mimeType: string) {
  const extension = getImageExtensionFromMimeType(mimeType)
  return extension ? name.replace(/\.[^.]+$/, `.${extension}`) : name
}

function getImageExtensionFromMimeType(mimeType: string) {
  if (mimeType === "image/png") return "png"
  if (mimeType === "image/jpeg") return "jpg"
  if (mimeType === "image/webp") return "webp"
  if (mimeType === "image/gif") return "gif"
  return null
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
