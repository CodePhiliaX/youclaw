export type OpenClawConfig = {
  channels?: Record<string, unknown>
  session?: {
    store?: string
  }
  commands?: {
    useAccessGroups?: boolean
  }
  [key: string]: unknown
}
