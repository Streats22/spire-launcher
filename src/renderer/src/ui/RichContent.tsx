import { useMemo } from 'react'
import { marked } from 'marked'
import DOMPurify, { type Config as DomPurifyConfig } from 'dompurify'

export type RichContentMode = 'auto' | 'markdown' | 'html' | 'plain'

export type RichContentFormat = 'markdown' | 'html' | 'plain'

interface RichContentProps {
  text: string
  mode?: RichContentMode
  className?: string
}

const PURIFY_OPTIONS: DomPurifyConfig = {
  USE_PROFILES: { html: true },
  ADD_ATTR: ['target', 'rel'],
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button']
}

marked.setOptions({
  gfm: true,
  breaks: true
})

export function detectRichFormat(text: string): RichContentFormat {
  const t = text.trim()
  if (!t) return 'plain'
  if (/<[a-z][\s\S]*>/i.test(t)) return 'html'
  if (
    /^#{1,6}\s/m.test(t) ||
    /^(\*{1,2}|_{1,2}).+\1/m.test(t) ||
    /^```/m.test(t) ||
    /^\s*[-*+]\s+\S/m.test(t) ||
    /^\s*\d+\.\s+\S/m.test(t) ||
    /\[[^\]]+\]\([^)]+\)/.test(t)
  ) {
    return 'markdown'
  }
  return 'plain'
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function sanitizeHtml(html: string): string {
  const clean = DOMPurify.sanitize(html, PURIFY_OPTIONS)
  // External links open via Electron-friendly target
  return clean.replace(
    /<a\s([^>]*?)href=(["'])(https?:\/\/.*?)\2/gi,
    '<a $1href=$2$3$2 target="_blank" rel="noreferrer noopener"'
  )
}

function toHtml(text: string, format: RichContentFormat): string {
  if (!text.trim()) return '<p class="rich-empty">No description.</p>'
  if (format === 'plain') {
    return `<pre class="rich-plain">${escapeHtml(text)}</pre>`
  }
  if (format === 'markdown') {
    const raw = marked.parse(text, { async: false }) as string
    return sanitizeHtml(raw)
  }
  return sanitizeHtml(text)
}

export default function RichContent({
  text,
  mode = 'auto',
  className
}: RichContentProps): React.JSX.Element {
  const format = mode === 'auto' ? detectRichFormat(text) : mode
  const html = useMemo(() => toHtml(text, format), [text, format])

  return (
    <div
      className={['rich-content', `rich-content-${format}`, className].filter(Boolean).join(' ')}
      data-format={format}
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={(e) => {
        const a = (e.target as HTMLElement).closest('a')
        if (!a) return
        const href = a.getAttribute('href')
        if (!href || !/^https?:\/\//i.test(href)) return
        e.preventDefault()
        void window.spire.openExternal(href)
      }}
    />
  )
}
