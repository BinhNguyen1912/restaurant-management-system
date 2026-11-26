import { Prisma, PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Danh mục tài khoản kế toán tối thiểu (ADR 0001 D1/D6).
 *
 * Chỉ seed danh mục, KHÔNG ghi bút toán. Sổ cái chỉ sinh từ sự kiện nghiệp vụ,
 * không cho client ghi trực tiếp (ADR D3).
 *
 * Chạy lại nhiều lần vẫn an toàn (upsert theo `code`).
 */
type AccountSeed = {
  code: string
  name: string
  type: 'ASSET' | 'LIABILITY' | 'REVENUE' | 'EXPENSE' | 'EQUITY'
  isCash?: boolean
}

const ACCOUNTS: AccountSeed[] = [
  // Tiền và tương đương tiền
  { code: 'CASH', name: 'Tiền mặt tại quầy', type: 'ASSET', isCash: true },
  { code: 'BANK', name: 'Tiền gửi ngân hàng', type: 'ASSET' },
  { code: 'VNPAY_CLEARING', name: 'Tiền VNPay chờ về', type: 'ASSET' },
  { code: 'INVENTORY', name: 'Hàng tồn kho', type: 'ASSET' },

  // Nợ phải trả
  { code: 'TAX_PAYABLE', name: 'Thuế phải nộp', type: 'LIABILITY' },
  { code: 'DEPOSIT_LIABILITY', name: 'Tiền cọc khách trả trước', type: 'LIABILITY' },
  { code: 'TIP_PAYABLE', name: 'Tip phải trả nhân viên', type: 'LIABILITY' },

  // Doanh thu
  { code: 'REVENUE_FOOD', name: 'Doanh thu món ăn', type: 'REVENUE' },
  { code: 'SERVICE_CHARGE', name: 'Doanh thu phí phục vụ', type: 'REVENUE' },
  { code: 'DISCOUNT', name: 'Giảm giá', type: 'EXPENSE' },

  // Chi phí / điều chỉnh
  { code: 'COGS', name: 'Giá vốn hàng bán', type: 'EXPENSE' },
  { code: 'CASH_SHORTAGE', name: 'Thiếu tiền quỹ', type: 'EXPENSE' },
  { code: 'CASH_OVERAGE', name: 'Thừa tiền quỹ', type: 'REVENUE' },
  { code: 'ROUNDING_ADJUSTMENT', name: 'Chênh lệch làm tròn', type: 'REVENUE' },

  // Thu/chi tiền mặt TAY trong ca (không phải doanh thu bán hàng)
  { code: 'OTHER_INCOME', name: 'Thu nhập khác bằng tiền mặt', type: 'REVENUE' },
  { code: 'OTHER_EXPENSE', name: 'Chi phí khác bằng tiền mặt', type: 'EXPENSE' },
]

async function main() {
  for (const account of ACCOUNTS) {
    await prisma.ledgerAccount.upsert({
      where: { code: account.code },
      update: {
        name: account.name,
        type: account.type,
        isCash: account.isCash ?? false,
      },
      create: {
        code: account.code,
        name: account.name,
        type: account.type,
        isCash: account.isCash ?? false,
        currency: 'VND',
      },
    })
  }

  const total = await prisma.ledgerAccount.count()
  console.log(`Đã seed ${ACCOUNTS.length} tài khoản kế toán (tổng trong DB: ${total})`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
