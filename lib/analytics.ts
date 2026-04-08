import posthog from "posthog-js"

export function initAnalytics() {
  if (typeof window === "undefined") return
  if (posthog.__loaded) return

  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    api_host: "https://app.posthog.com",
    capture_pageview: true,
    persistence: "localStorage"
  })
}

export function track(event: string, properties?: Record<string, unknown>) {
  if (typeof window === "undefined") return
  posthog.capture(event, properties)
}
