export default function Loading() {
  return (
    <div className="space-y-6">
      <div>
        <div className="h-8 bg-gray-200 rounded w-24 animate-pulse"></div>
        <div className="h-4 bg-gray-200 rounded w-64 mt-2 animate-pulse"></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Settings Cards Skeleton */}
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white border rounded-lg p-6">
            <div className="flex items-center mb-4">
              <div className="h-5 w-5 bg-gray-200 rounded mr-2 animate-pulse"></div>
              <div className="h-6 bg-gray-200 rounded w-32 animate-pulse"></div>
            </div>
            <div className="space-y-4">
              {[1, 2, 3, 4].map((j) => (
                <div key={j} className="flex items-center justify-between">
                  <div className="h-4 bg-gray-200 rounded w-24 animate-pulse"></div>
                  <div className="h-6 w-11 bg-gray-200 rounded-full animate-pulse"></div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
