export function PostCardSkeleton() {
  return (
    <div className="card-warm overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="skeleton w-10 h-10 !rounded-full" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-3 w-32" />
          <div className="skeleton h-2.5 w-20" />
        </div>
      </div>
      <div className="skeleton !rounded-none aspect-[4/5] w-full" />
      <div className="px-4 py-4 space-y-3">
        <div className="flex gap-4">
          <div className="skeleton h-6 w-6 !rounded-full" />
          <div className="skeleton h-6 w-6 !rounded-full" />
          <div className="skeleton h-6 w-6 !rounded-full" />
        </div>
        <div className="skeleton h-3 w-24" />
        <div className="skeleton h-3 w-full" />
        <div className="skeleton h-3 w-2/3" />
      </div>
    </div>
  );
}

export function ForgeCardSkeleton() {
  return (
    <div className="card-warm p-6 space-y-3">
      <div className="skeleton h-2.5 w-24" />
      <div className="skeleton h-6 w-3/4" />
      <div className="skeleton h-3 w-full" />
      <div className="skeleton h-3 w-full" />
      <div className="skeleton h-3 w-1/2" />
      <div className="flex gap-2 pt-2">
        <div className="skeleton h-6 w-16 !rounded-full" />
        <div className="skeleton h-6 w-16 !rounded-full" />
      </div>
    </div>
  );
}

export function RowSkeleton() {
  return (
    <div className="flex items-center gap-3">
      <div className="skeleton w-10 h-10 !rounded-full" />
      <div className="flex-1 space-y-2">
        <div className="skeleton h-3 w-28" />
        <div className="skeleton h-2.5 w-40" />
      </div>
    </div>
  );
}
