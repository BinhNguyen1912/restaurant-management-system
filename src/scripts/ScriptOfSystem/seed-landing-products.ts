import { PrismaClient, ProductStatus, SKUStatus } from '@prisma/client'

/**
 * Tạo sản phẩm từ DANH SÁCH ẢNH ở landing page (`restaurant-management-system-FE/src/components/logomarquee.tsx`).
 *
 * Vì sao cần script: ảnh đang nằm hardcode trong FE dưới dạng băng chuyền, không gắn với dữ liệu nào —
 * nên không mua/bán/đặt món được và cũng không hiện trên menu. Script biến chúng thành sản phẩm thật
 * (có SKU, có bản dịch vi/en) để dùng ngay.
 *
 * Chạy: npx ts-node -r tsconfig-paths/register src/scripts/ScriptOfSystem/seed-landing-products.ts
 *
 * Idempotent: chạy lại nhiều lần không tạo trùng — nhận diện theo `images[0]` (mỗi ảnh chỉ ứng với 1 món).
 */
const prisma = new PrismaClient()

/** 19 ảnh lấy đúng thứ tự trong logomarquee.tsx */
const IMAGES = [
  'https://i.pinimg.com/736x/c7/a7/55/c7a7554051337e29db3500ffc29282c4.jpg',
  'https://i.pinimg.com/1200x/d0/5e/5d/d05e5dcbd3fdb140cbe35bbf09ae3e99.jpg',
  'https://i.pinimg.com/736x/95/d3/d9/95d3d91aa1d8cef3e468e8d4896b0c9e.jpg',
  'https://i.pinimg.com/1200x/5a/2b/89/5a2b89255073a3085f37d9e796f356f2.jpg',
  'https://i.pinimg.com/1200x/e6/0d/51/e60d513d635ef5e27643977bba7d571e.jpg',
  'https://i.pinimg.com/1200x/0e/2f/dd/0e2fdd26cd255e80de81188654df607f.jpg',
  'https://i.pinimg.com/736x/73/3f/88/733f882a0fb4c6a11d38d40a8b9e1c8c.jpg',
  'https://i.pinimg.com/1200x/37/82/f6/3782f675fcc799d4bf35b4e527d4caec.jpg',
  'https://i.pinimg.com/736x/dd/93/c8/dd93c8f0be24bae098eb20767518e75f.jpg',
  'https://i.pinimg.com/736x/52/fb/1c/52fb1cb37cf94ecc1d4433e1339d2e7d.jpg',
  'https://i.pinimg.com/1200x/eb/d5/f0/ebd5f0fcdb93f6150c76a57de33345d4.jpg',
  'https://i.pinimg.com/736x/54/c7/b7/54c7b7b68818a4895eb63e8b7915a806.jpg',
  'https://i.pinimg.com/736x/45/41/3d/45413db4c4cec756b0c32fcf6c69c5a1.jpg',
  'https://i.pinimg.com/736x/e4/08/6e/e4086edc58c90f8d556356ad1064b790.jpg',
  'https://i.pinimg.com/736x/b9/f3/57/b9f3576e929b5f2be67bc23c3d2b63d1.jpg',
  'https://i.pinimg.com/736x/90/1b/71/901b71f8f0b98c48d2a012dd29a40eef.jpg',
  'https://i.pinimg.com/1200x/cd/55/1e/cd551e48c024b0fb96269d8259da5f6a.jpg',
  'https://i.pinimg.com/1200x/72/3a/73/723a73ec86cb39cc25319c86b4059d02.jpg',
  'https://i.pinimg.com/1200x/16/fc/4a/16fc4a20a9d7d25617499dc85550bc90.jpg',
]

/** Tên món + giá + tên tiếng Anh cho từng ảnh (thứ tự khớp IMAGES) */
const DISHES: { name: string; en: string; price: number; description: string; descriptionEn: string }[] = [
  { name: 'Phở bò đặc biệt', en: 'Special beef noodle soup', price: 85000, description: 'Phở bò nước dùng hầm xương 24 giờ', descriptionEn: 'Beef pho with 24-hour bone broth' },
  { name: 'Bún chả Hà Nội', en: 'Hanoi grilled pork noodles', price: 70000, description: 'Chả nướng than hoa, nước mắm chua ngọt', descriptionEn: 'Charcoal-grilled pork with sweet and sour fish sauce' },
  { name: 'Cơm tấm sườn bì chả', en: 'Broken rice with pork chop', price: 65000, description: 'Sườn nướng, bì, chả trứng, nước mắm', descriptionEn: 'Grilled pork chop, shredded pork skin, egg meatloaf' },
  { name: 'Bún bò Huế', en: 'Hue beef noodle soup', price: 75000, description: 'Nước dùng sả ớt đặc trưng xứ Huế', descriptionEn: 'Spicy lemongrass broth from Hue' },
  { name: 'Bánh xèo miền Tây', en: 'Mekong crispy pancake', price: 55000, description: 'Bánh xèo giòn nhân tôm thịt, giá đỗ', descriptionEn: 'Crispy pancake with shrimp, pork and bean sprouts' },
  { name: 'Gỏi cuốn tôm thịt', en: 'Fresh spring rolls', price: 45000, description: 'Gỏi cuốn tươi cuốn tôm, thịt, rau sống', descriptionEn: 'Fresh rolls with shrimp, pork and herbs' },
  { name: 'Chả giò rế', en: 'Crispy net spring rolls', price: 60000, description: 'Chả giò vỏ rế chiên giòn', descriptionEn: 'Deep-fried net-wrapper spring rolls' },
  { name: 'Nem nướng Nha Trang', en: 'Nha Trang grilled sausage', price: 65000, description: 'Nem nướng ăn kèm bánh tráng, rau sống', descriptionEn: 'Grilled pork sausage with rice paper and herbs' },
  { name: 'Mì Quảng tôm thịt', en: 'Quang noodles with shrimp and pork', price: 60000, description: 'Mì Quảng đặc sản Quảng Nam', descriptionEn: 'Quang Nam style turmeric noodles' },
  { name: 'Cao lầu Hội An', en: 'Hoi An cao lau', price: 70000, description: 'Sợi mì dày, thịt xá xíu, da heo giòn', descriptionEn: 'Thick noodles with char siu and crispy pork skin' },
  { name: 'Bánh canh cua', en: 'Crab thick noodle soup', price: 75000, description: 'Bánh canh cua đồng, chả cua', descriptionEn: 'Thick noodle soup with field crab' },
  { name: 'Hủ tiếu Nam Vang', en: 'Nam Vang noodle soup', price: 68000, description: 'Hủ tiếu khô hoặc nước, tôm thịt', descriptionEn: 'Dry or soup noodles with shrimp and pork' },
  { name: 'Lẩu thái hải sản', en: 'Thai seafood hotpot', price: 320000, description: 'Lẩu chua cay, hải sản tươi (2–3 người)', descriptionEn: 'Sweet and sour hotpot with fresh seafood (2–3 people)' },
  { name: 'Gà hấp lá chanh', en: 'Steamed chicken with lime leaves', price: 280000, description: 'Gà ta hấp lá chanh, chấm muối tiêu', descriptionEn: 'Free-range chicken steamed with lime leaves' },
  { name: 'Cá lóc nướng trui', en: 'Grilled snakehead fish', price: 250000, description: 'Cá lóc nướng rơm, bánh tráng, rau sống', descriptionEn: 'Straw-grilled snakehead fish with rice paper' },
  { name: 'Bò lá lốt', en: 'Beef in wild betel leaves', price: 90000, description: 'Bò cuốn lá lốt nướng than', descriptionEn: 'Grilled beef wrapped in wild betel leaves' },
  { name: 'Chè ba màu', en: 'Three-colour dessert', price: 30000, description: 'Chè đậu xanh, đậu đỏ, thạch, nước cốt dừa', descriptionEn: 'Mung bean, red bean and jelly in coconut milk' },
  { name: 'Bánh flan cà phê', en: 'Coffee flan', price: 35000, description: 'Bánh flan mềm với sốt cà phê', descriptionEn: 'Soft flan with coffee caramel' },
  { name: 'Cà phê sữa đá', en: 'Vietnamese iced coffee', price: 30000, description: 'Cà phê phin với sữa đặc', descriptionEn: 'Phin-brewed coffee with condensed milk' },
]

async function main() {
  const admin = await prisma.user.findFirst({ where: { deletedAt: null }, orderBy: { id: 'asc' }, select: { id: true } })
  if (!admin) throw new Error('Chưa có user nào để gán createdById — chạy seed tài khoản trước')
  const createdById = admin.id

  // Danh mục chứa các món này; tạo nếu chưa có để không treo sản phẩm không danh mục
  let category = await prisma.category.findFirst({ where: { name: 'Tinh hoa Việt', deletedAt: null } })
  if (!category) {
    category = await prisma.category.create({
      data: { name: 'Tinh hoa Việt', logo: IMAGES[0], createdById },
    })
    console.log('Tạo danh mục: Tinh hoa Việt')
  }

  const languages = await prisma.language.findMany({ select: { id: true } })
  const hasEn = languages.some((language) => language.id === 'en')

  let created = 0
  let updated = 0

  for (let index = 0; index < IMAGES.length; index += 1) {
    const image = IMAGES[index]
    const dish = DISHES[index]
    const basePrice = dish.price
    const virtualPrice = dish.price

    // nhận diện theo ảnh: mỗi ảnh ứng với đúng 1 món, chạy lại không tạo trùng
    const existing = await prisma.product.findFirst({ where: { images: { has: image } }, select: { id: true } })

    const product = existing
      ? await prisma.product.update({
          where: { id: existing.id },
          data: { name: dish.name, basePrice, virtualPrice, images: [image], status: ProductStatus.ACTIVE, publishedAt: new Date() },
        })
      : await prisma.product.create({
          data: {
            name: dish.name,
            basePrice,
            virtualPrice,
            images: [image],
            // 1 biến thể duy nhất "PHẦN" để bán được ngay trên màn gọi món
            variants: [{ value: 'PHẦN', valueOption: [{ value: 'Tiêu chuẩn', price: dish.price, image }] }],
            status: ProductStatus.ACTIVE,
            publishedAt: new Date(),
            createdById,
            categories: { connect: [{ id: category.id }] },
            skus: {
              create: [{ value: 'Tiêu chuẩn', price: dish.price, image, status: SKUStatus.AVAILABLE, createdById }],
            },
          },
        })

    // SKU: nếu là sản phẩm mới tạo ở trên thì đã có; nếu cập nhật thì đảm bảo có ít nhất 1 SKU
    if (existing) {
      const skuCount = await prisma.sKU.count({ where: { productId: product.id, deletedAt: null } })
      if (skuCount === 0) {
        await prisma.sKU.create({
          data: { value: 'Tiêu chuẩn', price: dish.price, image, status: SKUStatus.AVAILABLE, createdById, productId: product.id },
        })
      }
    }

    // Bản dịch: tiếng Việt (bản gốc) + tiếng Anh
    const translations: { languageId: string; name: string; description: string }[] = [
      { languageId: 'vi', name: dish.name, description: dish.description },
      ...(hasEn ? [{ languageId: 'en', name: dish.en, description: dish.descriptionEn }] : []),
    ]
    for (const translation of translations) {
      const found = await prisma.productTranslation.findFirst({
        where: { productId: product.id, languageId: translation.languageId },
        select: { id: true },
      })
      if (found) {
        await prisma.productTranslation.update({
          where: { id: found.id },
          data: { name: translation.name, description: translation.description, updatedById: createdById },
        })
      } else {
        await prisma.productTranslation.create({
          data: { ...translation, productId: product.id, createdById },
        })
      }
    }

    if (existing) updated += 1
    else created += 1
    console.log(`${existing ? 'cập nhật' : 'tạo mới'}: #${product.id} ${dish.name} — ${dish.price.toLocaleString('vi-VN')}đ`)
  }

  const total = await prisma.product.count({ where: { deletedAt: null } })
  console.log(`\nXong: tạo mới ${created}, cập nhật ${updated}. Tổng sản phẩm đang có: ${total}`)
}

main()
  .catch((error) => {
    console.error('Lỗi seed sản phẩm từ landing:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
