import {
  addSessionRecord,
  listSessions,
  listSessionsForStudent,
  updateSessionRecord,
} from './firestore.service'
import type { SessionRecordData } from './firestore.service'

export async function saveSession(session: SessionRecordData) {
  return addSessionRecord(session)
}

export async function loadSessions() {
  return listSessions()
}

export async function loadStudentSessions(email: string) {
  return listSessionsForStudent(email)
}

export async function saveReport(session: SessionRecordData) {
  return addSessionRecord(session)
}

export async function loadReports() {
  return listSessions()
}

export async function updateSession(id: string, updates: Partial<SessionRecordData>) {
  return updateSessionRecord(id, updates)
}
