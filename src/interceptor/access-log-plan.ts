/**
 * Quyết định ghi GÌ vào nhật ký truy cập, từ một request đã phục vụ xong.
 *
 * Tách khỏi interceptor để test được mà không cần HTTP: đây là chỗ dễ sai nhất (đọc nhầm `id`,
 * đếm nhầm số bản ghi) và sai ở đây thì nhật ký nói dối mà không ai phát hiện — nó vẫn "xanh".
 */

export type AccessLogPlanInput = {
  /** route khai trong `@LogAccess`, ví dụ "GET /customers/:id" */
  route: string
  /** `req.params` của request */
  params?: Record<string, unknown>
  /** giá trị handler trả về, TRƯỚC khi transformer bọc `{ message, data }` — nên đọc `body.data` */
  body?: unknown
}

export type AccessLogPlan = {
  route: string
  /** hồ sơ bị đọc, null với route danh sách */
  customerId: number | null
  /** số bản ghi trả về */
  resultCount: number | null
}

export function planAccessLog({ route, params, body }: AccessLogPlanInput): AccessLogPlan {
  const raw = Number(params?.id)
  const customerId = Number.isInteger(raw) && raw > 0 ? raw : null

  const data = (body as { data?: unknown } | null | undefined)?.data
  // danh sách rỗng vẫn là một lần đọc (trả 0 kết quả) — không ghi thì không phân biệt được "tra
  // khách không có" với "không tra gì"
  const resultCount = Array.isArray(data) ? data.length : data == null ? null : 1

  return { route, customerId, resultCount }
}
