// Load a baked U/V wind PNG into the {data,width,height} TextureData shape that
// weatherlayers-gl ParticleLayer consumes. R = u-component, G = v-component
// (decoded on the GPU via the layer's imageUnscale).
export interface TextureData {
  data: Uint8Array
  width: number
  height: number
}

const cache = new Map<string, Promise<TextureData>>()

export function loadUVTexture(url: string): Promise<TextureData> {
  if (cache.has(url)) return cache.get(url)!
  const p = (async () => {
    const res = await fetch(url, { mode: 'cors' })
    const blob = await res.blob()
    const bitmap = await createImageBitmap(blob)
    const cv = document.createElement('canvas')
    cv.width = bitmap.width
    cv.height = bitmap.height
    const ctx = cv.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(bitmap, 0, 0)
    const { data, width, height } = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
    return { data: new Uint8Array(data.buffer), width, height }
  })()
  cache.set(url, p)
  return p
}
