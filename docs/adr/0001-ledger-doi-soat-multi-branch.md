# ADR 0001 — Sổ cái (ledger), đối soát và báo cáo tài chính

- **Trạng thái**: Đề xuất (chờ duyệt) — chưa implement
- **Ngày**: 2026-11-23
- **Phạm vi**: `restaurant-management-system` (BE NestJS + Prisma/Postgres)

## Bối cảnh

Hệ thống đã bán hàng thật (đơn tại bàn, đặt bàn, VNPay) nhưng **không có sổ sách**:
tiền chỉ tồn tại dưới dạng `Payment.amount` mutable + trạng thái `Order`, không có
bản ghi bất biến nào để đối soát hay giải trình.

Hiện trạng đã đo (bằng chứng):

| Vấn đề | Bằng chứng |
| --- | --- |
| `Payment` không phải bản ghi sự kiện: không `paidAt`, `currency`, `gatewayPayload`; `transactionId` không unique/không index | `prisma/schema.prisma:503-512` |
| Chỉ 3 trạng thái `PENDING/SUCCESS/FAILED` — không có refund | `prisma/schema.prisma:884-888` |
| Hai nhánh (return + IPN) cùng update 1 payment, không idempotency | `src/shared/service/vnpay.service.ts:275,407` |
| Không đối chiếu `vnp_Amount` với `Payment.amount` (chỉ verify chữ ký) | `src/shared/service/vnpay.service.ts:490-510` |
| `Payment.status` bị gán `OrderStatus.PENDING` (sai enum, chạy được nhờ trùng tên) | `src/shared/shared-repository/shared-orders.repo.ts:317` |
| Tiền dùng `Float` (`skuPrice`) và cộng bằng JS | `prisma/schema.prisma:327` |
| `Order` không có subtotal/discount/serviceCharge/tip/tax/total | `prisma/schema.prisma:335-365` |
| Báo cáo = kéo toàn bộ order+item+payment vào RAM rồi cộng | `src/routes/dashboard/dashboard-indicator.service.ts:17-40` |
| Không có `AuditLog` / `Branch` / `Refund` / `Invoice` | grep schema = 0 |
| Không có backup cho volume Postgres | `docker-compose.yml` (chỉ volume) |

Điểm tốt giữ nguyên: giá bán đã **snapshot** theo dòng đơn (`ProductSKUSnapshot`), và
BE **tự tính tiền từ DB**, không tin số tiền client gửi lên.

## Quyết định

### D1 — Sổ cái ghi kép (double-entry), append-only
`ledger_entry` (bút toán) + `ledger_line` (Nợ/Có theo tài khoản). Không UPDATE/DELETE;
sai thì ghi **entry đảo** (`reversalOfId`). Bất biến: `Σ debit = Σ credit` mỗi entry,
kiểm bằng test + query kiểm tra hằng ngày.

### D2 — Ghi sổ trong cùng transaction với nghiệp vụ
Posting gọi trong `prisma.$transaction` với thay đổi trạng thái đơn/thanh toán.
Có `idempotencyKey` UNIQUE trên `ledger_entry` để chống ghi trùng khi webhook lặp.

### D3 — Client không bao giờ ghi sổ
Không expose endpoint tạo/sửa ledger. Sổ chỉ sinh từ sự kiện nghiệp vụ:
đơn trả tiền mặt, đơn VNPay thành công, hoàn tiền, đặt cọc/giữ bàn, huỷ đơn.

### D4 — Đa chi nhánh là chiều bắt buộc của mọi bút toán
Thêm `Branch`; `branchId` bắt buộc trên `Order`, `Payment`, `ledger_entry`,
`Shift`; `Table`/`Area`/`TableNode` thuộc chi nhánh; tồn kho theo chi nhánh.
Báo cáo mặc định theo chi nhánh + kỳ, có tổng hợp toàn hệ thống.

### D5 — Tiền là Decimal, không Float
Tiền tệ `Decimal(14,2)` + `currency` (mặc định `VND`). Mọi phép tính dùng
`Prisma.Decimal`; cấm `number` cho tiền. Bỏ `Float` khỏi các cột tiền mới.

### D6 — `Order` phải có bóc tách tiền; tip là nợ phải trả nhân viên
`subtotal`, `discountTotal` (kèm `voucherSnapshotId` sẵn có), `serviceChargeRate` +
`serviceChargeAmount`, `tipAmount`, `taxTotal` (0 khi chưa dùng), `grandTotal`.

**Tip: KHOAN LÀM** (chủ dự án yêu cầu 2026-11-23). Quyết định kế toán khi làm:
tip là tiền của nhân viên → `TIP_PAYABLE` theo từng nhân viên, không phải doanh thu,
`net` không gồm tip. Đợt này chỉ thêm cột `Order.tipAmount` default 0 (để khỏi
migrate 2 lần), KHÔNG có luồng nhập tip, KHÔNG có bút toán tip, báo cáo không có cột tip.
`Payment.amount` phải bằng `grandTotal` và được **BE tính lại**, verify trước khi
đánh dấu thanh toán thành công.

**Ngoại lệ đã biết (đặt cọc, 2026-11-23):** luồng đặt bàn có cọc thì `Payment.amount` =
**tiền cọc phải thu** (`depositPercent` × giá trị đơn, BE tự tính), không bằng `grandTotal`
của đơn. Vì vậy phép đối chiếu số tiền của webhook VNPay **không** so với `grandTotal`
mà so với số tiền đã chốt trong `PaymentIntent` (bảng chốt `amount` + `orderIds` ngay lúc
tạo URL thanh toán). Khi có sổ cái, đơn cọc ghi 2 bút toán: thu cọc (nợ tiền / có
`DEPOSIT_LIABILITY`) và tất toán phần còn lại khi khách trả nốt.

### D7 — Đối soát hai nguồn độc lập
- **VNPAY**: *chưa có sao kê* (xác nhận 2026-11-23) → giai đoạn này đối soát
  **nội bộ** (`Payment` ↔ `ledger`) và **tra cứu từng giao dịch qua API VNPay
  (querydr)** để kiểm trạng thái/số tiền. Khi nào có file sao kê thì mở lại
  `settlement_import`/`settlement_line` (schema đã tính trước, xem ticket P2-2).
- **Tiền mặt**: đối soát theo **ca** (`Shift`: tiền đầu ca, thu, chi, kiểm đếm cuối ca,
  chênh lệch).
`reconciliation_run` + `reconciliation_item`
(`MATCHED | AMOUNT_MISMATCH | MISSING_IN_LEDGER | MISSING_IN_STATEMENT | DUPLICATE`
— `MISSING_IN_STATEMENT` chỉ dùng khi đã có sao kê)
— chạy theo lịch và chạy tay được; **báo cáo chênh lệch là sản phẩm chính**, không phải
"chạy lại báo cáo".

### D8 — Báo cáo là projection, không query runtime
Bảng tổng hợp theo `(ngày, chi nhánh, phương thức)`: gross, discount, service, tip,
tax, net, cash-in, vnpay-in, COGS, và **tip thu / tip đã trả nhân viên** (không nằm trong net). Sinh lại theo lịch + recompute được cho 1 kỳ.
Không bao giờ cộng doanh thu bằng cách join `Order` rồi lặp trong JS.

### D9 — Audit log cho thao tác tiền
Huỷ đơn, giảm giá, hoàn tiền, sửa giá: ghi `audit_log` (ai, khi nào, lý do,
trước/sau). Nhà hàng cần giải trình khi đối soát lệch.

## Ngoài phạm vi (đợt này)

Hoá đơn điện tử / kê khai thuế, đa tiền tệ, **hoàn tiền (chưa cần — xác nhận
2026-11-23)**, công nợ nhà cung cấp (AP), quản lý kho nâng cao (giữ nguyên module
hiện có). Phân bổ tip nhiều người trong một đơn / chia theo ca: để đợt sau — đợt này
tip gắn 1 nhân viên/đơn.

## Hệ quả

- **Không thể** làm ledger trước khi có `Branch` + bóc tách tiền trên `Order` +
  hardening `Payment` (idempotency, verify amount) — nếu không, sổ sẽ ghi số sai
  và không đối soát được.
- Migration cần backfill: `branchId` cho dữ liệu cũ (1 chi nhánh mặc định),
  `grandTotal` = `Payment.amount` hiện có cho đơn cũ.
- Báo cáo cũ (`dashboard/indicator`) sẽ được thay bằng projection; giữ endpoint
  cũ để FE không vỡ, trả dữ liệu từ projection.

## Ghi chú vận hành (2026-11-23)
Các migration của đợt này (`branch_and_order_money`, `payment_hardening`,
`skuprice_decimal`, `payment_intent`, `payment_transaction_index`) **chỉ có một chiều** (trừ
`payment_transaction_index` chỉ tạo index): chèn `Branch` mặc định,
`SET NOT NULL`, đổi `Payment.method` sang enum (cột cũ bị drop — dữ liệu trước khi đổi
đã kiểm là 100% NULL). Đã backup trước khi migrate (`.pi-run/pre-branch-backup.dump`).
Prisma không sinh migration rollback; muốn lùi phải restore backup. Chỉ áp dụng cho DB dev
hiện tại — khi lên môi trường thật phải viết down-path trước.

## Đã chốt với chủ dự án (2026-11-23)

1. **Sao kê VNPay**: chưa có file → đối soát nội bộ + tra cứu qua API VNPay trước.
2. **Tip**: *khoan làm* — chỉ giữ cột `tipAmount` default 0, không luồng, không bút toán.
3. **Hoàn tiền**: chưa cần → ngoài phạm vi đợt này (enum trạng thái vẫn khai để sau).
4. **Còn mở**: COGS làm ở P3 hay đợt sau; tip gắn theo ai (người thu tiền / người phục vụ bàn / nhập tay).
