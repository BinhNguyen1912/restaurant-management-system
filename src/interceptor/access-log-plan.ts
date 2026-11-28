import { AccessSubject } from '@prisma/client'
import { AccessLogMeta } from '@/shared/decorators/access-log.decorator'

/**
 * Quyết định ghi GÌ vào nhật ký truy cập, từ một request đã phục vụ xong.
 *
 * Tách khỏi interceptor để test được mà không cần HTTP: đây là chỗ dễ sai nhất (đọc nhầm param,
 * đếm nhầm số bản ghi) và sai ở đây thì nhật ký nói dối mà không ai phát hiện — nó vẫn "xanh".
 */

export type AccessLogPlanInput = {
  /** metadata khai trong `@LogAccess` */
  meta: AccessLogMeta
  /** `req.params` của request */
  params?: Record<string, unknown>
  /** giá trị handler trả về, TRƯỚC khi transformer bọc thêm — nên đọc `body.data` */
  body?: unknown
}

export type AccessLogPlan = {
  route: string
  /** loại chủ thể, null khi đọc danh sách hoặc khi không đọc ra được id */
  subjectType: AccessSubject | null
  /** id chủ thể trong bảng của `subjectType` */
  subjectId: number | null
  /** số bản ghi trả về */
  resultCount: number | null
}

export function planAccessLog({ meta, params, body }: AccessLogPlanInput): AccessLogPlan {
  const subjectId = readId(meta.subject ? params?.[meta.subject.param] : undefined)
  // Route khai có chủ thể mà không đọc ra id thì ghi dòng KHÔNG kèm chủ thể, không đoán bừa: một id
  // sai còn tệ hơn không có id (nhật ký sẽ buộc tội nhầm người), và CHECK
  // `AccessLog_subject_pair_check` cũng không cho nửa cặp. Interceptor cảnh báo để lỗi lộ ra.
  const subjectType = meta.subject && subjectId != null ? meta.subject.type : null

  const data = (body as { data?: unknown } | null | undefined)?.data
  const resultCount = countResults(body, data, subjectType != null)

  return {
    route: meta.route,
    subjectType,
    subjectId: subjectType == null ? null : subjectId,
    resultCount,
  }
}

/**
 * Số bản ghi trả về: danh sách thì đếm phần tử, một chủ thể thì là 1.
 *
 * Không phải handler nào cũng bọc `{ message, data }` (module users trả thẳng đối tượng), nên đọc
 * mỗi `body.data` sẽ ra `null` ở đúng những route ghi nhật ký quan trọng nhất — nhật ký vẫn "xanh"
 * mà mất thông tin đọc bao nhiêu.
 *
 * Danh sách rỗng vẫn là một lần đọc trả 0 kết quả: không ghi thì không phân biệt được "tra khách
 * không có" với "không tra gì".
 */
function countResults(body: unknown, data: unknown, singleSubject: boolean): number | null {
  if (body == null) return null
  if (Array.isArray(data)) return data.length
  if (data != null) return 1
  if (Array.isArray(body)) return body.length
  return singleSubject ? 1 : null
}

/** id hợp lệ = số nguyên dương; mọi thứ khác (chuỗi rác, 0, số âm, undefined) là "không có id" */
function readId(value: unknown): number | null {
  const raw = Number(value)
  return Number.isInteger(raw) && raw > 0 ? raw : null
}
