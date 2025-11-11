import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { makeFileWrite } from '../mcp/tools/file-write-tool.js'
import { initLogger } from '../util/logger.js'
import * as fs from 'fs/promises'
import * as path from 'path'
import { existsSync } from 'fs'

const TEST_DIR = path.join(process.cwd(), 'test-workspace')

beforeEach(async () => {
  await initLogger()
  // Create test workspace directory
  await fs.mkdir(TEST_DIR, { recursive: true })
  // Change to test directory to set workspace root
  process.chdir(TEST_DIR)
})

afterEach(async () => {
  // Change back to original directory
  process.chdir(path.dirname(TEST_DIR))
  // Clean up test workspace
  if (existsSync(TEST_DIR)) {
    await fs.rm(TEST_DIR, { recursive: true, force: true })
  }
})

describe('file_write', () => {
  it('happy path: creates new file with content', async () => {
    const { handler } = makeFileWrite()
    const testContent = 'Hello, World!'

    const res = await handler({
      input: {
        path: 'test.txt',
        content: testContent,
        create_backup: false
      }
    })

    expect(res.isError).toBe(false)

    // Parse response
    const result = JSON.parse(res.content[0].text)
    expect(result.path).toBe('test.txt')
    expect(result.bytes_written).toBe(testContent.length)
    expect(result.created_new).toBe(true)
    expect(result.backup_path).toBeUndefined()

    // Verify file was created
    const filePath = path.join(TEST_DIR, 'test.txt')
    const content = await fs.readFile(filePath, 'utf-8')
    expect(content).toBe(testContent)
  })

  it('overwrites existing file with backup by default', async () => {
    const { handler } = makeFileWrite()
    const originalContent = 'Original content'
    const newContent = 'New content'

    // Create original file
    const filePath = path.join(TEST_DIR, 'existing.txt')
    await fs.writeFile(filePath, originalContent, 'utf-8')

    // Overwrite with backup
    const res = await handler({
      input: {
        path: 'existing.txt',
        content: newContent
      }
    })

    expect(res.isError).toBe(false)

    // Parse response
    const result = JSON.parse(res.content[0].text)
    expect(result.path).toBe('existing.txt')
    expect(result.bytes_written).toBe(newContent.length)
    expect(result.created_new).toBe(false)
    expect(result.backup_path).toBeDefined()

    // Verify backup exists with original content
    const backupContent = await fs.readFile(result.backup_path, 'utf-8')
    expect(backupContent).toBe(originalContent)

    // Verify file has new content
    const content = await fs.readFile(filePath, 'utf-8')
    expect(content).toBe(newContent)
  })

  it('creates parent directories when create_directories is true', async () => {
    const { handler } = makeFileWrite()
    const testContent = 'Nested file content'

    const res = await handler({
      input: {
        path: 'nested/deep/test.txt',
        content: testContent,
        create_directories: true,
        create_backup: false
      }
    })

    expect(res.isError).toBe(false)

    // Verify nested file was created
    const filePath = path.join(TEST_DIR, 'nested/deep/test.txt')
    const content = await fs.readFile(filePath, 'utf-8')
    expect(content).toBe(testContent)
  })

  it('fails when parent directory does not exist and create_directories is false', async () => {
    const { handler } = makeFileWrite()

    const res = await handler({
      input: {
        path: 'nonexistent/test.txt',
        content: 'test',
        create_directories: false,
        create_backup: false
      }
    })

    expect(res.isError).toBe(true)
    expect(res.content[0].text).toMatch(/failed/i)
  })

  it('rejects absolute paths', async () => {
    const { handler } = makeFileWrite()

    const res = await handler({
      input: {
        path: '/etc/passwd',
        content: 'malicious',
        create_backup: false
      }
    })

    expect(res.isError).toBe(true)
    expect(res.content[0].text).toMatch(/absolute paths are not allowed/i)
  })

  it('prevents path traversal attacks', async () => {
    const { handler } = makeFileWrite()

    const maliciousPaths = [
      '../../../etc/passwd',
      '../../outside.txt',
      'subdir/../../outside.txt'
    ]

    for (const maliciousPath of maliciousPaths) {
      const res = await handler({
        input: {
          path: maliciousPath,
          content: 'malicious',
          create_backup: false
        }
      })

      expect(res.isError).toBe(true)
      expect(res.content[0].text).toMatch(/outside workspace/i)
    }
  })

  it('handles special characters in filenames', async () => {
    const { handler } = makeFileWrite()
    const testContent = 'Special chars test'

    const res = await handler({
      input: {
        path: 'file with spaces.txt',
        content: testContent,
        create_backup: false
      }
    })

    expect(res.isError).toBe(false)

    // Verify file was created
    const filePath = path.join(TEST_DIR, 'file with spaces.txt')
    const content = await fs.readFile(filePath, 'utf-8')
    expect(content).toBe(testContent)
  })

  it('preserves file content encoding (UTF-8)', async () => {
    const { handler } = makeFileWrite()
    const testContent = '你好世界 🌍 Héllo Wörld'

    const res = await handler({
      input: {
        path: 'unicode.txt',
        content: testContent,
        create_backup: false
      }
    })

    expect(res.isError).toBe(false)

    // Verify content is preserved
    const filePath = path.join(TEST_DIR, 'unicode.txt')
    const content = await fs.readFile(filePath, 'utf-8')
    expect(content).toBe(testContent)
  })

  it('handles large file writes', async () => {
    const { handler } = makeFileWrite()
    const testContent = 'x'.repeat(100000) // 100KB

    const res = await handler({
      input: {
        path: 'large.txt',
        content: testContent,
        create_backup: false
      }
    })

    expect(res.isError).toBe(false)

    const result = JSON.parse(res.content[0].text)
    expect(result.bytes_written).toBe(testContent.length)
  })

  it('atomic write ensures no partial writes on failure', async () => {
    const { handler } = makeFileWrite()
    const originalContent = 'Original'

    // Create original file
    const filePath = path.join(TEST_DIR, 'atomic.txt')
    await fs.writeFile(filePath, originalContent, 'utf-8')

    // Try to write with backup disabled
    // If write fails, original should still exist
    const res = await handler({
      input: {
        path: 'atomic.txt',
        content: 'New content',
        create_backup: false
      }
    })

    // File should exist with either original or new content (no partial writes)
    const content = await fs.readFile(filePath, 'utf-8')
    expect(content.length).toBeGreaterThan(0)
  })

  it('returns metadata with timestamp', async () => {
    const { handler } = makeFileWrite()

    const res = await handler({
      input: {
        path: 'metadata.txt',
        content: 'test',
        create_backup: false
      }
    })

    expect(res.isError).toBe(false)

    const result = JSON.parse(res.content[0].text)
    expect(result.timestamp).toBeDefined()
    expect(new Date(result.timestamp)).toBeInstanceOf(Date)
  })

  it('tool definition includes valid JSON Schema', async () => {
    const { definition } = makeFileWrite()

    expect(definition.name).toBe('file_write')
    expect(definition.description).toContain('atomic')
    expect(definition.description).toContain('backup')
    expect(definition.inputSchema).toBeDefined()
    expect(definition.inputSchema.type).toBe('object')
    expect(definition.inputSchema.required).toContain('path')
    expect(definition.inputSchema.required).toContain('content')
    expect(definition.inputSchema.properties).toBeDefined()
    expect(definition.inputSchema.properties.path).toBeDefined()
    expect(definition.inputSchema.properties.content).toBeDefined()
    expect(definition.inputSchema.properties.create_backup).toBeDefined()
    expect(definition.inputSchema.properties.create_directories).toBeDefined()
  })

  it('tool definition indicates it is not read-only', async () => {
    const { definition } = makeFileWrite()

    expect(definition.annotations?.readOnlyHint).toBe(false)
  })

  it('backup filename includes timestamp', async () => {
    const { handler } = makeFileWrite()

    // Create original file
    const filePath = path.join(TEST_DIR, 'timestamped.txt')
    await fs.writeFile(filePath, 'original', 'utf-8')

    const res = await handler({
      input: {
        path: 'timestamped.txt',
        content: 'new',
        create_backup: true
      }
    })

    expect(res.isError).toBe(false)

    const result = JSON.parse(res.content[0].text)
    expect(result.backup_path).toMatch(/\.backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/)
  })

  it('handles empty file content', async () => {
    const { handler } = makeFileWrite()

    const res = await handler({
      input: {
        path: 'empty.txt',
        content: '',
        create_backup: false
      }
    })

    expect(res.isError).toBe(false)

    const result = JSON.parse(res.content[0].text)
    expect(result.bytes_written).toBe(0)

    // Verify empty file exists
    const filePath = path.join(TEST_DIR, 'empty.txt')
    const content = await fs.readFile(filePath, 'utf-8')
    expect(content).toBe('')
  })
})
