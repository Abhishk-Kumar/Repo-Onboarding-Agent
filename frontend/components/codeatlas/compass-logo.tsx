import { cn } from "@/lib/utils"

export function CompassLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={cn("size-5", className)}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M15.5 8.5l-2.1 4.9-4.9 2.1 2.1-4.9 4.9-2.1z"
        fill="currentColor"
        fillOpacity="0.25"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" />
    </svg>
  )
}
