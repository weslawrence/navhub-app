/**
 * Shared text-extraction helper.
 *
 * Strategy:
 *   - text/plain, text/markdown, text/html, text/csv → utf-8 decode
 *   - PDF, DOCX, XLSX, PPTX                         → Anthropic Document API
 *   - PNG/JPEG                                      → Anthropic Vision API
 *
 * Returns an empty string when extraction is not possible (caller decides
 * whether to treat that as an error).
 */

const ANTHROPIC_TEXT_MIME = new Set([
  'text/plain',
  'text/markdown',
  'text/html',
  'text/csv',
])

// Anthropic's Document API officially supports PDF only — other Office formats
// must be parsed locally first. DOCX goes through `mammoth`; XLSX/PPTX/etc.
// fall back to the doc API anyway since some accounts/models accept them.
const ANTHROPIC_DOC_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
])

const DOCX_MIME = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
])

const ANTHROPIC_IMAGE_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
])

interface AnthropicMessageContent {
  type:    string
  text?:   string
  source?: {
    type:       'base64'
    media_type: string
    data:       string
  }
}

/**
 * Extract text from an arbitrary file buffer.
 * Returns the extracted text (markdown-friendly) or an empty string when not possible.
 */
export async function extractDocumentText(
  fileName: string,
  fileType: string,
  buffer:   Buffer,
): Promise<string> {
  const mime = (fileType || '').toLowerCase()
  const name = (fileName || '').toLowerCase()

  // 1. Direct UTF-8 decode for text formats
  if (ANTHROPIC_TEXT_MIME.has(mime) || /\.(txt|md|html|csv)$/i.test(name)) {
    try {
      return buffer.toString('utf-8')
    } catch {
      return ''
    }
  }

  // 2. DOCX → mammoth (Anthropic's Document API does not officially support DOCX)
  if (DOCX_MIME.has(mime) || /\.docx?$/i.test(name)) {
    try {
      const mammoth = await import('mammoth')
      const result  = await mammoth.extractRawText({ buffer })
      return (result.value ?? '').trim()
    } catch (err) {
      console.error('[document-extract] mammoth failed:', err instanceof Error ? err.message : String(err))
      return ''
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return ''   // No fallback — caller will see empty content_markdown.

  // 2. Image: vision API
  if (ANTHROPIC_IMAGE_MIME.has(mime) || /\.(png|jpg|jpeg|webp|gif)$/i.test(name)) {
    try {
      const base64 = buffer.toString('base64')
      const mediaType = mime.startsWith('image/') ? mime : 'image/jpeg'
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method:  'POST',
        headers: {
          'x-api-key':         apiKey,
          'anthropic-version': '2023-06-01',
          'content-type':      'application/json',
        },
        body: JSON.stringify({
          model:      'claude-haiku-4-5-20251001',
          max_tokens: 2000,
          messages: [{
            role:    'user',
            content: [
              {
                type:   'image',
                source: { type: 'base64', media_type: mediaType, data: base64 },
              },
              {
                type: 'text',
                text: 'Describe the contents of this image in detail. Extract any visible text.',
              },
            ],
          }],
        }),
      })
      if (!res.ok) return ''
      const json = await res.json() as { content: AnthropicMessageContent[] }
      return json.content.filter(b => b.type === 'text').map(b => b.text ?? '').join('')
    } catch {
      return ''
    }
  }

  // 3. Document: Anthropic Document API (PDF, DOCX, XLSX, PPTX, etc.)
  if (ANTHROPIC_DOC_MIME.has(mime) || /\.(pdf|docx?|xlsx?|pptx?)$/i.test(name)) {
    try {
      const base64 = buffer.toString('base64')
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method:  'POST',
        headers: {
          'x-api-key':         apiKey,
          'anthropic-version': '2023-06-01',
          'content-type':      'application/json',
        },
        body: JSON.stringify({
          model:      'claude-haiku-4-5-20251001',
          max_tokens: 4000,
          messages: [{
            role:    'user',
            content: [
              {
                type:   'document',
                source: {
                  type:       'base64',
                  media_type: mime || 'application/octet-stream',
                  data:       base64,
                },
              },
              {
                type: 'text',
                text: 'Extract and summarise the key content of this document in markdown format. Preserve headings, lists, and important data.',
              },
            ],
          }],
        }),
      })
      if (!res.ok) return ''
      const json = await res.json() as { content: AnthropicMessageContent[] }
      return json.content.filter(b => b.type === 'text').map(b => b.text ?? '').join('')
    } catch {
      return ''
    }
  }

  return ''
}
