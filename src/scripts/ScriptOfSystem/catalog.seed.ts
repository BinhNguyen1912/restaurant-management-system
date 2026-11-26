import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Seed dữ liệu mẫu cho menu nhà hàng: danh mục + món ăn + biến thể + SKU + bản dịch.
 *
 * - Chạy lại nhiều lần vẫn an toàn (idempotent): món/danh mục tìm theo `name`, SKU theo (productId, value).
 * - Không đụng tới đơn hàng / thanh toán / sổ cái.
 * - KHÔNG seed ảnh ngoài (trước đây dùng picsum.photos): ảnh demo bị next/image chặn host
 *   và làm trắng trang. Để trống -> FE hiện placeholder, admin tự upload ảnh thật.
 *
 * Chạy:  npm run seed:catalog
 *        npm run seed:catalog -- --dry-run     (chỉ in ra sẽ làm gì, không ghi DB)
 */

type SeedSku = { value: string; price: number; image?: string }

type SeedProduct = {
  name: string
  description: string
  category: string
  basePrice: number
  virtualPrice: number
  images: string[]
  /** Biến thể (rỗng = món không biến thể, dùng 1 SKU mặc định theo tên) */
  variants?: { value: string; valueOption: { value: string; price: number; image?: string }[] }[]
}

type SeedCategory = { name: string; description: string; logo: string }

const LANGUAGE_ID = 'vi'
const LANGUAGES: { id: string; name: string }[] = [
  { id: 'vi', name: 'Tiếng Việt' },
  { id: 'en', name: 'English' },
]

/**
 * Ảnh seed = rỗng. Muốn có ảnh demo thì upload qua trang quản lý món (Cloudinary),
 * đừng dùng host ngoài vì next/image chỉ nhận host khai báo trong next.config.mjs.
 */
/**
 * KHÔNG bịa URL ảnh demo. Trước đây hàm này trả `''` và sản phẩm lưu `images: ['']` — chuỗi rỗng
 * làm PUT sản phẩm bị 400 (xem ProductImagesInputSchema), nên sản phẩm seed không sửa được.
 * Để rỗng hẳn (`[]`), FE hiện placeholder và admin tự upload ảnh thật.
 */
const img = (_seed: string) => ''

const CATEGORIES: SeedCategory[] = [
  { name: 'Khai vị', description: 'Món nhẹ mở đầu bữa ăn', logo: img('khai-vi') },
  { name: 'Món chính', description: 'Món ăn chính của bữa', logo: img('mon-chinh') },
  { name: 'Tráng miệng', description: 'Món ngọt sau bữa ăn', logo: img('trang-mieng') },
  { name: 'Đồ uống', description: 'Nước uống, cà phê, trà', logo: img('do-uong') },
]

const PRODUCTS: SeedProduct[] = [
  {
    name: 'Gỏi cuốn tôm thịt',
    description: 'Gỏi cuốn tươi với tôm, thịt heo, rau sống và nước chấm đậu phộng',
    category: 'Khai vị',
    basePrice: 45000,
    virtualPrice: 55000,
    images: [],
  },
  {
    name: 'Phở bò',
    description: 'Phở bò nước dùng xương ống hầm 8 tiếng, bánh phở tươi, thịt bò tái và nạm',
    category: 'Món chính',
    basePrice: 55000,
    virtualPrice: 65000,
    images: [],
    variants: [
      {
        value: 'Size',
        valueOption: [
          { value: 'Nhỏ', price: 45000, image: img('pho-bo-nho') },
          { value: 'Vừa', price: 55000, image: img('pho-bo-vua') },
          { value: 'Lớn', price: 65000, image: img('pho-bo-lon') },
        ],
      },
    ],
  },
  {
    name: 'Bún chả Hà Nội',
    description: 'Bún chả than hoa, thịt viên và chả miếng, nước mắm chua ngọt',
    category: 'Món chính',
    basePrice: 50000,
    virtualPrice: 60000,
    images: [],
  },
  {
    name: 'Cơm tấm sườn bì chả',
    description: 'Cơm tấm Sài Gòn với sườn nướng, bì, chả trứng và nước mắm',
    category: 'Món chính',
    basePrice: 55000,
    virtualPrice: 65000,
    images: [],
  },
  {
    name: 'Chè ba màu',
    description: 'Chè ba màu đậu xanh, đậu đỏ, thạch và nước cốt dừa',
    category: 'Tráng miệng',
    basePrice: 25000,
    virtualPrice: 30000,
    images: [img('che-ba-mau')],
  },
  {
    name: 'Cà phê sữa đá',
    description: 'Cà phê phin truyền thống với sữa đặc',
    category: 'Đồ uống',
    basePrice: 25000,
    virtualPrice: 30000,
    images: [img('ca-phe-sua-da')],
    variants: [
      {
        value: 'Size',
        valueOption: [
          { value: 'S', price: 25000, image: img('ca-phe-s') },
          { value: 'M', price: 32000, image: img('ca-phe-m') },
        ],
      },
    ],
  },
  {
    name: 'Trà đào cam sả',
    description: 'Trà đen ủ với đào ngâm, cam tươi và sả',
    category: 'Đồ uống',
    basePrice: 35000,
    virtualPrice: 40000,
    images: [img('tra-dao')],
  },
]

/** SKU sinh từ biến thể; không có biến thể thì 1 SKU mặc định theo tên món (khớp quy ước BE) */
function buildSkus(product: SeedProduct): SeedSku[] {
  if (!product.variants || product.variants.length === 0) {
    return [{ value: product.name, price: product.basePrice, image: product.images[0] ?? '' }]
  }
  return product.variants.flatMap((variant) =>
    variant.valueOption.map((option) => ({
      value: option.value,
      price: option.price,
      image: option.image ?? '',
    })),
  )
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  const admin = await prisma.user.findFirst({
    where: { email: 'admin@order.com', deletedAt: null },
    select: { id: true, email: true },
  })
  if (!admin) {
    throw new Error('Không tìm thấy user admin@order.com — chạy `npm run init-seed-data` trước')
  }
  console.log(`Người tạo dữ liệu: #${admin.id} ${admin.email}${dryRun ? ' (DRY RUN)' : ''}`)

  // 0. Ngôn ngữ (ProductTranslation/CategoryTranslation có FK tới Language)
  for (const language of LANGUAGES) {
    if (dryRun) continue
    await prisma.language.upsert({
      where: { id: language.id },
      update: { name: language.name },
      create: { id: language.id, name: language.name, createdById: admin.id },
    })
  }

  // 1. Danh mục
  const categoryIdByName = new Map<string, number>()
  for (const category of CATEGORIES) {
    if (dryRun) {
      console.log(`  [category] ${category.name}`)
      continue
    }
    const existing = await prisma.category.findFirst({
      where: { name: category.name, deletedAt: null },
      select: { id: true },
    })
    const record = existing
      ? await prisma.category.update({
          where: { id: existing.id },
          data: { logo: category.logo, updatedById: admin.id },
        })
      : await prisma.category.create({
          data: { name: category.name, logo: category.logo, createdById: admin.id },
        })

    const translation = await prisma.categoryTranslation.findFirst({
      where: { categoryId: record.id, languageId: LANGUAGE_ID },
      select: { id: true },
    })
    if (translation) {
      await prisma.categoryTranslation.update({
        where: { id: translation.id },
        data: { name: category.name, description: category.description, updatedById: admin.id },
      })
    } else {
      await prisma.categoryTranslation.create({
        data: {
          categoryId: record.id,
          languageId: LANGUAGE_ID,
          name: category.name,
          description: category.description,
          createdById: admin.id,
        },
      })
    }

    categoryIdByName.set(category.name, record.id)
    console.log(`  [category] #${record.id} ${category.name} (${existing ? 'cập nhật' : 'tạo mới'})`)
  }

  // 2. Món ăn (kèm biến thể, SKU, bản dịch)
  let created = 0
  let updated = 0
  for (const product of PRODUCTS) {
    const skus = buildSkus(product)
    const variants = product.variants ?? []
    const categoryId = categoryIdByName.get(product.category)

    if (dryRun) {
      console.log(`  [product] ${product.name} — ${skus.length} SKU, danh mục ${product.category}`)
      continue
    }

    const payload = {
      basePrice: product.basePrice,
      virtualPrice: product.virtualPrice,
      images: product.images,
      variants,
      publishedAt: new Date(),
      status: 'ACTIVE' as const,
      updatedById: admin.id,
    }

    const existing = await prisma.product.findFirst({
      where: { name: product.name, deletedAt: null },
      select: { id: true },
    })

    const record = existing
      ? await prisma.product.update({ where: { id: existing.id }, data: payload })
      : await prisma.product.create({
          data: {
            ...payload,
            name: product.name,
            createdById: admin.id,
            ...(categoryId ? { categories: { connect: [{ id: categoryId }] } } : {}),
          },
        })

    // SKU: upsert theo (productId, value) — thêm mới giá trị chưa có, cập nhật giá đã có
    for (const sku of skus) {
      await prisma.sKU.upsert({
        where: { productId_value: { productId: record.id, value: sku.value } },
        update: { price: sku.price, image: sku.image ?? '', updatedById: admin.id, deletedAt: null },
        create: {
          productId: record.id,
          value: sku.value,
          price: sku.price,
          image: sku.image ?? '',
          createdById: admin.id,
        },
      })
    }

    // Bản dịch
    const translation = await prisma.productTranslation.findFirst({
      where: { productId: record.id, languageId: LANGUAGE_ID },
      select: { id: true },
    })
    if (translation) {
      await prisma.productTranslation.update({
        where: { id: translation.id },
        data: { name: product.name, description: product.description, updatedById: admin.id },
      })
    } else {
      await prisma.productTranslation.create({
        data: {
          productId: record.id,
          languageId: LANGUAGE_ID,
          name: product.name,
          description: product.description,
          createdById: admin.id,
        },
      })
    }

    if (existing) updated += 1
    else created += 1
    console.log(`  [product] #${record.id} ${product.name} — ${skus.length} SKU (${existing ? 'cập nhật' : 'tạo mới'})`)
  }

  if (!dryRun) {
    const [categories, products, skusCount] = await Promise.all([
      prisma.category.count({ where: { deletedAt: null } }),
      prisma.product.count({ where: { deletedAt: null } }),
      prisma.sKU.count({ where: { deletedAt: null } }),
    ])
    console.log(
      `\nXong: ${created} món tạo mới, ${updated} món cập nhật. DB hiện có ${categories} danh mục, ${products} món, ${skusCount} SKU.`,
    )
  }
}

main()
  .catch((error) => {
    console.error('Seed thất bại:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
