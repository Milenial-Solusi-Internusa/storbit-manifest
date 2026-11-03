// supabase/functions/sync-visit-calendar/calendar-client.ts
// Pembungkus tipis REST Google Calendar API v3 + satu helper retry bersama,
// dipakai KEDUA sisi (token exchange di google-auth.ts DAN panggilan Calendar
// di bawah) -- satu tempat untuk logika retry supaya perilakunya konsisten
// di seluruh pemanggilan HTTP keluar milik fungsi ini.
//
// Cakupan: getEvent + insertEvent + updateEvent + deleteEvent (deleteEvent
// ditambahkan Fase 2b -- penanganan visit cancelled/deleted dan pindah
// pemilik, lihat sync-planner.ts untuk keputusan kapan masing-masing dipakai).

import type { GoogleEventBody } from './event-builder.ts'

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Retry SEKALI khusus 429 atau 5xx -- pola PERSIS notify-prf-space (tunggu
// ~1,5 detik, coba sekali lagi, status lain langsung dilaporkan apa adanya).
// Dipakai SEMUA panggilan HTTP keluar fungsi ini, termasuk token exchange
// (lihat google-auth.ts).
export async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  let res = await fetch(url, init)
  if (res.status === 429 || res.status >= 500) {
    await sleep(1500)
    res = await fetch(url, init)
  }
  return res
}

function authHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
}

function eventUrl(calendarId: string, eventId: string): string {
  return `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`
}

export function getEvent(accessToken: string, calendarId: string, eventId: string): Promise<Response> {
  return fetchWithRetry(eventUrl(calendarId, eventId), {
    method: 'GET',
    headers: authHeaders(accessToken),
  })
}

// events.insert -- id DIKIRIM di body (deterministik, lihat event-builder.ts
// deterministicEventId()), sendUpdates=none supaya NOL email undangan keluar
// ke siapa pun (koreksi Mas #10, ditegakkan di sini DAN di event-builder.ts
// yang tak pernah mengisi field attendees sama sekali -- dua lapis).
export function insertEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  body: GoogleEventBody,
): Promise<Response> {
  const url = `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=none`
  return fetchWithRetry(url, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ ...body, id: eventId }),
  })
}

// events.update (koreksi Mas #1): PUT badan PENUH, BUKAN PATCH -- PATCH dari
// event sehari-penuh (start.date) ke event ber-jam (start.dateTime) bisa
// meninggalkan kedua field tercampur dan Google membalas 400. PUT mengganti
// seluruh resource, nol sisa field lama yang tak relevan.
export function updateEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  body: GoogleEventBody,
): Promise<Response> {
  const url = `${eventUrl(calendarId, eventId)}?sendUpdates=none`
  return fetchWithRetry(url, {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify(body),
  })
}

// events.delete -- dipakai Fase 2b (visit cancelled/deleted_at terisi, dan
// langkah "hapus di identitas lama" saat pindah pemilik). 404/410
// diperlakukan sebagai BERHASIL oleh pemanggil (lihat sync-planner.ts
// planFallback -- bukan diputuskan di sini, fungsi ini murni pembungkus
// HTTP apa adanya).
export function deleteEvent(accessToken: string, calendarId: string, eventId: string): Promise<Response> {
  const url = `${eventUrl(calendarId, eventId)}?sendUpdates=none`
  return fetchWithRetry(url, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  })
}
