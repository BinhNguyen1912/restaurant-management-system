import { PrismaClient, Prisma } from '@prisma/client'
import {
  ANONYMIZED_NAME,
  ANONYMIZED_RESERVATION_PHONE,
  anonymizedPhone,
  isRetentionExpired,
  retentionCutoff,
} from './customer.anonymize-policy'

/**
 * Việc ẩn danh hoá hồ sơ khách — chỗ duy nhất trong hệ thống ghi đè PII của khách.
 *
 * Không nằm trong service/HTTP vì hai lý do: đây là việc định kỳ của quản trị (chạy bằng script,
 * không phải nhân viên bấm nút), và cần chạy được khi app không bật. Vì vậy module nhận thẳng một
 * Prisma client thay vì phụ thuộc Nest.
 */

/** Client Prisma hoặc một transaction của nó. */
export type AnonymizeDb = PrismaClient | Prisma.TransactionClient

export type AnonymizeCandidate = {
  id: number
  lastActivityAt: Date
  openOrders: number
}

export type AnonymizeSummary = {
  cutoff: Date
  retentionMonths: number
  apply: boolean
  /** số hồ sơ đã quét (đã lọc thô theo mốc thời gian) */
  scanned: number
  /** hồ sơ đủ điều kiện ẩn danh */
  eligible: { id: number; lastActivityAt: Date }[]
  anonymized: number
  /** số lượt đặt bàn bị thay tên/SĐT theo hồ sơ */
  reservations: number
  /** số lượt đặt bàn không gắn hồ sơ bị thay tên/SĐT */
  unlinkedReservations: number
}

/**
 * Hồ sơ "ngủ" quá mốc `cutoff`, kèm số đơn đang mở.
 *
 * Lọc thô bằng SQL để không kéo cả bảng khách vào bộ nhớ, nhưng **quyết định cuối vẫn ở
 * `isRetentionExpired`** (policy thuần, có test) — SQL chỉ là bộ lọc cho nhanh.
 *
 * "Lần hoạt động cuối" = muộn nhất trong: tạo hồ sơ, đơn hàng, đặt bàn (cả lúc tạo lẫn giờ hẹn —
 * khách đặt trước 13 tháng cho hôm nay thì hôm nay vẫn phải phục vụ), và lần ghi nhận đồng ý.
 * KHÔNG tính `Customer.updatedAt`: đó là lúc nhân viên sửa ghi chú, không phải khách hoạt động.
 */
export async function findAnonymizeCandidates(
  db: PrismaClient,
  cutoff: Date,
  take: number,
): Promise<AnonymizeCandidate[]> {
  return db.$queryRaw<AnonymizeCandidate[]>`
    WITH activity AS (
      SELECT
        c."id" AS "id",
        GREATEST(
          c."createdAt",
          COALESCE((SELECT max(o."createdAt") FROM "Order" o
                     WHERE o."customerId" = c."id" AND o."deletedAt" IS NULL), c."createdAt"),
          COALESCE((SELECT max(r."createdAt") FROM "Reservation" r
                     WHERE r."customerId" = c."id"), c."createdAt"),
          COALESCE((SELECT max(r."reservationTime") FROM "Reservation" r
                     WHERE r."customerId" = c."id"), c."createdAt"),
          COALESCE((SELECT max(l."createdAt") FROM "ConsentLog" l
                     WHERE l."customerId" = c."id"), c."createdAt")
        ) AS "lastActivityAt",
        (SELECT count(*)::int FROM "Order" o2
          WHERE o2."customerId" = c."id" AND o2."deletedAt" IS NULL
            AND o2."status" NOT IN ('PAID', 'COMPLETED', 'CANCELLED')) AS "openOrders"
      FROM "Customer" c
      WHERE c."anonymizedAt" IS NULL
    )
    SELECT "id", "lastActivityAt", "openOrders"
    FROM activity
    WHERE "lastActivityAt" < ${cutoff}
    ORDER BY "lastActivityAt", "id"
    LIMIT ${take}
  `
}

/**
 * Thay PII của MỘT hồ sơ, và của các lượt đặt bàn của hồ sơ đó.
 *
 * Hai thứ đi cùng nhau trong một transaction: hồ sơ đã ẩn danh mà lượt đặt bàn còn tên/SĐT là ẩn
 * danh nửa vời. `userId` giữ nguyên — tài khoản đăng ký là luồng xoá riêng (prod-readiness §M9.1),
 * xoá ở đây sẽ làm hỏng đăng nhập của một người khác.
 */
export async function anonymizeCustomer(
  db: AnonymizeDb,
  customerId: number,
  now: Date = new Date(),
): Promise<{ customerId: number; reservations: number }> {
  await db.customer.update({
    where: { id: customerId },
    data: {
      phone: anonymizedPhone(customerId),
      name: ANONYMIZED_NAME,
      email: null,
      note: null,
      anonymizedAt: now,
    },
    select: { id: true },
  })

  const reservations = await db.reservation.updateMany({
    where: { customerId },
    data: {
      customerName: ANONYMIZED_NAME,
      customerPhone: ANONYMIZED_RESERVATION_PHONE,
      note: null,
    },
  })

  return { customerId, reservations: reservations.count }
}

/**
 * Lượt đặt bàn KHÔNG gắn hồ sơ khách (SĐT không chuẩn hoá được, xem customer.identity.ts) vẫn là
 * dữ liệu cá nhân nhưng không có hồ sơ để lần theo tuổi — nên ẩn danh theo tuổi của chính nó.
 *
 * Điều kiện `customerPhone: { not: ANONYMIZED_RESERVATION_PHONE }` để chạy lại không đếm trùng.
 */
export async function anonymizeUnlinkedReservations(db: AnonymizeDb, cutoff: Date): Promise<number> {
  const result = await db.reservation.updateMany({
    where: {
      customerId: null,
      createdAt: { lt: cutoff },
      customerPhone: { not: ANONYMIZED_RESERVATION_PHONE },
    },
    data: {
      customerName: ANONYMIZED_NAME,
      customerPhone: ANONYMIZED_RESERVATION_PHONE,
      note: null,
    },
  })
  return result.count
}

/**
 * Ghi nhật ký ẩn danh. `before`/`after` CỐ Ý không chứa giá trị cũ: AuditLog là bảng append-only
 * nên nếu chép SĐT/tên vào đây thì việc ẩn danh bị vô hiệu ngay từ dòng nhật ký.
 */
async function writeAnonymizeAudit(
  tx: Prisma.TransactionClient,
  customerId: number,
  now: Date,
  reason: string,
  reservations: number,
) {
  await tx.auditLog.create({
    data: {
      actorId: null,
      actorRole: null,
      action: 'CUSTOMER_ANONYMIZED',
      entityType: 'CUSTOMER',
      entityId: customerId,
      reason,
      before: { anonymizedAt: null },
      after: { anonymizedAt: now.toISOString(), reservations },
    },
  })
}

const RETENTION_REASON = 'Hết thời hạn lưu dữ liệu cá nhân (NĐ 13/2023/NĐ-CP)'

/** Kết quả một yêu cầu xoá dữ liệu của khách — `status` là thứ script dựa vào để in và để thoát. */
export type AnonymizeByRequestResult =
  | { status: 'not-found'; customerId: number }
  | { status: 'already'; customerId: number }
  | {
      status: 'preview'
      customerId: number
      hasName: boolean
      hasEmail: boolean
      hasNote: boolean
    }
  | { status: 'done'; customerId: number; reservations: number }

/** Ẩn danh MỘT hồ sơ theo yêu cầu của khách (quyền xoá dữ liệu) — không phụ thuộc thời hạn lưu. */
export async function anonymizeByRequest(
  db: PrismaClient,
  customerId: number,
  input: { apply: boolean; now?: Date; reason?: string },
): Promise<AnonymizeByRequestResult> {
  const now = input.now ?? new Date()
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    select: { id: true, anonymizedAt: true, name: true, email: true, note: true },
  })
  if (!customer) return { status: 'not-found', customerId }
  if (customer.anonymizedAt) return { status: 'already', customerId }

  if (!input.apply) {
    return {
      status: 'preview',
      customerId,
      hasName: customer.name !== ANONYMIZED_NAME,
      hasEmail: customer.email !== null,
      hasNote: customer.note !== null,
    }
  }

  const erased = await db.$transaction(async (tx) => {
    const result = await anonymizeCustomer(tx, customerId, now)
    await writeAnonymizeAudit(
      tx,
      customerId,
      now,
      input.reason?.trim() || 'Khách yêu cầu xoá dữ liệu',
      result.reservations,
    )
    return result
  })
  return { status: 'done', customerId, reservations: erased.reservations }
}

/**
 * Quét hồ sơ đã hết thời hạn lưu và ẩn danh. `apply: false` chỉ liệt kê — mặc định của script là
 * chạy thử, để không ai xoá dữ liệu bằng một lần gõ nhầm.
 */
export async function anonymizeExpired(
  db: PrismaClient,
  input: { retentionMonths: number; apply: boolean; limit?: number; now?: Date },
): Promise<AnonymizeSummary> {
  const now = input.now ?? new Date()
  const cutoff = retentionCutoff(now, input.retentionMonths)
  const rows = await findAnonymizeCandidates(db, cutoff, input.limit ?? 200)

  const eligible = rows.filter((row) =>
    isRetentionExpired({
      lastActivityAt: row.lastActivityAt,
      openOrders: row.openOrders,
      now,
      retentionMonths: input.retentionMonths,
    }),
  )

  const summary: AnonymizeSummary = {
    cutoff,
    retentionMonths: input.retentionMonths,
    apply: input.apply,
    scanned: rows.length,
    eligible: eligible.map((row) => ({ id: row.id, lastActivityAt: row.lastActivityAt })),
    anonymized: 0,
    reservations: 0,
    unlinkedReservations: 0,
  }
  if (!input.apply) return summary

  for (const row of eligible) {
    const erased = await db.$transaction(async (tx) => {
      const result = await anonymizeCustomer(tx, row.id, now)
      await writeAnonymizeAudit(tx, row.id, now, RETENTION_REASON, result.reservations)
      return result
    })
    summary.anonymized += 1
    summary.reservations += erased.reservations
  }

  summary.unlinkedReservations = await anonymizeUnlinkedReservations(db, cutoff)
  return summary
}
