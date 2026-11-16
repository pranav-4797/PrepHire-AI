declare module 'mammoth' {
  export interface MammothResult {
    value: string
    messages: unknown[]
  }

  export interface MammothImage {
    contentType: string
    altText?: string
    read(encoding: 'base64'): Promise<string>
  }

  export namespace images {
    export function imgElement(
      func: (image: MammothImage) => Promise<{ src: string }> | { src: string }
    ): unknown
    export function inline(
      func: (image: MammothImage) => Promise<{ src: string }> | { src: string }
    ): unknown
    export function dataUri(image: MammothImage): Promise<{ src: string }>
  }

  export function extractRawText(options: { arrayBuffer: ArrayBuffer }): Promise<MammothResult>
  export function convertToHtml(
    options: {
      arrayBuffer: ArrayBuffer
    },
    transformOptions?: {
      convertImage?: unknown
    }
  ): Promise<MammothResult>
}
