/**
 * lib/document-export.ts
 * Server-side document export: DOCX, PPTX, PDF-via-HTML
 * Used by: app/api/documents/[id]/export/route.ts
 */

import {
  Document as DocxDocument,
  Packer,
  Paragraph,
  TextRun,
  Header,
  Footer,
  Table,
  TableRow,
  TableCell,
  AlignmentType,
  TabStopType,
  HeadingLevel,
  WidthType,
  ShadingType,
  BorderStyle,
  LevelFormat,
} from 'docx'
import PptxGenJS from 'pptxgenjs'
import type { Document as NavDocument, DocumentType } from '@/lib/types'

// ─── Markdown Parser ─────────────────────────────────────────────────────────

interface DocBlock {
  type:    'h1' | 'h2' | 'h3' | 'paragraph' | 'bullet' | 'numbered' | 'table' | 'divider' | 'blank'
  content: string
  cells?:  string[][]   // for tables: [row][col]
  level?:  number
}

export function parseMarkdown(markdown: string): DocBlock[] {
  const blocks: DocBlock[] = []
  if (!markdown?.trim()) return blocks

  const lines = markdown.split('\n')
  let i = 0

  while (i < lines.length) {
    const raw  = lines[i]
    const line = raw.trimEnd()

    // --- Horizontal rule
    if (/^---+$/.test(line.trim())) {
      blocks.push({ type: 'divider', content: '' })
      i++
      continue
    }

    // --- Headings
    if (line.startsWith('### ')) {
      blocks.push({ type: 'h3', content: line.slice(4).trim() })
      i++
      continue
    }
    if (line.startsWith('## ')) {
      blocks.push({ type: 'h2', content: line.slice(3).trim() })
      i++
      continue
    }
    if (line.startsWith('# ')) {
      blocks.push({ type: 'h1', content: line.slice(2).trim() })
      i++
      continue
    }

    // --- Bullet list
    if (/^[-*] /.test(line)) {
      blocks.push({ type: 'bullet', content: line.replace(/^[-*] /, '').trim() })
      i++
      continue
    }

    // --- Numbered list
    if (/^\d+\. /.test(line)) {
      blocks.push({ type: 'numbered', content: line.replace(/^\d+\. /, '').trim() })
      i++
      continue
    }

    // --- Table: collect all consecutive table rows
    if (line.startsWith('|')) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i])
        i++
      }
      // Filter out separator rows (|---|---|)
      const dataRows = tableLines.filter(l => !/^\|[\s|:-]+\|$/.test(l.trim()))
      const cells = dataRows.map(l =>
        l.trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map(c => c.trim())
      )
      if (cells.length > 0) {
        blocks.push({ type: 'table', content: '', cells })
      }
      continue
    }

    // --- Blank line
    if (line.trim() === '') {
      if (blocks.length > 0 && blocks[blocks.length - 1].type !== 'blank') {
        blocks.push({ type: 'blank', content: '' })
      }
      i++
      continue
    }

    // --- Paragraph (everything else)
    blocks.push({ type: 'paragraph', content: line.trim() })
    i++
  }

  return blocks
}

// ─── Strip inline markdown formatting ────────────────────────────────────────

function stripInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
}

// ─── DOCX Export ─────────────────────────────────────────────────────────────

export async function exportToDocx(
  document: NavDocument,
  groupName: string,
): Promise<Buffer> {
  const blocks = parseMarkdown(document.content_markdown)

  // ── Numbering config ─────────────────────────────────────────────────────
  const numberingConfig = {
    config: [
      {
        reference: 'bullet-list',
        levels: [{
          level:     0,
          format:    LevelFormat.BULLET,
          text:      '\u2022',
          alignment: AlignmentType.LEFT,
          style: {
            paragraph: {
              indent: { left: 720, hanging: 360 },
            },
          },
        }],
      },
      {
        reference: 'numbered-list',
        levels: [{
          level:     0,
          format:    LevelFormat.DECIMAL,
          text:      '%1.',
          alignment: AlignmentType.LEFT,
          style: {
            paragraph: {
              indent: { left: 720, hanging: 360 },
            },
          },
        }],
      },
    ],
  }

  // ── Header ──────────────────────────────────────────────────────────────
  const pageHeader = new Header({
    children: [
      new Paragraph({
        children: [
          new TextRun({ text: groupName, size: 18, color: '888888' }),
          new TextRun({ text: '\t', size: 18 }),
          new TextRun({ text: document.title, size: 18, color: '888888' }),
        ],
        tabStops: [
          { type: TabStopType.RIGHT, position: 9360 },
        ],
        border: {
          bottom: { color: 'DDDDDD', space: 1, style: BorderStyle.SINGLE, size: 4 },
        },
      }),
    ],
  })

  // ── Footer ──────────────────────────────────────────────────────────────
  const pageFooter = new Footer({
    children: [
      new Paragraph({
        children: [
          new TextRun({ text: 'NavHub', size: 18, color: '666666' }),
          new TextRun({ text: '\t', size: 18 }),
          new TextRun({ text: groupName, size: 18, color: '666666' }),
          new TextRun({ text: '\t', size: 18 }),
          new TextRun({ text: document.title, size: 18, color: '666666' }),
        ],
        tabStops: [
          { type: TabStopType.CENTER, position: 4680 },
          { type: TabStopType.RIGHT,  position: 9360 },
        ],
        border: {
          top: { color: 'DDDDDD', space: 1, style: BorderStyle.SINGLE, size: 4 },
        },
      }),
    ],
  })

  // ── Title section paragraphs ─────────────────────────────────────────────
  const createdDate = new Date(document.created_at).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  const titleParagraphs: Paragraph[] = [
    new Paragraph({
      heading:   HeadingLevel.TITLE,
      children:  [new TextRun({ text: document.title, size: 56, bold: true })],
      spacing:   { after: 200 },
    }),
    new Paragraph({
      children:  [
        new TextRun({
          text:  `${document.document_type.replace(/_/g, ' ')} · ${document.audience}`,
          size:  28,
          color: '666666',
        }),
      ],
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [new TextRun({ text: createdDate, size: 24, color: '888888' })],
      spacing:  { after: 400 },
    }),
    // Horizontal rule
    new Paragraph({
      children: [],
      border: {
        bottom: { color: 'CCCCCC', space: 1, style: BorderStyle.SINGLE, size: 6 },
      },
      spacing: { after: 400 },
    }),
  ]

  // ── Body paragraphs ──────────────────────────────────────────────────────
  const bodyChildren: (Paragraph | Table)[] = []

  for (const block of blocks) {
    if (block.type === 'blank') continue

    if (block.type === 'h1') {
      bodyChildren.push(new Paragraph({
        heading:  HeadingLevel.HEADING_1,
        children: [new TextRun({ text: stripInline(block.content), size: 40, bold: true })],
        spacing:  { before: 400, after: 200 },
      }))
      continue
    }

    if (block.type === 'h2') {
      bodyChildren.push(new Paragraph({
        heading:  HeadingLevel.HEADING_2,
        children: [new TextRun({ text: stripInline(block.content), size: 32, bold: true })],
        spacing:  { before: 320, after: 160 },
      }))
      continue
    }

    if (block.type === 'h3') {
      bodyChildren.push(new Paragraph({
        heading:  HeadingLevel.HEADING_3,
        children: [new TextRun({ text: stripInline(block.content), size: 26, bold: true })],
        spacing:  { before: 240, after: 120 },
      }))
      continue
    }

    if (block.type === 'bullet') {
      bodyChildren.push(new Paragraph({
        children:  [new TextRun({ text: stripInline(block.content), size: 24 })],
        numbering: { reference: 'bullet-list', level: 0 },
      }))
      continue
    }

    if (block.type === 'numbered') {
      bodyChildren.push(new Paragraph({
        children:  [new TextRun({ text: stripInline(block.content), size: 24 })],
        numbering: { reference: 'numbered-list', level: 0 },
      }))
      continue
    }

    if (block.type === 'divider') {
      bodyChildren.push(new Paragraph({
        children: [],
        border: {
          bottom: { color: 'CCCCCC', space: 1, style: BorderStyle.SINGLE, size: 6 },
        },
        spacing: { before: 200, after: 200 },
      }))
      continue
    }

    if (block.type === 'table' && block.cells && block.cells.length > 0) {
      const colCount  = block.cells[0].length
      const colWidth  = Math.floor(9360 / colCount)
      const rows = block.cells.map((rowCells, rowIdx) =>
        new TableRow({
          children: rowCells.map(cellText =>
            new TableCell({
              width:    { size: colWidth, type: WidthType.DXA },
              shading:  rowIdx === 0
                ? { type: ShadingType.CLEAR, color: 'auto', fill: 'F0F0F0' }
                : { type: ShadingType.CLEAR, color: 'auto', fill: 'FFFFFF' },
              children: [
                new Paragraph({
                  children: [new TextRun({
                    text: stripInline(cellText),
                    size: 22,
                    bold: rowIdx === 0,
                  })],
                }),
              ],
            })
          ),
        })
      )
      bodyChildren.push(new Table({
        columnWidths: Array(colCount).fill(colWidth),
        rows,
        width: { size: 9360, type: WidthType.DXA },
      }))
      bodyChildren.push(new Paragraph({ children: [], spacing: { after: 120 } }))
      continue
    }

    // Paragraph
    if (block.type === 'paragraph' && block.content) {
      bodyChildren.push(new Paragraph({
        children: [new TextRun({ text: stripInline(block.content), size: 24 })],
        spacing:  { after: 120 },
      }))
    }
  }

  // ── Assemble Document ────────────────────────────────────────────────────
  const doc = new DocxDocument({
    numbering: numberingConfig,
    styles: {
      default: {
        document: {
          run: { font: 'Arial', size: 24 },
          paragraph: { spacing: { line: 276, lineRule: 'auto' } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size:   { width: 11906, height: 16838 },   // A4 in DXA
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        headers: { default: pageHeader },
        footers: { default: pageFooter },
        children: [...titleParagraphs, ...bodyChildren],
      },
    ],
  })

  return Packer.toBuffer(doc)
}

// ─── PPTX Export ─────────────────────────────────────────────────────────────

const FINANCIAL_TYPES: DocumentType[] = [
  'financial_analysis',
  'cash_flow_review',
  'board_report',
  'budget_vs_actual',
]

const PEOPLE_TYPES: DocumentType[] = [
  'job_description',
  'org_structure',
]

function getSlideType(docType: DocumentType): 'financial' | 'people' | 'general' {
  if (FINANCIAL_TYPES.includes(docType)) return 'financial'
  if (PEOPLE_TYPES.includes(docType))   return 'people'
  return 'general'
}

/** Split markdown blocks into sections keyed by H2 heading */
function splitIntoSections(blocks: DocBlock[]): Array<{ heading: string; bullets: string[] }> {
  const sections: Array<{ heading: string; bullets: string[] }> = []
  let current: { heading: string; bullets: string[] } | null = null

  for (const block of blocks) {
    if (block.type === 'h2') {
      if (current) sections.push(current)
      current = { heading: block.content, bullets: [] }
      continue
    }
    if (!current) continue  // skip content before first H2
    if (block.type === 'bullet' || block.type === 'numbered') {
      current.bullets.push(block.content)
    } else if (block.type === 'paragraph' && block.content.trim()) {
      // Split long paragraphs into bullet-like lines
      current.bullets.push(block.content)
    }
  }
  if (current) sections.push(current)
  return sections
}

export async function exportToPptx(
  document: NavDocument,
  groupName: string,
): Promise<Buffer> {
  const pptx  = new PptxGenJS()
  const blocks = parseMarkdown(document.content_markdown)

  pptx.layout   = 'LAYOUT_WIDE'  // 16:9, 10 × 7.5 inches

  // Theme
  pptx.defineSlideMaster({
    title: 'MAIN',
    background: { fill: '0F1117' },
  })

  const BG_COLOR    = '0F1117'
  const TEXT_WHITE  = 'E2E8F0'
  const TEXT_MUTED  = '94A3B8'
  const ACCENT      = '6366F1'
  const DATE_STR    = new Date(document.created_at).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
  const FOOTER_TXT  = `NavHub  ·  ${groupName}  ·  ${document.title}`
  const SLIDE_W     = 10   // inches
  const SLIDE_H     = 7.5  // inches

  function addFooter(slide: PptxGenJS.Slide) {
    slide.addText(FOOTER_TXT, {
      x: 0.3, y: SLIDE_H - 0.4, w: SLIDE_W - 0.6, h: 0.3,
      fontSize: 9, color: '475569', align: 'center', fontFace: 'Calibri',
    })
  }

  function bgRect(slide: PptxGenJS.Slide) {
    slide.background = { fill: BG_COLOR }
  }

  // ── Cover slide ──────────────────────────────────────────────────────────
  const cover = pptx.addSlide()
  bgRect(cover)

  // Accent bar
  cover.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: 0.06, h: SLIDE_H, fill: { color: ACCENT },
  })

  // Title
  cover.addText(document.title, {
    x: 0.5, y: 2, w: SLIDE_W - 1, h: 1.5,
    fontSize:  36,
    bold:      true,
    color:     TEXT_WHITE,
    fontFace:  'Calibri',
    valign:    'middle',
    wrap:      true,
  })

  // Subtitle — doc type
  cover.addText(
    document.document_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    {
      x: 0.5, y: 3.7, w: SLIDE_W - 1, h: 0.5,
      fontSize: 16, color: TEXT_MUTED, fontFace: 'Calibri',
    }
  )

  // Group + date
  cover.addText(`${groupName}  ·  ${DATE_STR}`, {
    x: 0.5, y: 4.3, w: SLIDE_W - 1, h: 0.4,
    fontSize: 13, color: TEXT_MUTED, fontFace: 'Calibri',
  })

  // NavHub wordmark bottom-right
  cover.addText('NavHub', {
    x: SLIDE_W - 2, y: SLIDE_H - 0.6, w: 1.7, h: 0.4,
    fontSize: 14, color: ACCENT, bold: true, fontFace: 'Calibri', align: 'right',
  })

  // ── Section slides ───────────────────────────────────────────────────────
  const sections = splitIntoSections(blocks)
  const slideType = getSlideType(document.document_type)

  let sectionsToShow = sections
  let overviewFirst: typeof sections[0] | null = null

  if (slideType === 'people' && sections.length > 0) {
    overviewFirst  = sections[0]
    sectionsToShow = sections.slice(1)
  }

  // Overview slide for people types
  if (overviewFirst) {
    const sl = pptx.addSlide()
    bgRect(sl)
    sl.addText(overviewFirst.heading, {
      x: 0.5, y: 0.4, w: SLIDE_W - 1, h: 0.7,
      fontSize: 28, bold: true, color: TEXT_WHITE, fontFace: 'Calibri',
    })
    if (overviewFirst.bullets.length > 0) {
      const bulletText = overviewFirst.bullets.slice(0, 8).map(b => ({
        text: stripInline(b),
        options: { bullet: { code: '2022' }, fontSize: 16, color: TEXT_MUTED, paraSpaceAfter: 6 },
      }))
      sl.addText(bulletText as PptxGenJS.TextProps[], {
        x: 0.5, y: 1.3, w: SLIDE_W - 1, h: SLIDE_H - 2.2,
        fontFace: 'Calibri', valign: 'top',
      })
    }
    addFooter(sl)
  }

  // Section slides
  for (const section of sectionsToShow) {
    const sl = pptx.addSlide()
    bgRect(sl)

    // Heading accent bar
    sl.addShape(pptx.ShapeType.rect, {
      x: 0.5, y: 0.4, w: 0.04, h: 0.55, fill: { color: ACCENT },
    })

    sl.addText(section.heading, {
      x: 0.65, y: 0.4, w: SLIDE_W - 1.15, h: 0.7,
      fontSize: 26, bold: true, color: TEXT_WHITE, fontFace: 'Calibri',
    })

    if (section.bullets.length > 0) {
      const bulletText = section.bullets.slice(0, 10).map(b => ({
        text: stripInline(b),
        options: { bullet: { code: '2022' }, fontSize: 16, color: TEXT_MUTED, paraSpaceAfter: 6 },
      }))
      sl.addText(bulletText as PptxGenJS.TextProps[], {
        x: 0.5, y: 1.3, w: SLIDE_W - 1, h: SLIDE_H - 2.2,
        fontFace: 'Calibri', valign: 'top',
      })
    }

    addFooter(sl)
  }

  // ── Closing slide ────────────────────────────────────────────────────────
  const closing = pptx.addSlide()
  bgRect(closing)

  closing.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: 0.06, h: SLIDE_H, fill: { color: ACCENT },
  })

  const closingText = slideType === 'financial' ? 'Summary' : 'Thank You'
  closing.addText(closingText, {
    x: 0.5, y: 2.5, w: SLIDE_W - 1, h: 1,
    fontSize: 36, bold: true, color: TEXT_WHITE, fontFace: 'Calibri', align: 'center',
  })
  closing.addText(`${groupName}  ·  ${DATE_STR}`, {
    x: 0.5, y: 3.6, w: SLIDE_W - 1, h: 0.4,
    fontSize: 13, color: TEXT_MUTED, fontFace: 'Calibri', align: 'center',
  })

  const buffer = await pptx.write({ outputType: 'nodebuffer' }) as Buffer
  return buffer
}

// ─── PDF-via-HTML Export ──────────────────────────────────────────────────────

export function exportToPdfHtml(
  document: NavDocument,
  groupName: string,
): string {
  const blocks    = parseMarkdown(document.content_markdown)
  const createdAt = new Date(document.created_at).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  function renderBlock(block: DocBlock): string {
    switch (block.type) {
      case 'h1':
        return `<h1 class="page-break-before">${esc(stripInline(block.content))}</h1>`
      case 'h2':
        return `<h2>${esc(stripInline(block.content))}</h2>`
      case 'h3':
        return `<h3>${esc(stripInline(block.content))}</h3>`
      case 'paragraph':
        return block.content ? `<p>${esc(stripInline(block.content))}</p>` : ''
      case 'bullet':
        return `<li class="bullet">${esc(stripInline(block.content))}</li>`
      case 'numbered':
        return `<li class="numbered">${esc(stripInline(block.content))}</li>`
      case 'divider':
        return '<hr />'
      case 'table': {
        if (!block.cells || block.cells.length === 0) return ''
        const [header, ...rows] = block.cells
        const thead = `<thead><tr>${header.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>`
        const tbody = `<tbody>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>`
        return `<table>${thead}${tbody}</table>`
      }
      default:
        return ''
    }
  }

  // Wrap consecutive li.bullet in <ul>, consecutive li.numbered in <ol>
  // Uses line-by-line approach to avoid the /s (dotAll) regex flag which requires ES2018+
  function wrapLists(html: string): string {
    const lines = html.split('\n')
    const result: string[] = []
    let inBullet   = false
    let inNumbered = false
    for (const line of lines) {
      if (line.startsWith('<li class="bullet">')) {
        if (!inBullet) { result.push('<ul>'); inBullet = true }
        if (inNumbered) { result.push('</ol>'); inNumbered = false }
        result.push(line.replace(' class="bullet"', ''))
      } else if (line.startsWith('<li class="numbered">')) {
        if (!inNumbered) { result.push('<ol>'); inNumbered = true }
        if (inBullet) { result.push('</ul>'); inBullet = false }
        result.push(line.replace(' class="numbered"', ''))
      } else {
        if (inBullet)   { result.push('</ul>'); inBullet   = false }
        if (inNumbered) { result.push('</ol>'); inNumbered = false }
        result.push(line)
      }
    }
    if (inBullet)   result.push('</ul>')
    if (inNumbered) result.push('</ol>')
    return result.join('\n')
  }

  const bodyHtml = wrapLists(blocks.map(renderBlock).join('\n'))

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${esc(document.title)} — NavHub</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11pt;
      color: #111;
      background: #fff;
      padding: 0;
    }
    .page {
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 48px 60px;
    }

    /* Title block */
    .doc-title   { font-size: 26pt; font-weight: 700; margin-bottom: 8px; }
    .doc-meta    { font-size: 11pt; color: #666; margin-bottom: 6px; }
    .doc-date    { font-size: 10pt; color: #999; margin-bottom: 16px; }
    .title-rule  { border: none; border-top: 2px solid #ccc; margin: 16px 0 32px; }

    /* Content */
    h1 { font-size: 18pt; font-weight: 700; margin: 32px 0 12px; color: #111; }
    h2 { font-size: 14pt; font-weight: 600; margin: 24px 0 10px; color: #222; }
    h3 { font-size: 12pt; font-weight: 600; margin: 18px 0 8px;  color: #333; }
    p  { line-height: 1.6; margin-bottom: 10px; }
    ul, ol { padding-left: 1.5rem; margin-bottom: 10px; }
    li { line-height: 1.6; margin-bottom: 4px; }
    hr { border: none; border-top: 1px solid #ddd; margin: 20px 0; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 10pt; }
    th, td { border: 1px solid #ddd; padding: 6px 10px; text-align: left; }
    th { background: #f5f5f5; font-weight: 600; }

    /* Print */
    @media print {
      body { font-size: 10pt; }
      .page { padding: 0; }
      h1, h2 { page-break-after: avoid; }
      table { page-break-inside: avoid; }
      .page-break-before { page-break-before: always; }

      @page {
        margin: 15mm 18mm;
        size: A4;
      }
      @page {
        @bottom-left   { content: "NavHub"; font-size: 8pt; color: #999; }
        @bottom-center { content: "${esc(groupName)}"; font-size: 8pt; color: #999; }
        @bottom-right  { content: counter(page); font-size: 8pt; color: #999; }
      }
    }

    /* Print banner */
    .print-note {
      background: #fef3c7;
      border: 1px solid #fcd34d;
      border-radius: 6px;
      padding: 10px 16px;
      margin-bottom: 24px;
      font-size: 10pt;
      color: #92400e;
    }
    @media print { .print-note { display: none; } }
  </style>
</head>
<body>
  <div class="page">
    <div class="print-note">
      To save as PDF: use your browser's Print function (Cmd+P / Ctrl+P) and choose "Save as PDF".
    </div>
    <div class="doc-title">${esc(document.title)}</div>
    <div class="doc-meta">${esc(document.document_type.replace(/_/g, ' '))} &middot; ${esc(document.audience)}</div>
    <div class="doc-date">${createdAt} &middot; ${esc(groupName)}</div>
    <hr class="title-rule" />
    ${bodyHtml}
  </div>
</body>
</html>`
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function esc(str: string): string {
  return (str ?? '')
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
}
