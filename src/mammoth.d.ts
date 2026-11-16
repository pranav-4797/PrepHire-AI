declare module 'mammoth' {
  export interface MammothResult {
    value: string
    messages: unknown[]
  }
  export function extractRawText(options: { arrayBuffer: ArrayBuffer }): Promise<MammothResult>
  export function convertToHtml(options: { arrayBuffer: ArrayBuffer }): Promise<MammothResult>
}
