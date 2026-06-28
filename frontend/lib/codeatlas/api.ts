import type { ChatMessage, ExplainPoint, RepoGraph, ScanReport } from "./types"
import * as client from "./client"

let _sessionId: string | null = null

export function setSessionId(id: string) {
  _sessionId = id
}

export function getSessionId(): string | null {
  return _sessionId
}

export async function fetchRepoGraph(): Promise<RepoGraph> {
  const sid = _sessionId
  if (!sid) throw new Error("No session ID set")
  return client.fetchRepoGraph(sid)
}

export async function fetchScanReport(): Promise<ScanReport> {
  const sid = _sessionId
  if (!sid) throw new Error("No session ID set")
  return client.fetchScanReport(sid)
}

export async function fetchExplain(): Promise<ExplainPoint[]> {
  const sid = _sessionId
  if (!sid) throw new Error("No session ID set")
  return client.fetchExplain(sid)
}

export async function sendChatMessage(history: ChatMessage[], message: string): Promise<string> {
  const sid = _sessionId
  if (!sid) throw new Error("No session ID set")
  return client.sendChatMessage(sid, history, message)
}
