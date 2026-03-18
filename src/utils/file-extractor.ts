import { unzipSync } from 'fflate'
import { readFileSync, writeFileSync } from 'node:fs'
import type { Attachment } from '../types/attachment.ts'

// PDF → text
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import('pdf-parse')
  const parser = new PDFParse({ data: new Uint8Array(buffer) })
  const result = await parser.getText()
  await parser.destroy()
  return result.text
}

// DOCX → text (word/document.xml 中 <w:t> tags)
export function extractDocxText(buffer: Buffer): string {
  const files = unzipSync(new Uint8Array(buffer))
  const docXml = files['word/document.xml']
  if (!docXml) return ''
  const xml = new TextDecoder().decode(docXml)
  return xml.replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '').trim()
}

// XLSX → text (sharedStrings + sheet data → TSV-like text)
export function extractXlsxText(buffer: Buffer): string {
  const files = unzipSync(new Uint8Array(buffer))

  // 1. Parse shared strings table
  const ssXml = files['xl/sharedStrings.xml']
  const sharedStrings: string[] = []
  if (ssXml) {
    const xml = new TextDecoder().decode(ssXml)
    const matches = xml.matchAll(/<t[^>]*>([^<]*)<\/t>/g)
    for (const m of matches) sharedStrings.push(m[1] ?? '')
  }

  // 2. Parse sheet1 (most common single-sheet case)
  const sheetXml = files['xl/worksheets/sheet1.xml']
  if (!sheetXml) return sharedStrings.join('\n')

  const xml = new TextDecoder().decode(sheetXml)
  const rows: string[][] = []
  const rowMatches = xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)
  for (const rowMatch of rowMatches) {
    const cells: string[] = []
    const rowContent = rowMatch[1] ?? ''
    const cellMatches = rowContent.matchAll(/<c([^>]*)>[\s\S]*?<\/c>/g)
    for (const cm of cellMatches) {
      const attrs = cm[1] ?? ''
      const vMatch = cm[0].match(/<v>([^<]*)<\/v>/)
      if (!vMatch) { cells.push(''); continue }
      const val = vMatch[1] ?? ''
      if (attrs.includes('t="s"')) {
        cells.push(sharedStrings[parseInt(val)] ?? '')
      } else {
        cells.push(val)
      }
    }
    rows.push(cells)
  }
  return rows.map(r => r.join('\t')).join('\n')
}

// Media type → extractor mapping
const EXTRACTABLE_TYPES: Record<string, (buf: Buffer) => string | Promise<string>> = {
  'application/pdf': extractPdfText,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': extractDocxText,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': extractXlsxText,
}

// Preprocess binary document attachments: extract text and save as .extracted.txt
export async function preprocessAttachments(attachments: Attachment[]): Promise<Attachment[]> {
  const result: Attachment[] = []
  for (const a of attachments) {
    const extractor = EXTRACTABLE_TYPES[a.mediaType]
    if (extractor) {
      const buffer = readFileSync(a.filePath)
      const text = await extractor(buffer)
      const txtPath = a.filePath + '.extracted.txt'
      writeFileSync(txtPath, text, 'utf-8')
      result.push({ ...a, filePath: txtPath, mediaType: 'text/plain' })
    } else {
      result.push(a)
    }
  }
  return result
}
