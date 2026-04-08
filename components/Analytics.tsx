"use client"
import { useEffect } from "react"
import { initAnalytics } from "@/lib/analytics"

export function Analytics() {
  useEffect(() => {
    initAnalytics()
  }, [])
  return null
}
