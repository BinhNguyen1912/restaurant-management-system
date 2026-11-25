import { BadRequestException, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '@/shared/service/prisma.service'

/**
 * Áp voucher cho 1 đơn (ticket #02).
 *
 * Vì sao phải snapshot: voucher có thể bị sửa/xoá sau khi bán. Đơn cũ phải giữ đúng con số đã
 * giảm để báo cáo/đối soát không đổi theo thời gian (ADR 0001 D6).
 *
 * `appliedDiscount` = số tiền THỰC SỰ giảm cho đơn này. `discountValue` chỉ là "10%" hay
 * "20.000đ" — với PERCENT thì không suy ra được số tiền nếu không biết tiền món lúc mua.
 */

const ZERO = new Prisma.Decimal(0)

export type VoucherSource = {
  id: number
  code: string
  discountType: 'PERCENT' | 'FIXED'
  discountValue: Prisma.Decimal.Value
  startAt: Date
  endAt: Date
  usageLimit: number | null
  status: string
}

export type AppliedVoucher = {
  snapshotId: number
  code: string
  discountType: 'PERCENT' | 'FIXED'
  discountValue: Prisma.Decimal
  appliedDiscount: Prisma.Decimal
}

/**
 * Tính số tiền giảm — hàm THUẦN, test được không cần DB.
 * Không bao giờ giảm quá tiền món (grandTotal không được âm).
 */
export function computeVoucherDiscount(
  voucher: Pick<VoucherSource, 'discountType' | 'discountValue'>,
  subtotal: Prisma.Decimal.Value,
): Prisma.Decimal {
  const base = new Prisma.Decimal(subtotal)
  if (base.lessThanOrEqualTo(0)) return ZERO

  const value = new Prisma.Decimal(voucher.discountValue)
  if (value.lessThanOrEqualTo(0)) return ZERO

  const discount =
    voucher.discountType === 'PERCENT'
      ? base.mul(value).div(100).toDecimalPlaces(0) // VND: làm tròn về đồng
      : value.toDecimalPlaces(0)

  return Prisma.Decimal.min(discount, base)
}

/** voucher có dùng được vào lúc này không (thuần, để test) */
export function checkVoucherUsable(
  voucher: VoucherSource,
  now: Date,
  usedCount: number,
): { ok: true } | { ok: false; message: string } {
  if (voucher.status !== 'ACTIVE') return { ok: false, message: 'Voucher đã bị ngưng' }
  if (now < voucher.startAt) return { ok: false, message: 'Voucher chưa tới thời gian sử dụng' }
  if (now > voucher.endAt) return { ok: false, message: 'Voucher đã hết hạn' }
  if (voucher.usageLimit !== null && usedCount >= voucher.usageLimit) {
    return { ok: false, message: 'Voucher đã hết lượt sử dụng' }
  }
  return { ok: true }
}

@Injectable()
export class VoucherService {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Kiểm + ghi snapshot voucher cho đơn trong CÙNG transaction với việc tạo đơn:
   * đơn tạo lỗi thì snapshot cũng không tồn tại (không đếm lượt "ma").
   */
  async applyVoucher(
    { code, subtotal }: { code: string; subtotal: Prisma.Decimal.Value },
    tx: Prisma.TransactionClient,
  ): Promise<AppliedVoucher> {
    const normalized = code.trim().toUpperCase()
    const voucher = await tx.voucher.findFirst({
      where: { code: normalized, deletedAt: null },
      select: {
        id: true,
        code: true,
        discountType: true,
        discountValue: true,
        startAt: true,
        endAt: true,
        usageLimit: true,
        status: true,
      },
    })
    if (!voucher) throw new BadRequestException(`Không tìm thấy voucher "${normalized}"`)

    // số lượt đã dùng = số snapshot đã sinh (không query Order: snapshot mới là nơi ghi lượt dùng)
    const usedCount = await tx.voucherSnapshot.count({ where: { voucherId: voucher.id } })
    const usable = checkVoucherUsable(voucher as VoucherSource, new Date(), usedCount)
    if (!usable.ok) throw new BadRequestException(usable.message)

    const appliedDiscount = computeVoucherDiscount(voucher, subtotal)
    if (appliedDiscount.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Error.VoucherGivesNoDiscount')
    }

    const snapshot = await tx.voucherSnapshot.create({
      data: {
        voucherId: voucher.id,
        code: voucher.code,
        discountType: voucher.discountType,
        discountValue: voucher.discountValue,
        startAt: voucher.startAt,
        endAt: voucher.endAt,
        appliedDiscount,
      },
      select: { id: true },
    })

    return {
      snapshotId: snapshot.id,
      code: voucher.code,
      discountType: voucher.discountType,
      discountValue: new Prisma.Decimal(voucher.discountValue),
      appliedDiscount,
    }
  }
}
