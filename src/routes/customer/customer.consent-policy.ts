/**
 * Chính sách đồng ý xử lý dữ liệu cá nhân (NĐ 13/2023/NĐ-CP) — toàn bộ luật nằm ở đây.
 *
 * Ba điều quan trọng, và cả ba đều "fail closed" (thiếu thông tin ⇒ coi như CHƯA được phép):
 *
 *  1. Đồng ý theo TỪNG MỤC ĐÍCH: cho số điện thoại để quán gọi lại về đơn hàng KHÔNG phải là đồng
 *     ý nhận quảng cáo. Vì vậy `purpose` là tham số bắt buộc, không có "đồng ý chung".
 *  2. Trạng thái hiện tại là DÒNG MỚI NHẤT của mục đích đó, không phải "tồn tại dòng granted=true":
 *     khách rút đồng ý thì lần ghi sau phải thắng lần ghi trước.
 *  3. Đổi phiên bản chính sách ⇒ đồng ý cũ hết hiệu lực: khách đã đồng ý với một bản khác.
 */

/** Phiên bản chính sách hiện hành. Sửa nội dung chính sách thì BẮT BUỘC tăng số này. */
export const CONSENT_POLICY_VERSION = '2026-11'

export const CONSENT_PURPOSES = ['SERVICE', 'MARKETING'] as const
export type ConsentPurposeValue = (typeof CONSENT_PURPOSES)[number]

/** Một dòng nhật ký đã đọc từ DB (append-only, mới nhất trước). */
export type ConsentRow = {
  purpose: string
  version: string
  granted: boolean
  createdAt: Date
}

export type ConsentState = {
  purpose: ConsentPurposeValue
  /** điều khách đã nói ở lần ghi nhận mới nhất (`false` khi chưa từng hỏi) */
  granted: boolean
  /** thời điểm ghi nhận mới nhất; `null` = chưa từng hỏi khách */
  at: Date | null
  version: string | null
  /** đồng ý theo một phiên bản chính sách đã cũ ⇒ phải hỏi lại */
  stale: boolean
  /** ĐƯỢC PHÉP xử lý dữ liệu cho mục đích này chưa — nguồn duy nhất để kiểm */
  active: boolean
}

function latestPerPurpose(rows: ConsentRow[]): Map<string, ConsentRow> {
  const latest = new Map<string, ConsentRow>()
  for (const row of rows) {
    const seen = latest.get(row.purpose)
    // Cùng mốc thời gian thì dòng ĐỨNG SAU thắng (repo trả mới nhất trước ⇒ dòng sau là bản cũ hơn).
    if (!seen || row.createdAt.getTime() > seen.createdAt.getTime()) latest.set(row.purpose, row)
  }
  return latest
}

/** Trạng thái hiện tại của MỌI mục đích — luôn đủ phần tử, kể cả mục đích chưa từng được hỏi. */
export function currentConsents(rows: ConsentRow[], policyVersion: string = CONSENT_POLICY_VERSION): ConsentState[] {
  const latest = latestPerPurpose(rows)
  return CONSENT_PURPOSES.map((purpose) => {
    const row = latest.get(purpose)
    const granted = row?.granted ?? false
    const stale = row != null && row.version !== policyVersion
    return {
      purpose,
      granted,
      at: row?.createdAt ?? null,
      version: row?.version ?? null,
      stale,
      active: granted && !stale,
    }
  })
}
