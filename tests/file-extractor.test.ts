import { describe, test, expect, afterAll } from 'bun:test'
import './setup-light'
import { extractDocxText, extractXlsxText, preprocessAttachments } from '../src/utils/file-extractor'
import { zipSync } from 'fflate'
import { writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

// Temp directory for file-based tests
const TMP_DIR = join(process.env.DATA_DIR!, 'file-extractor-test')
mkdirSync(TMP_DIR, { recursive: true })

afterAll(() => {
  rmSync(TMP_DIR, { recursive: true, force: true })
})

// Helper: build a minimal DOCX buffer
function buildDocxBuffer(text: string): Buffer {
  const docXml = `<w:document><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`
  return Buffer.from(zipSync({ 'word/document.xml': new TextEncoder().encode(docXml) }))
}

// Helper: build a minimal XLSX buffer
function buildXlsxBuffer(rows: string[][]): Buffer {
  const strings = [...new Set(rows.flat())]
  const ssXml = `<sst>${strings.map(s => `<si><t>${s}</t></si>`).join('')}</sst>`
  const sheetRows = rows.map(row => {
    const cells = row.map(val => {
      const idx = strings.indexOf(val)
      return `<c t="s"><v>${idx}</v></c>`
    }).join('')
    return `<row>${cells}</row>`
  }).join('')
  const sheetXml = `<worksheet><sheetData>${sheetRows}</sheetData></worksheet>`
  return Buffer.from(zipSync({
    'xl/sharedStrings.xml': new TextEncoder().encode(ssXml),
    'xl/worksheets/sheet1.xml': new TextEncoder().encode(sheetXml),
  }))
}

describe('extractDocxText', () => {
  test('extract text from minimal docx XML', () => {
    const docXml = '<w:document><w:body><w:p><w:r><w:t>Hello World</w:t></w:r></w:p></w:body></w:document>'
    const zip = zipSync({ 'word/document.xml': new TextEncoder().encode(docXml) })
    const result = extractDocxText(Buffer.from(zip))
    expect(result).toContain('Hello World')
  })

  test('multiple paragraphs separated by newline', () => {
    const docXml = '<w:document><w:body><w:p><w:r><w:t>Para 1</w:t></w:r></w:p><w:p><w:r><w:t>Para 2</w:t></w:r></w:p></w:body></w:document>'
    const zip = zipSync({ 'word/document.xml': new TextEncoder().encode(docXml) })
    const result = extractDocxText(Buffer.from(zip))
    expect(result).toContain('Para 1')
    expect(result).toContain('Para 2')
    // Paragraphs should be on separate lines
    expect(result).toMatch(/Para 1\n.*Para 2/)
  })

  test('empty docx returns empty string', () => {
    const zip = zipSync({ 'word/document.xml': new TextEncoder().encode('<w:document></w:document>') })
    const result = extractDocxText(Buffer.from(zip))
    expect(result).toBe('')
  })

  test('missing word/document.xml returns empty string', () => {
    const zip = zipSync({ 'other.xml': new TextEncoder().encode('<root/>') })
    const result = extractDocxText(Buffer.from(zip))
    expect(result).toBe('')
  })
})

describe('extractXlsxText', () => {
  test('extract text from minimal xlsx with shared strings', () => {
    const ssXml = '<sst><si><t>Name</t></si><si><t>Age</t></si><si><t>Alice</t></si></sst>'
    const sheetXml = '<worksheet><sheetData><row><c t="s"><v>0</v></c><c t="s"><v>1</v></c></row><row><c t="s"><v>2</v></c><c><v>30</v></c></row></sheetData></worksheet>'
    const zip = zipSync({
      'xl/sharedStrings.xml': new TextEncoder().encode(ssXml),
      'xl/worksheets/sheet1.xml': new TextEncoder().encode(sheetXml),
    })
    const result = extractXlsxText(Buffer.from(zip))
    expect(result).toContain('Name')
    expect(result).toContain('Age')
    expect(result).toContain('Alice')
    expect(result).toContain('30')
  })

  test('xlsx with only shared strings and no sheet returns strings joined by newline', () => {
    const ssXml = '<sst><si><t>Foo</t></si><si><t>Bar</t></si></sst>'
    const zip = zipSync({
      'xl/sharedStrings.xml': new TextEncoder().encode(ssXml),
    })
    const result = extractXlsxText(Buffer.from(zip))
    expect(result).toBe('Foo\nBar')
  })

  test('xlsx with numeric-only cells (no shared strings)', () => {
    const sheetXml = '<worksheet><sheetData><row><c><v>100</v></c><c><v>200</v></c></row></sheetData></worksheet>'
    const zip = zipSync({
      'xl/worksheets/sheet1.xml': new TextEncoder().encode(sheetXml),
    })
    const result = extractXlsxText(Buffer.from(zip))
    expect(result).toContain('100')
    expect(result).toContain('200')
  })
})

describe('preprocessAttachments', () => {
  test('docx attachment is extracted to .extracted.txt', async () => {
    const filePath = join(TMP_DIR, 'test.docx')
    writeFileSync(filePath, buildDocxBuffer('Document content here'))

    const result = await preprocessAttachments([{
      filename: 'test.docx',
      mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      filePath,
    }])

    expect(result).toHaveLength(1)
    expect(result[0].filePath).toBe(filePath + '.extracted.txt')
    expect(result[0].mediaType).toBe('text/plain')
    expect(existsSync(result[0].filePath)).toBe(true)
    const content = readFileSync(result[0].filePath, 'utf-8')
    expect(content).toContain('Document content here')
  })

  test('xlsx attachment is extracted to .extracted.txt', async () => {
    const filePath = join(TMP_DIR, 'test.xlsx')
    writeFileSync(filePath, buildXlsxBuffer([['Name', 'Score'], ['Bob', '95']]))

    const result = await preprocessAttachments([{
      filename: 'test.xlsx',
      mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filePath,
    }])

    expect(result).toHaveLength(1)
    expect(result[0].filePath).toBe(filePath + '.extracted.txt')
    expect(result[0].mediaType).toBe('text/plain')
    const content = readFileSync(result[0].filePath, 'utf-8')
    expect(content).toContain('Name')
    expect(content).toContain('Bob')
    expect(content).toContain('95')
  })

  test('text file passes through unchanged', async () => {
    const filePath = join(TMP_DIR, 'plain.txt')
    writeFileSync(filePath, 'just text')

    const result = await preprocessAttachments([{
      filename: 'plain.txt',
      mediaType: 'text/plain',
      filePath,
    }])

    expect(result).toHaveLength(1)
    expect(result[0].filePath).toBe(filePath)
    expect(result[0].mediaType).toBe('text/plain')
    // No .extracted.txt file should be created
    expect(existsSync(filePath + '.extracted.txt')).toBe(false)
  })

  test('image file passes through unchanged', async () => {
    const filePath = join(TMP_DIR, 'photo.jpg')
    writeFileSync(filePath, Buffer.from([0xFF, 0xD8, 0xFF])) // minimal JPEG header

    const result = await preprocessAttachments([{
      filename: 'photo.jpg',
      mediaType: 'image/jpeg',
      filePath,
    }])

    expect(result).toHaveLength(1)
    expect(result[0].filePath).toBe(filePath)
    expect(result[0].mediaType).toBe('image/jpeg')
  })

  test('mixed attachments: extract binary docs, pass through others', async () => {
    const docxPath = join(TMP_DIR, 'mixed.docx')
    const txtPath = join(TMP_DIR, 'mixed.txt')
    const imgPath = join(TMP_DIR, 'mixed.png')
    writeFileSync(docxPath, buildDocxBuffer('Mixed test'))
    writeFileSync(txtPath, 'plain text')
    writeFileSync(imgPath, Buffer.from([0x89, 0x50, 0x4E, 0x47])) // PNG header

    const result = await preprocessAttachments([
      { filename: 'mixed.docx', mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', filePath: docxPath },
      { filename: 'mixed.txt', mediaType: 'text/plain', filePath: txtPath },
      { filename: 'mixed.png', mediaType: 'image/png', filePath: imgPath },
    ])

    expect(result).toHaveLength(3)
    // DOCX → extracted
    expect(result[0].filePath).toBe(docxPath + '.extracted.txt')
    expect(result[0].mediaType).toBe('text/plain')
    const extracted = readFileSync(result[0].filePath, 'utf-8')
    expect(extracted).toContain('Mixed test')
    // TXT → unchanged
    expect(result[1].filePath).toBe(txtPath)
    expect(result[1].mediaType).toBe('text/plain')
    // PNG → unchanged
    expect(result[2].filePath).toBe(imgPath)
    expect(result[2].mediaType).toBe('image/png')
  })
})
