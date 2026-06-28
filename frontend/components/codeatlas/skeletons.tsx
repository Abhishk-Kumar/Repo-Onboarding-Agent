function Shimmer({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-secondary/60 ${className ?? ""}`} />
}

export function GraphSkeleton() {
  return (
    <div className="relative h-full w-full overflow-hidden p-6">
      <div className="absolute left-3 top-3 flex gap-1.5">
        <Shimmer className="h-7 w-44" />
      </div>
      <div className="flex h-full flex-wrap content-center items-center justify-center gap-x-24 gap-y-10">
        {Array.from({ length: 9 }).map((_, i) => (
          <Shimmer key={i} className="h-12 w-36" />
        ))}
      </div>
      <div className="absolute bottom-4 left-4">
        <Shimmer className="h-24 w-40" />
      </div>
    </div>
  )
}

export function ScanSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <Shimmer className="h-24 w-full" />
      <Shimmer className="h-4 w-32" />
      {Array.from({ length: 4 }).map((_, i) => (
        <Shimmer key={i} className="h-16 w-full" />
      ))}
    </div>
  )
}

export function ExplainSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <Shimmer key={i} className="h-24 w-full" />
      ))}
    </div>
  )
}
