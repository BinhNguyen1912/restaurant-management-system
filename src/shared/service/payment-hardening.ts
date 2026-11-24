import { Prisma } from '@prisma/client'

const HUNDRED = new Prisma.Decimal(100)

/**
 * VNPay gui `vnp_Amount` = so tien VND × 100 (ADR 0001 D7).
 *
 * Tra ve so VND nguyen, hoac `null` neu khong hop le (thieu, rac, hoac co phan le —
 * tien VND khong co xu nen bat ky phan le nao cung la bat thuong).
 */
export function parseVnpayAmount(vnpAmount: unknown): number | null {
  if (vnpAmount === null || vnpAmount === undefined || vnpAmount === '') return null

  let value: Prisma.Decimal
  try {
    value = new Prisma.Decimal(String(vnpAmount).trim())
  } catch {
    return null
  }

  if (!value.isFinite()) return null

  const amount = value.div(HUNDRED)
  if (!amount.isInteger()) return null

  return amount.toNumber()
}

/**
 * Doi chieu so tien khach da tra voi so tien ghi tren Payment.
 * Lech -> webhook phai bi tu choi, KHONG duoc danh dau thanh cong.
 */
export function isPaymentAmountMatched(expected: Prisma.Decimal.Value, vnpAmount: unknown): boolean {
  const received = parseVnpayAmount(vnpAmount)
  if (received === null) return false

  return new Prisma.Decimal(expected).toDecimalPlaces(2).equals(received)
}

/** So sanh 2 so tien theo nghia ke toan (bo qua duoi .00, khong so sanh float) */
export function isSameAmount(a: Prisma.Decimal.Value, b: Prisma.Decimal.Value): boolean {
  return new Prisma.Decimal(a).toDecimalPlaces(2).equals(new Prisma.Decimal(b).toDecimalPlaces(2))
}

export type WebhookIdentity = {
  provider: string
  externalId: string
  payload?: Prisma.InputJsonValue
}

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002'

/**
 * Ghi nhan 1 webhook theo (provider, externalId) — UNIQUE o DB la chot chan.
 *
 * Tra ve `true` neu day la lan dau tien (duoc phep tao hieu ung), `false` neu
 * da xu ly truoc do (replay: goi lai 5 lan van chi 1 hieu ung).
 */
export async function recordWebhookOnce(
  tx: { webhookEvent: { create: (args: { data: WebhookIdentity }) => Promise<unknown> } },
  identity: WebhookIdentity,
): Promise<boolean> {
  try {
    await tx.webhookEvent.create({ data: identity })
    return true
  } catch (error) {
    if (isUniqueViolation(error)) return false
    throw error
  }
}
