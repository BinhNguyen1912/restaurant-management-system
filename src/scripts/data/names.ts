/** Dữ liệu tên/địa chỉ dùng cho bộ dữ liệu Việt Nam (tách file cho dễ đọc) */

export const EMPLOYEE_NAMES = [
  'Nguyễn Văn An', 'Trần Thị Bích', 'Lê Hoàng Cường', 'Phạm Thu Dung', 'Hoàng Minh Đức',
  'Vũ Thị Hồng', 'Đặng Quốc Hưng', 'Bùi Thanh Hương', 'Đỗ Văn Khánh', 'Ngô Thị Lan',
  'Dương Văn Long', 'Lý Thị Mai', 'Phan Đức Nam', 'Trịnh Thị Nga', 'Cao Văn Phúc',
  'Đinh Thị Quỳnh', 'Tạ Minh Sơn', 'Lưu Thị Tâm', 'Mai Văn Thắng', 'Chu Thị Thu',
  'Hà Văn Toàn', 'Võ Thị Trang', 'Đoàn Văn Tú', 'Nguyễn Thị Vân', 'Trần Văn Vũ',
  'Lê Thị Yến', 'Phạm Minh Anh', 'Hoàng Thị Bảo', 'Vũ Văn Bình', 'Đặng Thị Cẩm',
  'Bùi Văn Dũng', 'Đỗ Thị Diệp', 'Ngô Văn Giang', 'Dương Thị Hà', 'Lý Văn Hiếu',
  'Phan Thị Hoa', 'Trịnh Văn Huy', 'Cao Thị Kim', 'Đinh Văn Lâm', 'Tạ Thị Linh',
  'Lưu Văn Minh', 'Mai Thị Ngọc', 'Chu Văn Nghĩa', 'Hà Thị Nhung', 'Võ Văn Phong',
  'Đoàn Thị Phương', 'Nguyễn Văn Quân', 'Trần Thị Sương',
]

export const ACCOUNTANT_NAMES = ['Nguyễn Thị Kim Ngân', 'Trần Văn Tài', 'Lê Thị Mỹ Hạnh']

export const SUPPLIERS = [
  'Công ty TNHH Thực phẩm Vissan',
  'Hợp tác xã Rau an toàn Đà Lạt',
  'Công ty CP Thuỷ sản Minh Phú',
  'Đại lý Bia & Nước giải khát Sài Gòn',
  'Công ty TNHH Gia vị Phú Quốc',
  'Trang trại Gà sạch Bình Dương',
  'Công ty CP Sữa Việt Nam',
  'Chợ đầu mối Bình Điền',
]

export const BRANCHES = [
  {
    code: 'CN-Q1',
    name: 'Chi nhánh Quận 1',
    address: '123 Nguyễn Huệ, Phường Bến Nghé, Quận 1, TP.HCM',
  },
  {
    code: 'CN-Q3',
    name: 'Chi nhánh Quận 3',
    address: '45 Võ Văn Tần, Phường 6, Quận 3, TP.HCM',
  },
  {
    code: 'CN-TD',
    name: 'Chi nhánh Thủ Đức',
    address: '88 Võ Nguyên Giáp, Phường Hiệp Phú, TP. Thủ Đức',
  },
]

/** Danh mục thực đơn theo kiểu nhà hàng Việt */
export const CATEGORIES = ['Khai vị', 'Món chính', 'Lẩu & Nướng', 'Tráng miệng', 'Đồ uống', 'Bia & Rượu']

/** Món mới (bổ sung ngoài các món đã có) — tên + giá + danh mục + đơn vị bán */
export const DISHES = [
  { name: 'Chả giò hải sản', price: 89000, category: 'Khai vị' },
  { name: 'Gỏi ngó sen tôm thịt', price: 95000, category: 'Khai vị' },
  { name: 'Bánh khọt miền Tây', price: 75000, category: 'Khai vị' },
  { name: 'Súp măng cua', price: 65000, category: 'Khai vị' },
  { name: 'Phở bò tái nạm', price: 89000, category: 'Món chính' },
  { name: 'Cơm tấm sườn nướng', price: 79000, category: 'Món chính' },
  { name: 'Bún mắm miền Tây', price: 85000, category: 'Món chính' },
  { name: 'Mì xào bò cải rổ', price: 82000, category: 'Món chính' },
  { name: 'Lẩu mắm cá linh', price: 459000, category: 'Lẩu & Nướng' },
  { name: 'Lẩu gà lá é', price: 389000, category: 'Lẩu & Nướng' },
  { name: 'Bò nướng lá chuối', price: 289000, category: 'Lẩu & Nướng' },
  { name: 'Hải sản nướng muối ớt', price: 349000, category: 'Lẩu & Nướng' },
  { name: 'Bánh flan sữa dừa', price: 35000, category: 'Tráng miệng' },
  { name: 'Chè bưởi', price: 32000, category: 'Tráng miệng' },
  { name: 'Rau câu dừa', price: 30000, category: 'Tráng miệng' },
  { name: 'Trà đào cam sả', price: 45000, category: 'Đồ uống' },
  { name: 'Cà phê muối', price: 39000, category: 'Đồ uống' },
  { name: 'Nước chanh dây', price: 35000, category: 'Đồ uống' },
  { name: 'Bia Sài Gòn chai', price: 29000, category: 'Bia & Rượu' },
  { name: 'Bia Tiger bạc', price: 35000, category: 'Bia & Rượu' },
  { name: 'Rượu nếp cẩm', price: 120000, category: 'Bia & Rượu' },
]

/** Nguyên liệu Việt Nam thật: tên, đơn vị, giá nhập/đơn vị, tồn ban đầu */
export const INGREDIENTS = [
  { name: 'Thịt bò Úc', unit: 'kg', cost: 320000, stock: 45 },
  { name: 'Thịt heo ba chỉ', unit: 'kg', cost: 145000, stock: 60 },
  { name: 'Gà ta thả vườn', unit: 'kg', cost: 135000, stock: 40 },
  { name: 'Tôm sú tươi', unit: 'kg', cost: 380000, stock: 25 },
  { name: 'Mực ống', unit: 'kg', cost: 240000, stock: 18 },
  { name: 'Cá lóc đồng', unit: 'kg', cost: 95000, stock: 30 },
  { name: 'Cá linh', unit: 'kg', cost: 120000, stock: 15 },
  { name: 'Bánh phở tươi', unit: 'kg', cost: 32000, stock: 50 },
  { name: 'Bún tươi', unit: 'kg', cost: 25000, stock: 50 },
  { name: 'Gạo tấm', unit: 'kg', cost: 22000, stock: 80 },
  { name: 'Rau muống', unit: 'kg', cost: 18000, stock: 25 },
  { name: 'Cải rổ', unit: 'kg', cost: 26000, stock: 20 },
  { name: 'Ngó sen', unit: 'kg', cost: 55000, stock: 12 },
  { name: 'Xà lách', unit: 'kg', cost: 35000, stock: 15 },
  { name: 'Hành tím', unit: 'kg', cost: 42000, stock: 20 },
  { name: 'Tỏi', unit: 'kg', cost: 65000, stock: 15 },
  { name: 'Sả', unit: 'kg', cost: 25000, stock: 10 },
  { name: 'Lá é', unit: 'kg', cost: 40000, stock: 8 },
  { name: 'Nước mắm Phú Quốc', unit: 'l', cost: 85000, stock: 20 },
  { name: 'Dầu ăn', unit: 'l', cost: 42000, stock: 25 },
  { name: 'Nước dừa tươi', unit: 'l', cost: 30000, stock: 30 },
  { name: 'Sữa đặc', unit: 'l', cost: 60000, stock: 12 },
  { name: 'Cà phê rang xay', unit: 'kg', cost: 260000, stock: 10 },
  { name: 'Trà đào', unit: 'g', cost: 90000, stock: 2000 },
  { name: 'Bia chai', unit: 'piece', cost: 21000, stock: 300 },
]
