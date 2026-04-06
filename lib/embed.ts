export async function embedText(text: string): Promise<number[] | null> {
  if (!process.env.HUGGINGFACE_API_KEY) return null

  try {
    const res = await fetch(
      'https://router.huggingface.co/hf-inference/models/intfloat/multilingual-e5-large',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inputs: `passage: ${text}` }),
      }
    )

    if (res.status === 503) {
      console.log('[embed] model loading, retrying in 8s...')
      await new Promise(r => setTimeout(r, 8000))
      return embedText(text)
    }

    if (!res.ok) {
      const err = await res.text()
      console.error('[embed] HuggingFace error:', res.status, err)
      return null
    }

    const result = await res.json()
    const vector = Array.isArray(result[0]) ? result[0] : result

    if (!Array.isArray(vector) || vector.length !== 1024) {
      console.error('[embed] unexpected vector shape:', Array.isArray(result), result?.length)
      return null
    }

    console.log('[embed] success, vector length:', vector.length)
    return vector
  } catch (err) {
    console.error('[embed] error:', err)
    return null
  }
}
