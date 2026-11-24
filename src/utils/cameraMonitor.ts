// ── Camera Health & Tamper Monitor ───────────────────────────────────────────
// Detects black frames, covered/obstructed lenses, muted/ended tracks, and
// disconnected camera streams for both Interview and Quiz proctoring.

export type CameraBlockReason =
  | 'permission_denied'
  | 'track_ended'
  | 'track_muted'
  | 'black_frame'
  | 'obstructed_frame'

export interface CameraHealthResult {
  ok: boolean
  reason?: CameraBlockReason
  message?: string
}

const SAMPLE_W = 64
const SAMPLE_H = 48

let sharedCanvas: HTMLCanvasElement | null = null

function getSampleContext(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null
  if (!sharedCanvas) {
    sharedCanvas = document.createElement('canvas')
    sharedCanvas.width = SAMPLE_W
    sharedCanvas.height = SAMPLE_H
  }
  return sharedCanvas.getContext('2d', { willReadFrequently: true })
}

/**
 * Inspects the active MediaStream and HTMLVideoElement for camera
 * disconnection, mute/off state, black frames, or lens obstruction.
 */
export function checkCameraHealth(
  video: HTMLVideoElement | null,
  stream: MediaStream | null
): CameraHealthResult {
  if (!stream) {
    return {
      ok: false,
      reason: 'track_ended',
      message: 'Camera stream is disconnected or turned off',
    }
  }

  const videoTracks = stream.getVideoTracks()
  if (videoTracks.length === 0) {
    return {
      ok: false,
      reason: 'track_ended',
      message: 'No active camera video track found',
    }
  }

  const track = videoTracks[0]
  if (track.readyState !== 'live' || !track.enabled) {
    return {
      ok: false,
      reason: 'track_ended',
      message: 'Camera was turned off or interrupted',
    }
  }

  if (track.muted) {
    return {
      ok: false,
      reason: 'track_muted',
      message: 'Camera feed was muted or interrupted',
    }
  }

  if (!video) {
    return { ok: true }
  }

  if (video.ended) {
    return {
      ok: false,
      reason: 'track_ended',
      message: 'Camera video feed ended unexpectedly',
    }
  }

  if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
    return { ok: true }
  }

  const ctx = getSampleContext()
  if (!ctx) return { ok: true }

  try {
    ctx.drawImage(video, 0, 0, SAMPLE_W, SAMPLE_H)
    const pixels = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data
    const count = SAMPLE_W * SAMPLE_H

    let sum = 0
    let sumSq = 0

    for (let i = 0; i < pixels.length; i += 4) {
      const lum = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]
      sum += lum
      sumSq += lum * lum
    }

    const mean = sum / count
    const variance = Math.max(0, sumSq / count - mean * mean)
    const stdDev = Math.sqrt(variance)

    if (mean < 12) {
      return {
        ok: false,
        reason: 'black_frame',
        message: 'Camera feed went black or lens is covered',
      }
    }

    if (mean < 24 && stdDev < 6) {
      return {
        ok: false,
        reason: 'obstructed_frame',
        message: 'Camera lens appears covered or obstructed',
      }
    }

    if (stdDev < 3.5) {
      return {
        ok: false,
        reason: 'obstructed_frame',
        message: 'Camera feed is frozen or blocked (uniform frame)',
      }
    }

    return { ok: true }
  } catch {
    return { ok: true }
  }
}
