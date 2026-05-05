import { useEffect, useMemo, useRef, useState } from "react"

import Image from "next/image"

import { QuickstartStarsIcon } from "@/components/icons"
import { cn } from "@/lib/utils"
import type { QuickstartSample } from "@/types/novelai"

interface NovelAIQuickstartGalleryProps {
  copiedSampleId: string | null
  columnCount: 2 | 3
  isDesktopShell: boolean
  onSelect: (sample: QuickstartSample) => void
  orderSeed: string
  samples: QuickstartSample[]
}

export function NovelAIQuickstartGallery({
  copiedSampleId,
  columnCount,
  isDesktopShell,
  onSelect,
  orderSeed,
  samples,
}: NovelAIQuickstartGalleryProps) {
  const usesThreeColumns = columnCount === 3
  const shuffledSamples = useMemo(() => getDailyShuffledSamples(samples, orderSeed), [samples, orderSeed])
  const columns = partitionSamples(shuffledSamples, columnCount)

  return (
    <section
      className={cn(
        "quickstart-gallery relative h-screen min-w-0 flex-1 overflow-hidden bg-[rgb(19,21,44)]",
        isDesktopShell && "border-l border-white/5 border-r border-white/5"
      )}
    >
      <div
        className={cn(
          "sc-e07a267c-0 scrollbar-thin relative h-full overflow-y-auto",
          isDesktopShell ? "px-10 pb-10" : "px-[10px] pb-28 pt-20 sm:px-6"
        )}
      >
        <div className={isDesktopShell ? "h-[120px]" : usesThreeColumns ? "h-[88px]" : "h-[52px]"} />

        <div className="relative flex items-center justify-center">
          {isDesktopShell ? (
            <div className="pointer-events-none absolute top-[-85px] pl-[70px]">
              <QuickstartStarsIcon className="w-[691px] text-[rgb(245,243,194)]" />
            </div>
          ) : null}
        </div>

        <div className={cn("relative mx-auto text-center", isDesktopShell ? "max-w-[796px]" : "max-w-full")}>
          <div className="font-heading text-[20px] font-bold leading-[30px] text-[rgb(245,243,194)]">Get Started</div>
          <p className="text-[16px] leading-6 text-white/70">Get Inspiration from our quick start gallery!</p>
          <p className="mt-[35px] text-[16px] leading-6 text-white/70">Click an image to copy the prompt.</p>
        </div>

        <div className={isDesktopShell ? "h-[60px]" : usesThreeColumns ? "h-[36px]" : "h-[28px]"} />

        <div className={cn("mx-auto", isDesktopShell ? "max-w-[796px]" : "w-full")}>
          <div className={cn("grid", usesThreeColumns ? "grid-cols-3 gap-1" : "grid-cols-2 gap-1.5")}>
            {columns.map((column, columnIndex) => (
              <div
                key={columnIndex}
                className={getColumnClassName({ columnCount, columnIndex, isDesktopShell })}
              >
                {column.map((sample, index) => (
                  <GalleryCard
                    key={sample.id}
                    copiedSampleId={copiedSampleId}
                    hoverScaleClass={usesThreeColumns && columnIndex === 1 ? "group-hover:scale-[1.018]" : "group-hover:scale-[1.012]"}
                    index={index}
                    onSelect={onSelect}
                    sample={sample}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

interface GalleryCardProps {
  copiedSampleId: string | null
  hoverScaleClass?: string
  index: number
  onSelect: (sample: QuickstartSample) => void
  sample: QuickstartSample
}

function GalleryCard({ copiedSampleId, hoverScaleClass = "group-hover:scale-[1.012]", index, onSelect, sample }: GalleryCardProps) {
  const cardRef = useRef<HTMLButtonElement | null>(null)
  const usesDistinctPreviewImage = sample.previewImageSrc !== sample.imageSrc
  const [shouldLoadFullImage, setShouldLoadFullImage] = useState(index === 0)
  const [isFullImageLoaded, setIsFullImageLoaded] = useState(index === 0 && !usesDistinctPreviewImage)

  useEffect(() => {
    const card = cardRef.current
    if (!card || shouldLoadFullImage) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) {
          return
        }
        setShouldLoadFullImage(true)
        observer.disconnect()
      },
      { rootMargin: "240px 0px" }
    )

    observer.observe(card)
    return () => observer.disconnect()
  }, [shouldLoadFullImage])

  const isCopied = copiedSampleId === sample.id

  return (
    <div className="sc-e07a267c-4 gczPII">
      <button
        aria-label={`Copy prompt from quickstart sample ${sample.id}`}
        className="sc-2f2fb315-2 kKotZl group relative block w-full overflow-hidden rounded-[8px] text-left focus:outline-none"
        onClick={() => onSelect(sample)}
        ref={cardRef}
        type="button"
      >
        <div className={cn("relative aspect-[547/800] origin-center overflow-hidden rounded-[8px] bg-[rgb(25,27,49)] transition-transform duration-150 ease-out", hoverScaleClass)}>
          <span className="absolute inset-0 block h-full w-full">
            <Image
              alt=""
              className={cn(
                "rounded-[8px] object-cover transition-opacity duration-300",
                shouldLoadFullImage && isFullImageLoaded ? "opacity-0" : "opacity-100"
              )}
              fill
              preload={index === 0}
              sizes="(min-width: 900px) 243px, 33vw"
              src={sample.previewImageSrc}
              unoptimized
            />
            <div
              className={cn(
                "pointer-events-none absolute inset-0 rounded-[8px] backdrop-blur-[5px] transition-opacity duration-300",
                shouldLoadFullImage && isFullImageLoaded ? "opacity-0" : "opacity-100"
              )}
            />
          </span>
          <span className="absolute inset-0 block h-full w-full">
            {shouldLoadFullImage ? (
              <Image
                alt=""
                className={cn("rounded-[8px] object-cover transition-opacity duration-300", isFullImageLoaded ? "opacity-100" : "opacity-0")}
                fill
                onLoad={() => setIsFullImageLoaded(true)}
                preload={index === 0}
                sizes="(min-width: 900px) 243px, 33vw"
                src={sample.imageSrc}
                unoptimized
              />
            ) : null}
          </span>
          <span
            className={cn(
              "sc-e07a267c-5 jgnHeS pointer-events-none absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-full bg-[rgb(25,27,49)]/80 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm transition-opacity duration-200",
              isCopied ? "opacity-100" : "opacity-0"
            )}
          >
            Copied!
          </span>
          <div className="pointer-events-none absolute inset-0 z-10 rounded-[8px] ring-1 ring-white/5" />
        </div>
      </button>
    </div>
  )
}

function getColumnClassName({
  columnCount,
  columnIndex,
  isDesktopShell,
}: {
  columnCount: 2 | 3
  columnIndex: number
  isDesktopShell: boolean
}) {
  if (columnCount === 2) {
    return columnIndex === 0 ? "flex flex-col gap-1.5 pt-2" : "-mt-4 flex flex-col gap-1.5"
  }

  if (isDesktopShell) {
    return columnIndex === 0 ? "flex flex-col gap-1 pt-12" : columnIndex === 1 ? "flex flex-col gap-1" : "flex flex-col gap-1 pt-6"
  }

  return columnIndex === 0 ? "flex flex-col gap-1 pt-6" : columnIndex === 1 ? "flex flex-col gap-1" : "flex flex-col gap-1 pt-3"
}

function partitionSamples(samples: QuickstartSample[], columnCount: number) {
  const columns = Array.from({ length: columnCount }, () => [] as QuickstartSample[])
  samples.forEach((sample, index) => {
    columns[index % columnCount].push(sample)
  })
  return columns
}

function getDailyShuffledSamples(samples: QuickstartSample[], orderSeed: string) {
  const date = new Date()
  const seedText = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}:${orderSeed}`
  let seed = 0

  for (const character of seedText) {
    seed = (seed * 31 + character.charCodeAt(0)) >>> 0
  }

  const shuffled = [...samples]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0
    const targetIndex = seed % (index + 1)
    ;[shuffled[index], shuffled[targetIndex]] = [shuffled[targetIndex], shuffled[index]]
  }

  return shuffled
}
