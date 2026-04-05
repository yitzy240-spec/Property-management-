export default function AdminLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 w-40 rounded bg-muted" />
          <div className="mt-2 h-4 w-24 rounded bg-muted" />
        </div>
        <div className="h-9 w-32 rounded-md bg-muted" />
      </div>

      {/* Card skeletons */}
      <div className="grid gap-3 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-muted" />
              <div>
                <div className="h-6 w-12 rounded bg-muted" />
                <div className="mt-1 h-3 w-16 rounded bg-muted" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* List skeletons */}
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="h-4 w-32 rounded bg-muted" />
                <div className="mt-2 h-3 w-48 rounded bg-muted" />
              </div>
              <div className="h-5 w-16 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
