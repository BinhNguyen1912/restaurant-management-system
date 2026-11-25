import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * Chặn tái phát: message lỗi trả về FE phải là KEY (`Error.XxxYyy`) để FE dịch được.
 * Trước đây 22 chỗ throw thẳng câu tiếng Việt -> khách xem tiếng Anh vẫn thấy tiếng Việt.
 */
const VIETNAMESE = /[àáảãạăâđêôơưýỳỷỹỵ]/i
const THROW_PROSE = /new\s+\w*Exception\(\s*'([^']*)'/g

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (full.endsWith('.ts') && !full.endsWith('.spec.ts')) out.push(full)
  }
  return out
}

describe('message lỗi', () => {
  it('không throw câu tiếng Việt trực tiếp (dùng key Error.*)', () => {
    const offenders: string[] = []
    for (const file of walk(resolve(__dirname, '..'))) {
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(THROW_PROSE)) {
        if (VIETNAMESE.test(match[1])) offenders.push(`${file}: ${match[1]}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
