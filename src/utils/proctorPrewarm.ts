// ── Proctor AI Models Pre-warming & Cache Singleton ──────────────────────────
// Pre-loads TensorFlow.js WebGL backend and BlazeFace + Coco-SSD neural networks
// in the background before candidate starts the assessment, eliminating startup freezing.

let cachedBlazeFaceModel: any = null
let cachedCocoModel: any = null
let prewarmPromise: Promise<void> | null = null

export function getCachedProctorModels() {
  return {
    blazeface: cachedBlazeFaceModel,
    cocoSsd: cachedCocoModel,
  }
}

export function setCachedProctorModels(models: { blazeface?: any; cocoSsd?: any }) {
  if (models.blazeface) cachedBlazeFaceModel = models.blazeface
  if (models.cocoSsd) cachedCocoModel = models.cocoSsd
}

/**
 * Pre-warms TensorFlow WebGL backend and loads BlazeFace + Coco-SSD in the background.
 * Called when student enters the Quiz Hub or opens the public assessment link.
 */
export async function prewarmProctorModels(): Promise<void> {
  if (cachedBlazeFaceModel && cachedCocoModel) return
  if (prewarmPromise) return prewarmPromise

  prewarmPromise = (async () => {
    try {
      const tf = (window as any).tf
      const blazeface = (window as any).blazeface
      const cocoSsd = (window as any).cocoSsd

      if (tf) {
        await tf.ready()
        try {
          await tf.setBackend('webgl')
        } catch {
          // WebGL acceleration fallback
        }
      }

      const tasks: Promise<any>[] = []
      if (blazeface && !cachedBlazeFaceModel) {
        tasks.push(
          blazeface
            .load()
            .then((m: any) => {
              cachedBlazeFaceModel = m
            })
            .catch((e: any) => console.warn('BlazeFace prewarm failed:', e))
        )
      }
      if (cocoSsd && !cachedCocoModel) {
        tasks.push(
          cocoSsd
            .load()
            .then((m: any) => {
              cachedCocoModel = m
            })
            .catch((e: any) => console.warn('CocoSSD prewarm failed:', e))
        )
      }
      await Promise.all(tasks)
    } catch (err) {
      console.warn('Prewarming proctor models deferred:', err)
    } finally {
      prewarmPromise = null
    }
  })()

  return prewarmPromise
}
