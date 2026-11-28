# Plan review & fix theo module trước khi lên production

Tài liệu này là **kế hoạch làm việc**, không phải báo cáo kiểm toán. Mục tiêu: đưa hệ thống
`res-mana-system` (BE NestJS/Prisma + FE Next.js) ra production với 3 bảo đảm:

1. **Không sai tiền** — sổ cái, doanh thu, tồn kho, ca két khớp và giải trình được.
2. **Đúng nghiệp vụ nhà hàng VN** — đặt bàn/cọc, tách thuế, huỷ/hoàn, kiểm soát nội bộ.
3. **Đúng nghĩa vụ pháp lý VN** — hoá đơn, lưu trữ kế toán, dữ liệu cá nhân, an toàn thông tin.

> Mọi mục "pháp lý" trong tài liệu là **đánh giá kỹ thuật**, phải được kế toán trưởng và luật sư
> xác nhận trước khi dùng để kê khai/giải trình.

## Trạng thái phát hành

Đợt 27 + 1 lỗi dưới đây đã lên `main` qua 2 PR (bấm vào là ra đúng trang):

| Hạng mục | Liên kết |
|---|---|
| PR backend (đã merge) | [#56](https://github.com/BinhNguyen1912/restaurant-management-system/pull/56) |
| PR frontend (đã merge) | [#47](https://github.com/BinhNguyen1912/restaurant-management-system-FE/pull/47) |
| Merge commit BE trên `main` | [`d117dcb`](https://github.com/BinhNguyen1912/restaurant-management-system/commit/d117dcb8efa80cf75e7e026322b79adfb549531b) |
| Merge commit FE trên `main` | [`cc0c490`](https://github.com/BinhNguyen1912/restaurant-management-system-FE/commit/cc0c490477a6f46873f1f1532483d8f7863976be) |
| CI chạy trên `main` (BE) | [run 46128382043](https://github.com/BinhNguyen1912/restaurant-management-system/actions/runs/46128382043) |
| CI chạy trên `main` (FE) | [run 46128389519](https://github.com/BinhNguyen1912/restaurant-management-system-FE/actions/runs/46128389519) |
| Nhánh review (giữ lại để đối chiếu diff) | [BE](https://github.com/BinhNguyen1912/restaurant-management-system/tree/review/prod-readiness) · [FE](https://github.com/BinhNguyen1912/restaurant-management-system-FE/tree/review/prod-readiness) |
| Bản sửa đối soát ghép theo chi nhánh (§0.1 #28) | [`reconciliation-check.ts`](https://github.com/BinhNguyen1912/restaurant-management-system/blob/main/src/routes/reconciliation/reconciliation-check.ts) · [`reconciliation.service.ts`](https://github.com/BinhNguyen1912/restaurant-management-system/blob/main/src/routes/reconciliation/reconciliation.service.ts) |

Hai PR **phải đi cùng nhau**: `pay all` đổi `GET → POST` ở BE, FE gọi đúng method mới. Merge lệch
nhau giữa hai repo sẽ làm nút thu tiền ở FE gọi sai.

> Đợt này vào `main` **không có review độc lập** (chỉ có CI xanh: typecheck, unit, `next build`,
> và E2E trên Postgres/Redis dựng mới). Các chỗ nên có người đọc lại diff: bút toán đảo khi huỷ đơn,
> quyết toán cọc, ghép bút toán theo chi nhánh, và mức cọc do BE chốt (§0.2).

---

## 0. Trạng thái xuất phát (sau 2 vòng audit + fix)

Đo được, không phải cảm nhận:

| Hạng mục | Kết quả |
|---|---|
| `tsc --noEmit` BE | PASS |
| `tsc --noEmit` FE | PASS |
| `prisma validate` | PASS (schema + 3 migration mới) |
| Unit test BE | **279 passed / 42 suite** |
| E2E BE | 4 suite (`finance`, `inventory`, `stock-receipt`, `table-open`) — **52/52**, chạy lại sau mỗi đợt sửa auth (3 lần liên tiếp trên DB dựng lại từ đầu ở đợt trước); CI cũng xanh trên Postgres+Redis mới |
| `npm audit --omit=dev` | BE: 35 lỗ hổng (1 critical) · FE: 18 (1 critical) |
| Lỗi chặn production đã **sửa** | 31 (danh sách §0.1) |
| Lỗi chặn production **còn lại** | 2 nhóm — 1 BLOCKER + 1 HIGH (danh sách §0.2) |

### 0.1 Đã sửa (có test chứng minh)

| # | Lỗi | File chính | Test |
|---|---|---|---|
| 1 | `vnp_TxnRef` khác `PaymentIntent.reference` ⇒ webhook VNPay không tìm được intent, mất chốt số tiền, đơn cọc báo `amount_mismatch` dù khách đã bị trừ tiền | `src/shared/service/vnpay.service.ts` | `vnpay-txnref.spec.ts` |
| 2 | `GET /guest/listGuests` trả khách **mọi chi nhánh** kèm `token` QR của bàn (chiếm được phiên khách bàn khác) | `guest.repo.ts`, `guest.service.ts`, `guest.controller.ts`, `guest.model.ts` | build + review |
| 3 | Socket: khách tự join `ManagerRoom` nhận đơn/tiền toàn chuỗi; `guest-send-message` tin `guestId` từ body | `app.gateway.ts`, `webSocket.adapter.ts` | build + review |
| 4 | Mỗi lần restart, tồn kho Redis bị ghi đè bằng Postgres ⇒ hoàn lại phần đã bán của đơn đang chờ job ⇒ bán âm | `cacheLoader.service.ts` | `cacheLoader.service.spec.ts` |
| 5 | Job tồn kho ghi **số tuyệt đối** ⇒ xoá hàng vừa nhập; nhánh đơn đặt bàn thiếu `deducted`; lỗi transaction không hoàn Redis | `inventory.processor.ts`, `shared-orders.repo.ts` | `inventory.processor.spec.ts` |
| 6 | Báo cáo/dashboard kỳ đang mở bị "đóng băng" ở lần tính đầu tiên trong ngày | `reports.service.ts` | `reports-projection.spec.ts` |
| 7 | Nhân viên đã xoá/khoá vẫn dùng hệ thống tới khi token hết hạn | `access-token.guard.ts` | `access-token.guard.spec.ts` |
| 8 | Đóng ca: `Number("1.000.000")` → `NaN` → `null` → BE coerce thành **0** ⇒ đóng ca 0đ, tự sinh bút toán thiếu quỹ cả két | `cash-shift-board.tsx`, `cash-shift.model.ts` | `cash-shift.model.spec.ts` |
| 9 | Khách refresh token gọi sai route (404) + RT không rotate + cookie `expires` sai (`ext`) | `apiRequest/guest.ts`, `guest.controller.ts`, `guest.repo.ts`, `refresh-token/route.ts` | build + review |
| 10 | `deploy:prepare:prod` chạy `create-permissions` ⇒ mỗi deploy xoá quyền đã tick trên UI + khởi động app thứ hai ghi đè Redis | `package.json`, `docs/deploy.md` | review |
| 11 | Phiếu nhập hàng ghi `stock: newStock` tuyệt đối ⇒ 2 phiếu đồng thời mất 1 | `ingredient.repo.ts` | `createStockReceipt` dùng `increment` |
| 12 | Ghi chéo chi nhánh ở `table-node` (sửa/mở/đóng/xoá/batch) và `PUT /orders/:id`; `GET /tables` thiếu `roleName` ⇒ ADMIN 403 | `table-node.repo/service/controller.ts`, `orders.service/controller.ts`, `table.service/controller.ts` | `tsc` + review |
| 13 | Sửa số lượng/giảm giá không tính lại tiền (và sửa tiền đơn đã thu) | `shared-orders.repo.ts` (`updateOrder`) | `order-status-machine.spec.ts` |
| 14 | Huỷ đơn đã thu: **không** đảo sổ, **không** hoàn kho, **không** đảo COGS, **không** nhả voucher; `PAID→CANCELLED` lọt | `shared-orders.repo.ts` (`refundPaidOrder`, `computeOrderIngredientUsage`) | `order-status-machine.spec.ts` + e2e |
| 15 | `LedgerEntry/LedgerLine/AuditLog` append-only chỉ bằng quy ước | `prisma/migrations/20261127000000_ledger_append_only` | migration + e2e (`UPDATE` phải lỗi) |
| 16 | Đối soát báo lệch giả: bỏ sót `RESERVATION_DEPOSIT`, cộng cả `CASH_MOVEMENT/CASH_VARIANCE` | `shared/constants/ledger.constant.ts`, `reconciliation.service.ts`, `ledger-entry.repo.ts` | review |
| 17 | Voucher: 2 request đồng thời cùng vượt `usageLimit`; huỷ đơn không nhả lượt | `prisma/migrations/20261127010000_voucher_used_count`, `voucher.service.ts`, `shared-orders.repo.ts` | `voucher.service.spec.ts` |
| 18 | Mở ca không ghi bút toán tiền lẻ đầu ca ⇒ sổ quỹ thiếu đúng `openingFloat` | `prisma/migrations/20261127020000_shift_opening_float`, `cash-shift.service.ts`, `cash-shift.repo.ts` | review + e2e |
| 19 | Thu tiền "pay all" bằng **GET** (prefetch/retry gọi hộ), 1 click không xác nhận, không ghi phương thức | `orders.controller/service/repo.ts`, `orders.model/dtos.ts`, `test/finance.e2e-spec.ts` | e2e (đã đổi sang POST) |
| 20 | FE không invalidate sổ quỹ/sổ cái/báo cáo sau khi thu tiền; badge "Đã thanh toán" chỉ cộng `items[0]` | `useOrder.ts`, `order-guest-detail.tsx` | `tsc` + review |
| 21 | VNPay redirect về `/payment-success` (và `payment-failed/error`) bị **404** vì FE không có route | `src/app/payment-success|payment-failed|payment-error/page.tsx` + `apiRequest/order.ts` | `tsc` + smoke test |
| 22 | Double-submit khi đặt món / tạo đơn ⇒ 2 đơn, thu tiền 2 lần | `menu-order.tsx`, `add-order.tsx` | `tsc` + review |
| 23 | Refresh token nhân viên lưu plaintext, không rotate, không thu hồi khi xoá user | `prisma/migrations/20261128000000_refresh_token_rotation`, `auth.repo.ts`, `auth.service.ts`, `token-hash.ts`, `shared-refreshToken.ts`, `users.service.ts` | `auth.service.refresh.spec.ts`, `token-hash.spec.ts` |
| 24 | Cọc reservation: BE tính một số, VNPay thu số khác — `Payment.amount` ghi số client gửi, tiền thu theo `expectedDeposit` ⇒ lệch tới 1.000đ, và chính con số client đó đi vào bút toán quyết toán cọc; cọc lệch trả **500** thay vì 400; `depositPercent` lạ (40%) nổ 500 | `src/shared/service/deposit-policy.ts`, `src/routes/reservation/reservation.repo.ts`, `src/routes/orders/orders.dtos.ts` | `deposit-policy.spec.ts` |
| 25 | Đơn đặt bàn có preorder **không thể thu tiền**: `payOrdersByGuest` đòi `Payment.amount === grandTotal` trong khi `Payment.amount` là tiền cọc; và nó ghi `Nợ CASH = grandTotal` **rồi** thêm bút toán tất toán cọc ⇒ doanh thu và tiền mặt bị đếm hai lần | `src/routes/orders/orders.repo.ts`, `src/shared/service/order-ledger-lines.ts`, `deposit-settlement.ts` | `order-ledger-lines.spec.ts`, `orders-deposit-settlement.spec.ts` |
| 26 | Lần thu thứ hai (phần còn lại) không có chỗ ghi: `Order.paymentId` đã trỏ vào Payment cọc (`SUCCESS`) nên `updateMany({ status: PENDING })` khớp 0 dòng | `prisma/migrations/20261128010000_payment_order_link`, `prisma/schema.prisma` (`Payment.orderId`) | `orders-deposit-settlement.spec.ts` |
| 27 | Bút toán thu tiền dùng chung một khoá idempotency cho cả lần thu cọc và lần thu nốt ⇒ lần thứ hai bị coi là bản trùng và mất bút toán | `src/routes/orders/orders.repo.ts` (`cash:deposit-settle:<paymentId>`) | `orders-deposit-settlement.spec.ts` |
| 28 | Đối soát gán bút toán cho payment **chỉ theo `refId`**, bỏ qua chi nhánh ⇒ một bút toán thu tiền ở chi nhánh khác trùng `refId` (bút toán giả của test báo cáo dùng `refId` 1,2,3,9,11; hoặc DB bị reset/import làm sequence id Payment đếm lại) bị quy cho payment thật ⇒ báo lệch giả `DUPLICATE`, `MATCHED = 0` | `src/routes/reconciliation/reconciliation-check.ts` (`selectEntriesForPayment`), `reconciliation.service.ts` | `reconciliation-check.spec.ts` (4 ca) + e2e trên DB dựng mới |
| 29 | Mức cọc reservation do **client** quyết: `depositAmount` nằm trong body tạo reservation nên con số đó đi vào `Payment.amount`, số VNPay thu và bút toán quyết toán cọc | `src/routes/reservation/reservation.model.ts` (bỏ `depositAmount` khỏi `reservationBodySchema`), `reservation.repo.ts`, `src/shared/service/deposit-policy.ts` | `reservation-deposit-input.spec.ts`, `deposit-policy.spec.ts` |
| 30 | `/auth/login` không đếm lần sai ⇒ dò mật khẩu không giới hạn; chỉ có throttler 40 request/phút/IP vừa chặn nhầm nhiều chi nhánh dùng chung một IP văn phòng, vừa không chặn được kẻ đổi IP | `prisma/migrations/20261128020000_login_lockout`, `src/routes/auth/login-lockout.ts`, `auth.service.ts`, `auth.repo.ts`, `auth.error.ts`, `audit-log.service.ts` | `login-lockout.spec.ts`, `auth.service.lockout.spec.ts` |
| 31 | OTP: mã lưu **plaintext**, không đếm lượt nhập sai, mã cũ vẫn sống sau khi phát mã mới (mỗi mã là dòng vô danh nên không có chỗ gắn bộ đếm); `createVerificationCode` còn nuốt lỗi vì `try { return promise } catch` thiếu `await` ⇒ trả `undefined` mà không ném | `prisma/migrations/20261128030000_otp_hash_and_attempts`, `src/routes/auth/otp-policy.ts`, `auth.service.ts`, `auth.repo.ts`, `auth.model.ts`, `auth.error.ts` | `otp-policy.spec.ts` (10 ca), `auth.service.otp.spec.ts` (10 ca) |

### 0.2 Còn lại, xếp theo mức chặn production

| # | Lỗi | Mức | Module xử lý |
|---|---|---|---|
| 1 | Không có hoá đơn (điện tử), không có MST/tên pháp nhân; VAT 1 mức cho toàn chi nhánh thay vì theo món | BLOCKER (pháp lý) — schema + tích hợp nhà cung cấp | M10 |
| 2 | 2FA khi đăng nhập (`totpCode` khai trong schema mà không kiểm); PII & consent; media chứng từ lưu ra nước ngoài (refresh token đã xong — mục 23; khoá đăng nhập tạm — mục 30; OTP — mục 31) | HIGH (pháp lý) | M1, M9 |

**Cọc reservation — đã làm (mục 24–27), mức cọc do BE chốt đã xong (mục 29).** Quyết định schema đã phác
lúc lập kế hoạch (thêm bảng `OrderPayment`) **không dùng**: chỉ thêm `Payment.orderId` (nullable,
`onDelete: SetNull`), nên mọi đường đọc `Order.paymentId` giữ nguyên và báo cáo không phải sửa. Luồng thu nốt
nằm trong `payOrdersByGuest` thay vì route `settle-reservation` riêng, vì đơn có cọc và đơn thường chỉ khác nhau
ở chỗ "phần còn lại phải thu"; tách route sẽ nhân đôi toàn bộ đường thu tiền. Bút toán chỉ **một** dòng cho cả
hoá đơn: `Nợ CASH = grandTotal − cọc`, `Nợ DEPOSIT_LIABILITY = cọc` (plan phác thêm một bút toán tất toán cọc
riêng — ghi hai lần là đếm doanh thu hai lần). Chứng minh: 6 test mới xanh, và phá nhánh tạo `Payment` riêng thì
2 test đỏ.

**Khoá đăng nhập tạm — đã làm (mục 30).** 5 lần sai liên tiếp ⇒ khoá 15 phút, đếm trên chính tài khoản
(`User.failedAttempts`, `User.lockedUntil`) chứ không theo IP: ba chi nhánh dùng chung một IP văn phòng là
chuyện bình thường, nên đếm theo IP vừa khoá nhầm người thật vừa không chặn được kẻ đổi IP. Bộ đếm về 0
ngay khi khoá — để nguyên ở ngưỡng thì lần gõ sai đầu tiên sau khi mở khoá lại khoá tiếp, tài khoản thành
khoá vĩnh viễn. Đăng nhập đúng thì xoá dấu vết sai; mỗi lần khoá ghi `AuditLog` với action `LOGIN_LOCKED`;
trả **423** kèm `minutes` còn lại để FE phân biệt "gõ sai, thử lại được" với "đang bị khoá".

**OTP — đã làm (mục 31).** Mã chỉ 6 số và sống 5 phút, nên ba lỗ cũ cộng lại là dò được: không đếm
lượt sai, mã cũ vẫn sống sau khi phát mã mới, và mã nằm plaintext trong bảng. Nay DB chỉ giữ
`sha256(code)`; tra theo `(email, type)` để lấy mã đang sống rồi so hash bằng `timingSafeEqual` —
đổi khoá tra cứu là cái giá phải trả để gắn được bộ đếm vào đúng dòng mã, vì trước đây mỗi mã là một
dòng vô danh không có chỗ ghi "đã bị nhập sai bao nhiêu lần". Nhập sai 5 lần ⇒ mã bị vô hiệu và trả
**429**, khác 422 "gõ lại mã này" — FE phải phân biệt được hai tình huống. Phát mã mới thì mã cũ cùng
`(email, type)` bị vô hiệu trong cùng transaction; claim lượt dùng nằm ngay trong bước kiểm nên hai
request song song không cùng đi qua một mã. Gửi quá 5 lượt/15 phút cho một email ⇒ **429**, và gửi
email hỏng thì dòng vừa tạo bị xoá để trả lại lượt — nếu không, khách tự khoá mình khỏi luồng đăng ký
chỉ vì nhà cung cấp email trục trặc. Backfill migration đổi mã đang bay sang hash (thử trên DB có sẵn
một mã sống: `sha256('123456') = 8d969eef…`), nên deploy giữa lúc khách đang chờ mã không làm hỏng gì.

**PII & consent — đã làm phần code (mục 32), còn chính sách có chữ ký + script ẩn danh hoá.** Nhật ký
đồng ý nằm ở `ConsentLog` — append-only (trigger chặn `UPDATE`), đồng ý **theo từng mục đích**
(`SERVICE` khác `MARKETING`: cho SĐT để quán gọi về đơn không phải là đồng ý nhận quảng cáo), "đang
đồng ý" = dòng mới nhất của `(customerId, purpose)`, thiếu dòng ⇒ **chưa** đồng ý, và đổi nội dung
chính sách (tăng `CONSENT_POLICY_VERSION`) thì mọi đồng ý cũ thành `stale` — hết hiệu lực cho tới khi
hỏi lại. Đặt bàn nhận `marketingConsent?`: **không gửi = chưa hỏi khách ⇒ không ghi gì**, không tự ghi
"đồng ý" thay khách; ghi tại quầy qua `POST /customers/:id/consent` (STAFF được phép — người hỏi là
nhân viên), mỗi lần ghi đều có `AuditLog` `CONSENT_RECORDED`. Bản nháp chính sách lưu trữ:
`docs/pii-retention-policy.md` — trong đó nêu rõ **quyền xoá dữ liệu không xoá được chứng từ kế toán**
(hoá đơn giữ số tiền, danh tính chỉ còn `customerId` trỏ tới hồ sơ đã ẩn danh). **Chưa làm**: script
ẩn danh hoá và job định kỳ (chưa có code nào chạy việc này), `AccessLog`, audit cho việc sửa ghi chú.

**Refresh token nhân viên — đã làm (mục 23); phần còn lại của nhóm (2) là 2FA,
media chứng từ.** Thiết kế đã chốt lúc lập kế hoạch giữ nguyên: `tokenHash @unique` (sha256), `familyId`,
`usedAt`, `revokedAt`; refresh = claim nguyên tử, `count = 0` thì revoke cả family; login tạo family mới;
logout/đổi mật khẩu/xoá user revoke toàn bộ family của user. Migration backfill bằng
`encode(sha256(convert_to(token,'UTF8')),'hex')` (hàm có sẵn từ Postgres 11, không cần pgcrypto); `familyId`
backfill bằng `md5(random()::text || clock_timestamp()::text)` để không phụ thuộc `gen_random_uuid()`.

Ba điều chỉnh so với bản phác, ghi lại để khỏi bàn lại:

- Claim và bước mint token kế nhiệm nằm ở hai transaction khác nhau. Mint lỗi thì token vừa trình ra ở trạng
  thái "đã dùng" mà không có token thay thế, nên lần thử lại của client bị coi là dùng lại token cũ và revoke
  cả family. Đã thêm `unclaimRefreshToken` trả token về chưa dùng ở nhánh lỗi đó (có test riêng) thay vì gộp
  mint vào cùng transaction.
- Access token vẫn dùng được tới khi hết hạn sau khi đã revoke: guard chỉ kiểm chữ ký và trạng thái user trong
  DB. Chấp nhận được vì TTL production là 1h; muốn thu hồi tức thời phải kiểm thêm `revokedAt` trong guard,
  đổi lại mỗi request thành một truy vấn DB.
- `findRefreshTokenIncludingRole` không còn caller nào (đường refresh đi qua claim). Để nguyên, chưa xoá.

Ngoài ra: backup không offsite, không metric/alert, chưa tag image để rollback, cron không khoá
phân tán (M12); `npm audit` 35/18 lỗ hổng (M13). Tất cả nằm trong các module dưới đây.

---

## 1. Cách làm việc (áp dụng cho mọi module)

### 1.1 Sáu cổng chặn, không module nào được bỏ qua

| Cổng | Lệnh / cách đo | Ngưỡng đạt |
|---|---|---|
| G1 Typecheck | `npx tsc --noEmit` (BE, FE) | 0 lỗi |
| G2 Unit + contract | `npx jest --silent` | 100% pass, mỗi lỗi fix phải có test tái hiện |
| G3 E2E thật | `npx jest --config ./test/jest-e2e.json --runInBand` với Postgres+Redis | 100% pass |
| G4 Bất biến dữ liệu | `GET /ledger-entry/integrity` sau mỗi kịch bản E2E | `difference = 0`, `unbalancedEntries = 0`, `paymentsWithoutEntry = 0` |
| G5 Bảo mật | `npm audit --omit=dev --audit-level=high` + checklist quyền | 0 critical/high có đường khai thác |
| G6 Vận hành | `/health` 200, log có `requestId`, backup mới < 24h | đạt trên staging |

### 1.2 Định nghĩa "xong" (Definition of Done) cho mỗi lỗi

Một lỗi chỉ được đóng khi có **đủ 4 thứ** trong PR:

1. Test **đỏ trước, xanh sau** (unit hoặc e2e) — dán output vào PR.
2. Ghi chú "vì sao lỗi này nguy hiểm" ngay trên code (1–3 dòng), không viết lại lịch sử.
3. Nếu chạm tiền/tồn kho: một dòng trong `docs/` hoặc ADR nói rõ bất biến được bảo vệ.
4. Không nới lỏng cổng nào (không `skip`, không `--force`, không tắt rule ESLint).

### 1.3 Nhịp làm việc

- **1 nhánh / 1 module**, tên `review/<module>`, PR nhỏ ≤ 400 dòng diff thực (không tính format).
- Mỗi module có **2 người**: 1 sửa, 1 review chéo (người review phải tự chạy lại G1–G4).
- Cuối mỗi module: cập nhật bảng §0.2 + chạy lại `scripts/audit-gates.sh` (xem M0).
- Mọi thay đổi schema: **1 migration chỉ làm 1 việc**, có `--create-only` review SQL, chạy được trên
  schema cũ (expand → migrate data → contract ở release sau).

---

## 2. Thứ tự module và thời lượng

> Các mục đã đóng ở §0.1 vẫn giữ trong từng module như **checklist hồi quy**: khi sửa module đó
> phải chạy lại đúng những test đã bảo vệ lỗi cũ.

| Thứ tự | Module | Vì sao thứ tự này | Ước lượng |
|---|---|---|---|
| M0 | Nền tảng kiểm thử & cổng chặn | Không có cổng thì mọi fix sau không chứng minh được | 1,5 ngày |
| M1 | Xác thực, phân quyền, cách ly chi nhánh | Mọi module khác dựa vào "ai được làm gì, trên dữ liệu nào" | 3 ngày |
| M2 | Tiền, VAT, sổ cái | Nguồn sự thật tài chính; sửa muộn = phải backfill | 3 ngày |
| M3 | VNPay & đối soát | Sai ở đây là mất tiền thật của khách | 2,5 ngày |
| M4 | Vòng đời đơn (sửa/huỷ/hoàn) | Chặn "sửa tiền sau khi thu" | 3 ngày |
| M5 | Bàn, QR, đặt bàn, ca tiền | Luồng bán hàng tại quán | 3 ngày |
| M6 | Kho & giá vốn | Sai tồn kho ⇒ sai COGS ⇒ sai lãi gộp | 2,5 ngày |
| M7 | Báo cáo & dashboard | Phải khớp sổ cái và không "đóng băng" | 2 ngày |
| M8 | Voucher / khuyến mại | Rò rỉ tiền + nghĩa vụ khuyến mại | 1,5 ngày |
| M9 | Nhân sự, PII, audit log | NĐ 13/2023 + kiểm soát nội bộ | 2 ngày |
| M10 | Hoá đơn điện tử & tuân thủ thuế/kế toán | Điều kiện pháp lý để bán hàng | 5–8 ngày (có bên thứ ba) |
| M11 | Frontend | Nơi tiền bị hiển thị/ bấm sai | 4 ngày |
| M12 | Hạ tầng, backup, quan sát, rollback | Không rollback được thì không được deploy | 3 ngày |
| M13 | Bảo mật & dependency | Giảm bề mặt tấn công trước khi mở Internet | 2 ngày |
| M14 | UAT + go-live + hypercare | Chứng minh bằng kịch bản thật | 4 ngày |
| | **Tổng** | 1 người full-time + 1 review chéo | **~6 tuần** |

Nếu chỉ có **2 tuần**, cắt theo thứ tự: M10 (dùng hoá đơn điện tử của đơn vị cung cấp ngoài, tích
hợp sau), M8 (tắt voucher trên prod), M12 (thuê hạ tầng managed), M13 (chỉ xử lý critical).

---

## 3. Chi tiết từng module

### M0 — Nền tảng kiểm thử & cổng chặn (1,5 ngày)

**Phạm vi**: `test/`, `.github/workflows/`, `package.json`, `scripts/`.

**Việc phải làm**

1. Thêm script `scripts/audit-gates.sh` chạy đúng G1–G5, dùng được cả local và CI.
2. Bổ sung **bộ dữ liệu E2E tất định**: mỗi suite tự tạo dữ liệu + tự dọn (đã có nguyên tắc này,
   giữ nguyên), thêm 1 chi nhánh thứ 2 để test cách ly.
3. Thêm `jest --coverage` và **ngưỡng coverage cho 6 file tiền** (không đặt ngưỡng toàn repo):
   `order-money.ts`, `ledger-posting.service.ts`, `order-ledger-lines.ts`, `cash-shift-math.ts`,
   `deposit-settlement.ts`, `voucher.service.ts` — mỗi file ≥ 90% dòng.
4. Test chống "trôi tài liệu": parse các khối ```bash trong `docs/*.md`, mọi `npm run <x>` phải tồn
   tại trong `package.json` (hiện `reconcile-inventory` trong docs **không có** trong package.json
   → thêm script thật, không xoá docs).
5. Job CI `e2e` phải chặn merge (required check), không chỉ chạy báo cáo.

**Đo lường**: CI xanh trên 3 PR liên tiếp; thời gian CI < 12 phút; coverage 6 file tiền đạt ngưỡng.

**Điều kiện thoát**: một lệnh duy nhất `npm run audit:gates` tái hiện được toàn bộ kết luận
"đủ điều kiện merge".

---

### M1 — Xác thực, phân quyền, cách ly chi nhánh (3 ngày)

**Phạm vi**: `src/routes/auth`, `users`, `role`, `permission`, `profile`, `src/shared/guard`,
`src/shared/service/branch.resolver.ts`, `src/webSockets/*`.

**Lỗi phải đóng**

| Lỗi | Cách sửa (code) |
|---|---|
| Ghi chéo chi nhánh ở `table-node`, `orders.updateOrder`, `users` CRUD | Mọi lệnh ghi nhận `actor` và luôn thêm `branchId` vào `where` với non-ADMIN: `update({ where: { id, ...(branchId ? { branchId } : {}) } })`; `updateBatch` lọc `id IN (SELECT id FROM "TableNode" WHERE "branchId" = $1)` |
| `GET /tables` thiếu `roleName` ⇒ ADMIN 403 | Truyền đủ `@ActiveUser() user` + `@ActiveRole('name')` như `table-node.controller.ts:39`; trong `resolveBranchId` **cấm** fallback "chi nhánh đầu tiên" khi người dùng không có branchId (phải 400) |
| Quyết định "là ADMIN" dựa vào `roleName` trong JWT | Lấy role từ DB (`@ActiveRole('name')`), không từ payload; test: token giả `roleName: 'ADMIN'` nhưng DB là STAFF ⇒ vẫn chỉ thấy chi nhánh mình |
| `Role.name` không UNIQUE, tạo được role trùng tên `ADMIN` | Thêm `@@unique([name])` (sau khi dọn trùng) hoặc cột `key` bất biến cho 4 role hệ thống; cấm `POST/PUT /role` đặt tên trùng role hệ thống |
| `PUT /role/:id/permissions` cho cấp quyền mình không có | `diff = newPerms − actorPerms`; nếu `diff.length > 0` và actor không phải ADMIN hệ thống ⇒ 403; revoke phiên của user thuộc role vừa đổi |
| Refresh token nhân viên: plaintext, không rotate, không thu hồi khi xoá user | Migration: `tokenHash`, `familyId`, `usedAt`, `revokedAt`; refresh = transaction: `update usedAt` (nếu đã có → revoke cả family + 401) → tạo RT mới cùng family; hash = `sha256`. Logout/xoá user: `revoke all` |
| OTP: không đếm lần sai, code cũ còn sống, code plaintext | Thêm `attempts`, `consumedAt`; `<5` lần/15 phút; phát OTP mới ⇒ vô hiệu code cũ cùng `(email,type)`; lưu `sha256(code)` |
| Login không lockout; 2FA khai báo nhưng không kiểm; mật khẩu admin mẫu | `failedAttempts` + `lockedUntil` (5 lần ⇒ khoá 15 phút, ghi audit); hoặc bỏ `totpCode` khỏi schema, hoặc verify bằng `otplib`; `Admin_password` dùng chung `secretSchema` khi `NODE_ENV=production` |
| Guest refresh chưa rotate (đã siết 1 nửa ở vòng này) | Rà lại: RT cũ phải chết sau 1 lần refresh; test gọi refresh 2 lần bằng RT cũ ⇒ 401 |

**Nghiệp vụ VN**: nhân viên nghỉ việc phải mất quyền trong ≤ 1 phút (không phải 1 ngày); mọi thay
đổi quyền phải có vết `AuditLog` để giải trình khi có tranh chấp nội bộ.

**Đo lường**

- Unit: ma trận `(role × endpoint × branch)` — script sinh từ bảng `Permission`, assert non-ADMIN
  không đọc/ghi được dữ liệu chi nhánh khác (404/403, **DB không đổi**).
- E2E: 2 chi nhánh, 4 role; chạy 30 request chéo; assert `GET /ledger` chỉ trả chi nhánh mình.
- Metric vận hành: `login_failed_total{reason}`, `permission_denied_total{role,path}`.

**Pháp lý**: NĐ 13/2023 (kiểm soát truy cập dữ liệu cá nhân), Luật Kế toán (phân quyền sổ sách).

**Điều kiện thoát**: không còn endpoint nào nhận `id` trực tiếp mà thiếu scope; test chéo chi
nhánh xanh; `AuditLog` có bản ghi cho mọi thao tác quyền/nhân sự.

---

### M2 — Tiền, VAT, sổ cái (3 ngày)

**Phạm vi**: `shared/service/order-money.ts`, `order-ledger-lines.ts`, `ledger-posting.service.ts`,
`ledger-balance.ts`, `cogs.ts`, `routes/ledger-entry`, `ledger-account`, DB constraints.

**Lỗi phải đóng**

1. **Huỷ/hoàn tiền không đảo sổ** — thêm luồng duy nhất:

```ts
// refundOrder(orderId, amount, reason, actor) — chạy trong $transaction với đổi trạng thái
const original = await tx.ledgerEntry.findFirst({
  where: { refType: { in: ['ORDER_PAID_CASH', 'ORDER_PAID_VNPAY'] }, refId: payment.id, status: 'POSTED' },
  include: { lines: { include: { account: true } } },
})
if (!original) throw new BadRequestException('Error.PaymentHasNoLedgerEntry')
await ledgerPosting.postEntry({
  branchId, refType: 'REFUND', refId: payment.id,
  idempotencyKey: `refund:payment:${payment.id}`,
  reversalOfId: original.id,
  memo: reason,
  lines: original.lines.map((l) => ({
    accountCode: l.account.code,
    direction: l.direction === 'DEBIT' ? 'CREDIT' : 'DEBIT',
    amount: l.amount,
  })),
}, tx)
await tx.payment.update({ where: { id: payment.id }, data: { status: 'REFUNDED', refundedAmount: amount } })
```

Bất biến kiểm bằng test: `Σ Nợ = Σ Có` toàn sổ không đổi sau hoàn tiền; doanh thu ngày = 0 nếu
hoàn 100%; huỷ 2 lần chỉ sinh 1 bút toán đảo (`idempotencyKey` + `reversalOfId UNIQUE`).

2. **VAT trích sai nguồn khi giá đã gồm thuế + có phí phục vụ**: tách `goodsNet` và `serviceNet`
   cùng chia `(1 + rate/100)`, `REVENUE_FOOD = goodsNet`, `SERVICE_CHARGE = serviceNet`.
   Test: `subtotal=1.000, phí 10%, VAT 8%` ⇒ `revenue=926`, `service=93`, `tax=81`, `grand=1.100`.
3. **`DISCOUNT`/`TIP_PAYABLE` không bao giờ được ghi** ⇒ cột giảm giá/tip của báo cáo luôn 0 và
   `gross` hụt đúng phần VAT. Hoặc ghi tách `Nợ DISCOUNT / Có REVENUE_FOOD (gross)`, hoặc bỏ cột
   khỏi báo cáo và tính `gross` từ `Order.subtotal` snapshot. Chọn một, viết ADR.
4. **`ROUNDING_ADJUSTMENT` nuốt lệch lớn**: chỉ cho lệch ≤ 1đ; lớn hơn ⇒ ném
   `Error.LedgerRoundingTooLarge` (fail-fast, không giấu); không sinh dòng `amount = 0`.
5. **Bất biến ở tầng DB** (bắt buộc cho pháp lý):

```sql
-- migration: ledger_append_only
CREATE OR REPLACE FUNCTION deny_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'append-only: % không được UPDATE/DELETE', TG_TABLE_NAME; END $$ LANGUAGE plpgsql;

CREATE TRIGGER "LedgerLine_no_mutation" BEFORE UPDATE OR DELETE ON "LedgerLine"
  FOR EACH ROW EXECUTE FUNCTION deny_mutation();
CREATE TRIGGER "AuditLog_no_mutation" BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION deny_mutation();
-- LedgerEntry: cho phép DUY NHẤT DRAFT -> POSTED
CREATE OR REPLACE FUNCTION ledger_entry_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'append-only: LedgerEntry không được xoá'; END IF;
  IF OLD.status = 'POSTED' THEN RAISE EXCEPTION 'append-only: bút toán đã POSTED không được sửa'; END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "LedgerEntry_guard" BEFORE UPDATE OR DELETE ON "LedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION ledger_entry_guard();

-- runtime user không phải owner, không có quyền DDL
REVOKE UPDATE, DELETE ON "LedgerLine", "AuditLog" FROM app_rw;
```

Test: `UPDATE "LedgerLine" SET amount = 0` phải ném lỗi; posting `DRAFT → POSTED` vẫn chạy.

6. **Bất biến tài khoản**: đổi `type` của tài khoản đã có bút toán ⇒ 400 (chỉ cho đổi `name`), ghi
   `AuditLog` mọi thay đổi.

**Nghiệp vụ VN**: tiền luôn `Decimal`, làm tròn về **đồng**; thuế/phí snapshot vào đơn
(`Order.taxRate`, `serviceChargeRate`) để đổi cấu hình không làm sai đơn cũ; sổ sai thì ghi **bút
toán đảo**, không UPDATE.

**Đo lường**

- Query hằng ngày (đưa vào `/metrics`): `ledger_imbalance` (phải = 0), `payments_without_entry` (= 0),
  `draft_entries_older_than_5m` (= 0).
- E2E `finance.e2e-spec.ts` mở rộng: hoàn tiền, huỷ sau thu, cọc + tất toán, sai số làm tròn biên.

**Pháp lý**: Luật Kế toán 88/2015 (Điều 41: không tẩy xoá, lưu 10 năm), TT 200/2014/TT-BTC hoặc
TT 133/2016 (hộ KD) — sổ chi tiết phải truy vết được từ chứng từ.

**Điều kiện thoát**: `GET /ledger-entry/integrity` = 0 trên staging sau 50 kịch bản; trigger
append-only có test; báo cáo doanh thu khớp `Σ` bút toán từng ngày.

---

### M3 — VNPay & đối soát (2,5 ngày)

**Phạm vi**: `vnpay.service.ts`, `payment/*`, `reconciliation/*`, `PaymentIntent`, `WebhookEvent`.

**Lỗi phải đóng**

1. (Đã sửa) `vnp_TxnRef = intent.reference` — giữ test hồi quy, đừng để ai "ghép thêm timestamp".
2. **Không được fallback khi thiếu intent**: nếu `intent === null` ⇒ từ chối webhook (400) thay vì
   so với `Σ grandTotal` của đơn đang mở. Fallback là chỗ sinh `amount_mismatch` và ghi sai số.
3. **Đối soát bỏ sót `RESERVATION_DEPOSIT`** ⇒ mọi payment cọc báo `MISSING_IN_LEDGER` mỗi ngày.
   Dùng **một hằng dùng chung** cho 3 nơi (`reconciliation.service`, `ledger-entry.repo`,
   `ledger-integrity`):

```ts
export const RECEIVING_REF_TYPES = {
  ORDER_PAID_CASH: 'CASH',
  ORDER_PAID_VNPAY: 'VNPAY_CLEARING',
  RESERVATION_DEPOSIT: 'VNPAY_CLEARING',
} as const
```

4. **`reconcile()` cộng cả `CASH_MOVEMENT`/`CASH_VARIANCE` vào "đã ghi sổ"** ⇒ luôn lệch. Lọc
   `entry.refType IN (keys RECEIVING_REF_TYPES)`; và dùng **cùng trục thời gian** (`occurredAt =
   paidAt` khi post, hoặc so theo kỳ với ghi chú rõ).
5. **Phí cổng thanh toán không vào sổ**: thêm tài khoản `VNPAY_FEE` (EXPENSE), settle theo
   `gross/fee/net`:
   `Nợ BANK (net) + Nợ VNPAY_FEE (fee) / Có VNPAY_CLEARING (gross)`.
6. **Kỳ đối soát lưu UTC, dữ liệu cắt +07:00** ⇒ lưu `periodFrom/To` bằng cùng hàm `resolveRange`
   (hoặc đổi cột sang `date`).

**Đo lường**

- Test replay: cùng 1 IPN gửi 5 lần ⇒ 1 bút toán, 1 `Payment` SUCCESS.
- Test số tiền: sửa `vnp_Amount` lệch 1đ ⇒ 400, không ghi sổ.
- Staging: chạy 20 giao dịch sandbox (thành công/thất bại/huỷ), đối soát `byKind.MISSING_IN_LEDGER = 0`,
  `AMOUNT_MISMATCH = 0`.
- Dashboard vận hành: `reconciliation_items{kinds}` theo ngày; alert nếu `MISSING_IN_LEDGER > 0` 2
  ngày liên tiếp.

**Pháp lý**: NĐ 52/2024/NĐ-CP (thanh toán không dùng tiền mặt) — đối soát, lưu log giao dịch;
hợp đồng với VNPay phải khớp phương thức settle (gross/net).

**Điều kiện thoát**: không còn false-positive đối soát; mọi payment SUCCESS có đúng 1 bút toán thu.

---

### M4 — Vòng đời đơn hàng: sửa, huỷ, hoàn (3 ngày)

**Phạm vi**: `shared-orders.repo.ts` (`updateOrder`, `CreateOrdersByGuest`, `CreateOrdersForUser`),
`orders.controller/service/repo`, `shared-order.model.ts`.

**Lỗi phải đóng**

1. **Sửa số lượng món không tính lại tiền** — tính lại **vô điều kiện** sau khi update snapshot và
   dùng số lượng **mới**:

```ts
const items = await tx.productSKUSnapshot.findMany({ where: { orderId }, select: { skuId: true, price: true, quantity: true } })
// sau khi áp quantity mới:
const money = computeOrderMoney({ lines: items.map((i) => ({ price: i.price, quantity: i.quantity })), ... })
await tx.order.update({ where: { id: orderId }, data: { ...moneySnapshot, ... } })
if (payment.status === 'PENDING') await tx.payment.update({ where: { id: payment.id }, data: { amount: money.grandTotal } })
```

Test: đổi `quantity 2 → 5` ⇒ `grandTotal = 5 × giá + phí + thuế`; đổi cả `quantity` và `discount`
⇒ tổng tính từ số lượng mới (không phải số đọc trước đó).

2. **Ma trận trạng thái tường minh**:

```ts
const ALLOWED: Record<OrderStatus, OrderStatus[]> = {
  PENDING:   ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY:     ['COMPLETED', 'CANCELLED'],
  COMPLETED: ['PAID'],
  PAID:      [],           // huỷ đơn đã trả phải đi qua refund
  CANCELLED: [],           // không "sống lại"
}
if (!ALLOWED[current.status].includes(next)) throw new BadRequestException('Error.InvalidStatusTransition')
```

Test parameterized toàn bộ cặp `(from,to)`: chỉ cặp trong bảng trả 200.

3. **Đơn đã thu tiền: cấm sửa tiền/số lượng** — `payment.status !== 'PENDING'` và `moneyUpdate`
   khác rỗng ⇒ 400 `Error.OrderAlreadyPaidCannotChangeMoney`; muốn đổi thì đi qua `refundOrder`
   (M2) rồi tạo đơn mới.
4. **Huỷ đơn phải: hoàn kho + đảo COGS + (nếu đã thu) hoàn tiền** — một transaction:
   `refundOrder` + `revertStockForOrder(deducted)` + `postReversal(ORDER_COGS)`.
   Cần bảng `OrderStockDeduction{orderId, ingredientId, quantity}` để biết **đã trừ bao nhiêu**
   (hiện chỉ có trên Redis/job payload, mất khi job xong).
5. **Hiệu ứng phụ ra khỏi transaction**: `inventoryQueue.add` và `socket.emit` phải chạy **sau khi
   commit** (outbox hoặc `.then()`), tránh "nhân viên thấy đơn mà khách nhận lỗi" và job chạy
   trước khi đơn tồn tại.

**Nghiệp vụ VN**: thu ngân cần **chuyển bàn / gộp đơn / tách bill** (hiện chưa có). Nếu chưa làm
trong đợt này, phải ghi rõ trong tài liệu đào tạo: "chuyển bàn = huỷ + tạo lại" và chặn khi đơn đã
in bếp.

**Đo lường**: E2E kịch bản "đặt 3 món → thêm 2 → bớt 1 → in bill → thu tiền → huỷ 1 món" kiểm
`grandTotal`, `Payment.amount`, bút toán, tồn kho ở từng bước.

**Điều kiện thoát**: không còn đường nào đổi tiền đơn đã PAID mà không có bút toán đảo.

---

### M5 — Bàn, QR, đặt bàn, ca tiền (3 ngày)

**Phạm vi**: `table-node/*`, `table/*`, `area/*`, `reservation/*`, `cash-shift/*`, `guest/*`.

**Lỗi phải đóng**

1. **Đóng bàn không kiểm đơn chưa thu**: chặn nếu còn đơn `PENDING/CONFIRMED/PREPARING/READY`;
   `updateMany({ where: { id, openedAt: { not: null } } })` để không xoá phiên mới; **không** đổi
   `OUT_OF_SERVICE/HIDE` thành `AVAILABLE`.
2. **Đặt bàn trùng giờ / race**: toàn bộ trong 1 transaction, khoá bằng
   `updateMany({ where: { id, status: 'AVAILABLE' } })` + `count === 1`, hoặc `SELECT … FOR UPDATE`;
   kiểm chồng lấn theo `reservationTime ± duration`; cron nhả `RESERVED` khi quá hẹn/cancel.
3. **Cọc reservation (BLOCKER)**: BE tự tính tiền cọc, **bỏ** `depositAmount` từ client; thêm
   luồng "thu nốt":

```ts
// POST /orders/:id/settle-reservation  (STAFF, có kiểm chi nhánh)
const remaining = order.grandTotal.minus(reservation.depositAmount)
postEntry({ refType: 'ORDER_PAID_CASH', refId: newPayment.id, lines: [
  { accountCode: 'CASH', direction: 'DEBIT', amount: remaining },
  { accountCode: 'DEPOSIT_LIABILITY', direction: 'DEBIT', amount: reservation.depositAmount },
  { accountCode: 'REVENUE_FOOD', direction: 'CREDIT', amount: goodsNet },
  { accountCode: 'SERVICE_CHARGE', direction: 'CREDIT', amount: serviceNet },
  { accountCode: 'VAT_PAYABLE', direction: 'CREDIT', amount: tax },
]})
```

Test: cọc 300k cho hoá đơn 1.000k → thu nốt 700k ⇒ `Σ Nợ CASH = 1.000k`,
`DEPOSIT_LIABILITY = 0`, `REVENUE_FOOD` ghi **một lần**.

4. **Ca tiền**: mở ca phải ghi bút toán `Nợ CASH / Có CASH_FLOAT_SOURCE` cho `openingFloat` (hiện
   không ghi ⇒ sổ quỹ lệch đúng bằng tiền lẻ đầu ca); đóng ca giữ nguyên logic variance nhưng test
   `cashBook('CASH').closing === countedCash` khi variance = 0.
5. **Khách quét QR**: yêu cầu bàn `OCCUPIED && openedAt != null` (hiện chỉ chặn HIDE/OUT_OF_SERVICE/
   RESERVED) — nếu không, khách quét mã bàn trống vẫn đặt món vào bàn không có phiên.

**Đo lường**: E2E 2 thu ngân thao tác song song cùng bàn (`Promise.all`): đúng 1 thắng, 1 nhận 409;
kịch bản ca: mở 1.000k → thu 500k → đếm 1.500k ⇒ variance 0, `CASH` khớp.

**Pháp lý**: tiền mặt trong két là đối tượng kiểm soát nội bộ; sổ quỹ phải khớp tiền thật để giải
trình khi kiểm tra thuế.

**Điều kiện thoát**: không còn bàn "kẹt RESERVED"; đóng ca luôn khớp sổ quỹ; đặt bàn không trùng.

---

### M6 — Kho & giá vốn (2,5 ngày)

**Phạm vi**: `ingredients/*`, `recipe/*`, `unitConversion/*`, `processors/inventory.processor.ts`,
`scripts/lua/*`, `cacheLoader.service.ts`, `cogs.ts`.

**Lỗi phải đóng**

1. **Cache công thức/quy đổi không invalidate** ⇒ sửa công thức vẫn trừ theo bản cũ; món mới thêm
   công thức bị "Recipe not found" (không bán được). Thêm
   `CacheLoaderService.refreshRecipe(skuId)` gọi sau create/update/delete recipe; tương tự
   `unit:conv:<from>:<to>` (script Lua đọc key này).
2. **`reconcile-inventory` không có trong `package.json`** ⇒ thêm script prod
   (`node dist/scripts/.../reconcile-inventory.js`) và chạy định kỳ **chỉ báo lệch**, không tự
   `--fix` trong giờ bán.
3. **Job fail bị xoá** (`removeOnFail: true`): đổi `removeOnFail: false` + DLQ, đếm
   `inventory_jobs_failed_total`; `deducted` rỗng phải **fail to**, không im lặng.
4. **Redis là nguồn sự thật tồn kho lúc chạy**: ghi rõ trong ADR; dài hạn chuyển phép trừ vào
   transaction Postgres (`SELECT … FOR UPDATE`) để Redis chỉ còn là cache đọc.
5. **Test bất biến**: `Σ tồn kho Redis` sau N đơn + hoàn tác = ban đầu; nhập hàng đồng thời không
   mất phiếu (đã sửa bằng `increment`, giữ test).

**Đo lường**: E2E `inventory.e2e-spec.ts` thêm case "bán → nhập hàng → restart app → tồn kho không
đổi"; nightly job so `Ingredient.stock` (DB) với Redis, alert nếu lệch > ngưỡng.

**Nghiệp vụ VN**: đơn vị quy đổi (kg/g, lít/ml) phải đúng; định lượng món là dữ liệu giá vốn —
sửa công thức phải có audit để giải trình giá thành.

**Điều kiện thoát**: sửa công thức có hiệu lực ngay; không mất tồn kho khi restart/retry.

---

### M7 — Báo cáo & dashboard (2 ngày)

**Phạm vi**: `routes/reports/*`, `routes/dashboard/*`, `DailyBranchSummary`.

**Việc phải làm**

1. (Đã sửa) kỳ đang mở phải recompute theo TTL 60s — thêm hiển thị "cập nhật lúc …" trên UI.
2. **`revenueByItem` đang đọc `Order.status = PAID` + `createdAt`** thay vì sổ cái ⇒ lệch với báo
   cáo doanh thu (và bỏ sót đơn hoàn tiền). Chuyển sang đọc từ `LedgerLine` + snapshot.
3. Cột `discount`/`tip`/`refund` phải có nguồn: sau M2 chúng có dòng bút toán thật; thêm test dùng
   **dữ liệu sinh từ chính `buildOrderLedgerLines`** (không hand-made) để không "test giả".
4. **Chốt kỳ (khoá sổ)**: thêm khái niệm `AccountingPeriod{branchId, month, closedAt}`; báo cáo kỳ
   đã chốt chỉ đọc projection, không recompute, và chặn bút toán vào kỳ đã chốt (trừ bút toán đảo có
   duyệt).
5. Export CSV/PDF cho kế toán: `GET /reports/export?type=ledger|cash-book|revenue&from&to` kèm
   `sha256` file để đối chiếu.

**Đo lường**: test "báo cáo = sổ cái" cho 30 ngày dữ liệu sinh tự động (property test: tổng theo
ngày từ `LedgerLine` == projection); thời gian phản hồi p95 < 800ms với 100k bút toán.

**Pháp lý**: báo cáo dùng để kê khai/lưu trữ 10 năm ⇒ phải tái lập được từ sổ; export phải có
checksum.

**Điều kiện thoát**: 0 chênh lệch giữa báo cáo và sổ cái trên dữ liệu staging 3 tháng.

---

### M8 — Voucher / khuyến mại (1,5 ngày)

**Phạm vi**: `routes/voucher/*`, `shared/service/voucher.service.ts`.

**Việc phải làm**

1. **Race vượt `usageLimit`**: thêm `Voucher.usedCount` + claim nguyên tử:

```ts
const claimed = await tx.$executeRaw`
  UPDATE "Voucher" SET "usedCount" = "usedCount" + 1
  WHERE id = ${voucher.id} AND ("usageLimit" IS NULL OR "usedCount" < "usageLimit")`
if (claimed !== 1) throw new BadRequestException('Error.VoucherExhausted')
```

Test: `usageLimit = 1`, 10 request song song ⇒ 1 thành công, `usedCount = 1`.
2. **Trần giảm giá & theo khách**: `maxDiscountAmount`, `maxUsesPerCustomer`,
   `perCustomerWindowDays`; `PERCENT` không có trần là lỗ hổng tiền thật.
3. **Nhả lượt khi huỷ đơn**: hoàn `usedCount` trong cùng transaction huỷ.
4. **Phạm vi chi nhánh**: `Voucher.branchId?` — hiện 1 mã dùng cho mọi chi nhánh.
5. **Pháp lý khuyến mại**: thêm `promotionType` (`DISCOUNT` | `PROMOTION`),
   `promotionRegistrationNo?`; nếu là khuyến mại phải đăng ký (NĐ 81/2018/NĐ-CP) thì bắt buộc nhập
   số đăng ký trước khi bật. **Cần luật sư xác nhận** voucher giảm giá của quán thuộc loại nào.

**Đo lường**: test tải song song; test cap; báo cáo "giá trị khuyến mại đã dùng" theo kỳ.

**Điều kiện thoát**: không thể vượt hạn mức bằng request đồng thời; mọi voucher có trần thiệt hại.

---

### M9 — Nhân sự, PII, audit log (2 ngày)

**Phạm vi**: `routes/users/*`, `guest/*`, `reservation/*`, `shared/service/audit-log.service.ts`,
`media/*`.

**Việc phải làm**

1. **`deleteUser(isHard)` bị đảo nghĩa**: `isHard: true` đang soft-delete. Đổi thành
   `mode: 'SOFT' | 'HARD'`, hard = `prisma.user.delete` (sau khi chuyển tham chiếu), soft =
   `deletedAt` + revoke token.
2. **Audit log truy cập** — **đã làm phần ĐỌC PII người** (`AccessLog` + `AccessLogInterceptor` +
   `@LogAccess`), xem ghi chú dưới. Đã phủ: khách (5 route), nhân viên (hồ sơ + danh sách), đặt bàn
   (2 route), đơn hàng (chi tiết + danh sách), khách của bàn. **Chưa làm**: `reports` (chỉ số tổng
   hợp, không có PII từng người — không đáng ghi), `ledger` (bút toán, không có PII), và
   `LOGIN_SUCCESS`/`LOGIN_FAILED` — cần bạn chốt một câu, xem cuối mục.
3. **PII** — **đã làm (xem ghi chú dưới)**: `ConsentLog` append-only + ẩn danh hoá hồ sơ. Bản phác
   trong kế hoạch (`subjectType/subjectId`, `grantedAt/revokedAt`, job `anonymizeExpiredReservations`)
   đã đổi khi làm, lý do ở dưới.
4. **Media chứng từ**: ảnh biên nhận/hóa đơn tiền mặt đang lên Cloudinary nước ngoài. Chuyển sang
   object storage trong nước (hoặc tách bucket + đánh giá chuyển dữ liệu ra nước ngoài).
5. **2FA cho ADMIN/KE_TOAN**: bắt buộc khi đã bật; `otplib` verify; endpoint setup/enable/disable.

**Đồng ý & ẩn danh hoá — đã làm (mục 3).** Ba chỗ khác bản phác, đều vì lý do cụ thể:

- *Đồng ý theo từng mục đích, append-only* (`ConsentLog{customerId, purpose, version, granted, ip,
  note, createdById}`, trigger DB chặn `UPDATE`): "đang đồng ý" = **dòng mới nhất**, không có cột
  `revokedAt` để sửa. Sửa được một dòng đồng ý nghĩa là viết lại được lịch sử, mà thứ duy nhất có giá
  trị pháp lý ở đây là lịch sử. `subjectType/subjectId` bị bỏ: hôm nay chỉ `Customer` giữ PII (khách
  quét QR không để lại SĐT), thêm kiểu chủ thể đa hình lúc này là đoán trước.
- *`DELETE` vẫn cho phép* trên `ConsentLog` (chỉ chặn `UPDATE`): nó chỉ xảy ra qua CASCADE khi xoá hồ
  sơ khách — đúng quyền xoá dữ liệu. Cái phải chặn là viết lại lịch sử, không phải xoá theo yêu cầu.
- *Ẩn danh hoá hồ sơ khách chứ không chỉ `Reservation`*: job `anonymizeExpiredReservations` trong bản
  phác để lại chính hồ sơ khách (SĐT, tên, email, ghi chú) — tức là PII nhiều nhất lại không bị đụng.
  Nay `npm run pii:anonymize -- --months=N [--apply]` quét theo *lần hoạt động cuối*, giữ chứng từ kế
  toán, và có thêm `--customer=ID` cho yêu cầu xoá của từng khách. `--months` không có mặc định.

**Nhật ký truy cập — đã làm phần ĐỌC (mục 2).** `AccessLog` ghi *lượt đọc* PII của một NGƯỜI, bảng
riêng chứ không nhét vào `AuditLog`: `AuditLog` là nhật ký thao tác GHI, còn ở đây đọc 100 lần cũng
không đổi một byte dữ liệu mà vẫn phải giải trình được. Năm chỗ khác bản phác:

- `route` khai tay (`@LogAccess({ route: 'GET /customers/:id' })`) thay cho `method + path +
  statusCode`: mẫu route của express đổi theo phiên bản, còn dòng nhật ký phải đọc lại được sau vài
  năm; và interceptor chạy sau guard nên chỉ có request đã ĐỌC ĐƯỢC mới vào bảng — `statusCode` chỉ
  có một giá trị.
- **Không lưu query string.** Tra khách là gõ SĐT/tên, tức query chính là PII; chép vào nhật ký là
  nhân bản PII sang một bảng append-only nữa. Đổi lại chỉ biết "đã tra, ra N kết quả".
- Chủ thể là cặp `(subjectType, subjectId)` **không có khoá ngoại**: xoá hồ sơ không được làm biến
  mất bằng chứng đã có người đọc hồ sơ đó, và DB có CHECK cấm nửa cặp (có type mà thiếu id). Lượt
  trước tôi bỏ ý tưởng đa hình này vì "hôm nay chỉ Customer giữ PII" — một ngày sau, khi phải ghi
  lượt đọc hồ sơ nhân viên, cách còn lại là thêm một cột nữa cho mỗi module và mọi câu truy vấn phải
  biết đang hỏi bảng nào. Ba cột song song (`customerId`, `userId`, ...) tệ hơn một cặp có ràng buộc.
- Chờ ghi xong mới trả response (không "bắn rồi quên"): đây là bằng chứng, mất một dòng vì tiến trình
  chết đúng lúc đó là mất thật. Lỗi ghi thì vẫn không làm hỏng việc đọc (`recordSafe`).
- Bỏ `userAgent`: không dùng để quyết định gì, và thêm một trường tự do nữa là thêm chỗ giấu PII.

Đọc cả trang danh sách chỉ ghi `route + resultCount`, không gắn cho từng người: muốn trả lời chính
xác "tôi có bị xem không" cho từng khách trong một trang 20 dòng thì phải ghi 20 dòng mỗi lần bấm —
đó là thiết kế khác (nặng hơn nhiều) và chưa ai yêu cầu. Route một người thì ghi đúng người đó.

**Cần bạn chốt một câu cho `LOGIN_FAILED`:** đăng nhập sai thì *chưa biết* là ai, nên muốn nhật ký có
ích (đếm theo tài khoản) thì phải lưu **email khách/nhân viên vừa gõ** — tức PII của người chưa đăng
nhập được, vào một bảng append-only. Ba lựa chọn: (a) chỉ lưu IP (đếm được theo nguồn, không theo tài
khoản); (b) lưu hash email (ghép được các lần thử cùng một tài khoản, không đọc ngược ra email); (c) lưu
email thô như log hệ điều hành vẫn làm. Tôi nghiêng (b) nhưng đây là quyết định về dữ liệu cá nhân nên
không tự chốt. Hiện `LOGIN_LOCKED` (khoá tài khoản sau N lần sai) đã có trong `AuditLog`.

Chi tiết và các ⚠ cần kế toán/luật sư: `docs/pii-retention-policy.md`.

**Đo lường**: test ẩn danh (`test/customer-anonymize.e2e-spec.ts`) ⇒ hồ sơ hết hạn mất SĐT/tên/email/
ghi chú + lượt đặt bàn cũng mất, khách **còn đơn chưa thu tiền thì không bị đụng**, chạy lại không làm
gì, và `AuditLog` của lần ẩn danh **không chứa** PII cũ. Nhật ký truy cập
(`test/customer-access-log.e2e-spec.ts`) ⇒ đọc một hồ sơ sinh **đúng một** dòng với đúng
`(subjectType, subjectId)`, `actorId`, `resultCount`, IP; đọc cả trang danh sách **không** gắn cho
người nào; 404 không sinh dòng; sửa ghi chú **không** bị tính là một lần truy cập; audit sửa ghi chú
**không chứa** nội dung/SĐT trong ghi chú; `UPDATE` trên `AccessLog` bị trigger DB chặn và nửa cặp chủ
thể bị CHECK chặn; đọc hồ sơ **nhân viên** ghi `USER` chứ không lẫn sang `CUSTOMER`; danh sách nhân
viên / đặt bàn / khách của bàn đều để lại dòng; **đọc bằng `POST /orders/lists` vẫn được ghi** (đọc
không đồng nghĩa với GET).

**Chưa có phép đo** (vì code chưa có, đừng đọc như đã xong): login sai 3 lần ⇒ 3 dòng `LOGIN_FAILED`
có IP — chờ bạn chốt lưu định danh nào (xem cuối mục trên).

**Pháp lý**: NĐ 13/2023/NĐ-CP (đồng ý, quyền xoá, hồ sơ đánh giá tác động, log truy cập), NĐ
53/2022/NĐ-CP (lưu log, dữ liệu tại VN — **cần luật sư xác định phạm vi**), Luật Kế toán (giữ chứng
từ 10 năm, xung đột với quyền xoá ⇒ phải có chính sách bằng văn bản).

**Điều kiện thoát**: có chính sách lưu trữ bằng văn bản (kế toán + luật sư ký), code thực thi đúng
chính sách đó.

---

### M10 — Hoá đơn điện tử & tuân thủ thuế/kế toán (5–8 ngày, có bên thứ ba)

Đây là module **duy nhất chưa có trong code** và là điều kiện pháp lý để bán hàng có hoá đơn.

**Phạm vi**: schema mới, `routes/invoice/*`, tích hợp nhà cung cấp HĐĐT (MISA/Viettel/VNPT/VNPT eInvoice).

**Việc phải làm**

1. **Dữ liệu pháp nhân trên `Branch`**: `taxCode` (MST), `legalName`, `address`, `invoiceTemplateCode`,
   `invoiceSerial`, `invoiceProvider`, `providerCredentialRef`.
2. **Model hoá đơn**:

```prisma
model Invoice {
  id           Int      @id @default(autoincrement())
  branchId     Int
  orderId      Int?     @unique
  serial       String   @db.VarChar(20)      // ký hiệu
  number       String   @db.VarChar(20)      // số hoá đơn
  issuedAt     DateTime
  buyerName    String?  @db.VarChar(255)
  buyerTaxCode String?  @db.VarChar(20)
  totalBeforeTax Decimal @db.Decimal(14,2)
  taxAmount    Decimal  @db.Decimal(14,2)
  total        Decimal  @db.Decimal(14,2)
  status       InvoiceStatus @default(PENDING)  // PENDING|SIGNED|CANCELLED|REPLACED
  providerRef  String?  @db.VarChar(100)
  signedXmlHash String? @db.Char(64)
  replacedById Int?     @unique
  @@unique([branchId, serial, number])
}

model InvoiceLine {
  id        Int    @id @default(autoincrement())
  invoiceId Int
  name      String @db.VarChar(255)
  unit      String? @db.VarChar(20)
  quantity  Decimal @db.Decimal(12,3)
  unitPrice Decimal @db.Decimal(14,2)
  vatRate   Decimal @db.Decimal(5,2)   // 0/5/8/10
  amount    Decimal @db.Decimal(14,2)
}
```

3. **VAT theo dòng hàng**: `SKU.taxRate` (hoặc `Category.taxRate`) + snapshot
   `ProductSKUSnapshot.taxRate`; `computeOrderMoney` trả `taxBreakdown: [{rate, base, tax}]`.
   Một hoá đơn có bia 10% + đồ ăn 8% là bình thường ở VN — hiện chỉ có 1 mức/chi nhánh.
4. **Phát hành trong cùng transaction thu tiền** (hoặc outbox): bán xong phải có số hoá đơn, không
   để "mồ côi". Huỷ/điều chỉnh = bản ghi mới `REPLACED`, không UPDATE bản cũ.
5. **Lưu trữ 10 năm + export định kỳ**: snapshot XML/PDF + hash, đẩy storage chỉ-ghi; kèm job kiểm
   tra tính toàn vẹn hằng tháng.

**Đo lường**: test tạo hoá đơn từ đơn đã thu ⇒ `invoiceNo` unique, `Σ InvoiceLine.amount + tax =
Invoice.total`; test huỷ ⇒ bản ghi `CANCELLED` + bản thay thế, không sửa bản cũ; test VAT 2 mức.

**Pháp lý**: NĐ 123/2020/NĐ-CP + TT 78/2021/TT-BTC (hoá đơn điện tử khởi tạo từ máy tính tiền, thời
điểm lập, mã CQT, ký số, huỷ/điều chỉnh); Thông tư 200/2014/TT-BTC hoặc 133/2016/TT-BTC (chế độ kế
toán); Luật Kế toán 88/2015 (lưu 10 năm). **Bắt buộc** làm việc với kế toán trưởng để chốt: mẫu số,
ký hiệu, thời điểm lập, xử lý hoá đơn sai, và mức thuế từng nhóm hàng.

**Điều kiện thoát**: xuất được hoá đơn cho 1 đơn thật trên môi trường sandbox của nhà cung cấp;
kế toán trưởng ký xác nhận mẫu hoá đơn và quy trình huỷ/điều chỉnh.

---

### M11 — Frontend (4 ngày)

**Phạm vi**: `restaurant-management-system-FE/src`.

**Lỗi phải đóng**

1. **Token trong `localStorage`**: route `/api/auth/*` chỉ set cookie `httpOnly` và trả
   `{ user }` (không trả token); mọi fetch dùng `credentials: 'include'`; xoá
   `console.log('resuft', …)`. Test: sau login, `localStorage` không chứa `accessToken`.
2. **OAuth token trong URL**: đổi sang one-time code rồi `POST /api/auth/oauth-exchange`.
3. **"Thanh toán tất cả" bằng `GET`, 1 click, không chọn phương thức**: BE đổi `POST
   /orders/pay-guest/:guestId` body `{ method, clientRequestId }`; FE mở `AlertDialog` có breakdown
   tiền + chọn CASH/VNPAY + bắt buộc ca đang mở; `onSuccess` invalidate đủ 6 query key
   (`cash-shifts`, `cash-book`, `ledger-entries`, `ledger-integrity`, `revenue-report`,
   `dashboardIndicator`).
4. **Double submit** đặt món/tạo đơn: `disabled={isPending}` + `if (isPending) return` +
   `clientRequestId` (BE chống trùng).
5. **Tổng tiền của khách sai** (bỏ VAT/phí/giảm giá): BE trả `subtotal/discountTotal/
   serviceChargeAmount/taxTotal/grandTotal` trong `guestOrderSchema`; FE hiển thị đúng số BE sẽ thu,
   disable nút thanh toán nếu thiếu.
6. **`/payment-success` 404**: thêm route redirect; chuẩn hoá `FRONTEND_URL` không kèm `/guest`.
7. **Trang kết quả thanh toán tin query param**: phải gọi `GET /guest/orders` xác nhận
   `payment.status === SUCCESS` rồi mới hiện "thành công".
8. **401/403/429**: tách nhánh 429 (retry + toast), chỉ logout khi refresh thất bại thật; refresh
   theo `exp` (setTimeout) thay vì poll 1s.
9. **Badge "Đã thanh toán" chỉ cộng `items[0]`**: dùng `grandTotal`.

**Đo lường**: Playwright cho 5 luồng tiền (login, đặt món, thu tiền, đóng ca, thanh toán VNPay
sandbox); test double-click; axe/a11y cho form nhập tiền; bundle budget (`next build` không tăng quá
10%).

**Điều kiện thoát**: không token trong `localStorage`/URL; không mutation tiền nào thiếu xác nhận +
idempotency; Playwright xanh trên staging.

---

### M12 — Hạ tầng, backup, quan sát, rollback (3 ngày)

**Phạm vi**: `Dockerfile`, `docker-compose.yml`, `deploy/`, `docs/deploy.md`, `docs/backup.md`,
`src/routes/health`, `.github/workflows`.

**Việc phải làm**

1. **Rollback được**: tag image theo `${GIT_SHA}`, giữ 3 bản; compose dùng `IMAGE_TAG` bắt buộc;
   `scripts/deploy.sh` fail nếu thiếu. Diễn tập: deploy sha B → `IMAGE_TAG=A docker compose up -d be`
   trong < 60s, `GET /ledger-entry/integrity` = 0.
2. **Backup offsite + alert**: đẩy dump lên object storage, mã hoá; alert khi fail hoặc bản mới nhất
   > 26h; test restore tự động hằng tuần vào DB tạm + so `count(*)` các bảng chính.
3. **Restore an toàn**: `docker compose stop be` → `psql --single-transaction --no-owner` → bản dump
   an toàn lưu vào `BACKUP_DIR` (không `/tmp`).
4. **Không boot app khi deploy**: `create-permissions` đã bỏ khỏi `deploy:prepare:prod` (vòng này);
   vẫn phải tách script khỏi `AppModule` (dùng `createApplicationContext` hoặc export route list ra
   JSON lúc build) để không tạo instance thứ hai chạy cron/BullMQ.
5. **Múi giờ DB**: container Postgres đặt `TZ=UTC`/`PGTZ=UTC` (app giữ `Asia/Ho_Chi_Minh`) hoặc
   chuyển cột sang `TIMESTAMPTZ`; mọi `createdAt` do app set, không dựa `DEFAULT CURRENT_TIMESTAMP`.
6. **Metric/alert tối thiểu**: `prom-client` + `/metrics` (chặn ở Caddy):
   `http_request_duration_seconds`, `http_5xx_total`, `bullmq_jobs_failed_total`,
   `ledger_imbalance`, `payments_without_entry`, `reconciliation_issues`; log JSON có `requestId`
   (`x-request-id` trả về client); tách `/health/live` và `/health/ready`, không trả `errors` ra
   public ở production.
7. **Cron/BullMQ chống trùng**: `SET lock:<name> NX PX` hoặc `pg_advisory_xact_lock`; hoặc tách
   worker 1 replica, `be` N replica với `DISABLE_CRON=true`.
8. **Giới hạn tài nguyên**: `logging.max-size`, `deploy.resources`, `stop_grace_period: 30s`,
   `init: true`, bỏ `container_name`; Redis `--requirepass` + `maxmemory`; Postgres runtime user
   `app_rw` (không phải owner), `migrator` riêng cho DDL.

**Đo lường**: `docker compose config` có logging/limits/healthcheck; test sập Postgres ⇒
`/health/ready` 503, `/health/live` 200; diễn tập rollback + restore có biên bản.

**Pháp lý**: lưu log & dữ liệu theo NĐ 53/2022 (nếu thuộc phạm vi); backup là bằng chứng "không mất
dữ liệu kế toán" khi bị kiểm tra.

**Điều kiện thoát**: rollback và restore đã diễn tập thật trên staging, có biên bản + thời gian.

---

### M13 — Bảo mật & dependency (2 ngày)

**Phạm vi**: toàn repo, `package.json`, cấu hình CORS/CSP.

**Việc phải làm**

1. **`npm audit`**: xử lý hết critical/high có đường khai thác (BE 35, FE 18 hiện tại). Ưu tiên
   `axios`, `express`, `path-to-regexp`, `multer`, `ws`, `zod`, `jws`; ghi lại cái không nâng được và
   lý do (kèm biện pháp bù).
2. **CSP + security headers** ở FE (hiện chưa có CSP) — cần trước khi bỏ `localStorage` để giảm hệ
   quả XSS.
3. **Rate limit theo tài khoản** cho OTP/gửi lại mã — đã xong (§0.1 mục 31: 5 lượt gửi/15 phút cho
   một email, 5 lượt nhập sai cho một mã); đăng nhập đã có khoá tạm theo tài khoản (§0.1 mục 30).
   Còn lại: chuyển throttler toàn cục từ khoá IP sang khoá user/chi nhánh.
4. **Rà `dangerouslySetInnerHTML`, log lộ token/PII**, `console.log` chứa payload thanh toán.
5. **Quét bí mật**: `git log -p -- .env`; rotate toàn bộ key từng nằm trên máy dev
   (`ACCESS_TOKEN_SECRET`, `VNPAY_SECRET_KEY`, `RESEND_API_KEY`, Cloudinary).
6. **Checklist OWASP ASVS L1** cho 8 luồng chính (auth, thanh toán, upload, báo cáo, export).

**Đo lường**: `npm audit --audit-level=high` = 0; CSP header present; 0 secret trong lịch sử git
(hoặc đã rotate).

**Điều kiện thoát**: không còn lỗ hổng critical/high chưa có biện pháp bù được ghi nhận.

---

### M14 — UAT, go-live, hypercare (4 ngày)

**Việc phải làm**

1. **UAT theo vai**: chủ quán, quản lý chi nhánh, thu ngân, bếp, kế toán — mỗi vai 5 kịch bản, ghi
   biên bản có chữ ký.
2. **Kịch bản tiền cuối**: 1 ngày bán giả lập 200 đơn (tiền mặt + VNPay + cọc + huỷ + hoàn + voucher)
   ⇒ đối chiếu: doanh thu báo cáo = sổ cái = tiền két + sao kê VNPay.
3. **Diễn tập sự cố**: mất Redis, mất Postgres, job fail, deploy lỗi migration, khôi phục backup.
4. **Cutover**: chạy song song 3–5 ngày với hệ thống cũ (nếu có) hoặc sổ tay; chốt số đầu kỳ.
5. **Hypercare 2 tuần**: mỗi ngày kiểm 6 chỉ số (dưới), họp 15 phút, ngưỡng dừng khẩn cấp.

**Bảng chỉ số hypercare (đo hằng ngày)**

| Chỉ số | Ngưỡng | Hành động nếu vượt |
|---|---|---|
| `ledger_imbalance` | 0 | dừng bán, kiểm bút toán |
| `payments_without_entry` | 0 | đối soát ngay trong ngày |
| `reconciliation_issues{MISSING_IN_LEDGER}` | 0 | kiểm webhook/intent |
| tỷ lệ 5xx | < 0,5% | rollback nếu > 2% trong 10 phút |
| p95 `/orders`, `/reports` | < 500ms / 800ms | kiểm index/queue |
| chênh lệch két cuối ca | 0 (có giải trình nếu khác) | huấn luyện lại thu ngân |

**Điều kiện thoát**: 14 ngày hypercare không có sự cố tiền mức 1; biên bản bàn giao + tài liệu vận
hành (runbook) đã cập nhật theo thực tế.

---

## 4. Việc cần chốt với người ngoài kỹ thuật (chặn M10 và một phần M9)

| Câu hỏi | Ai trả lời | Ảnh hưởng |
|---|---|---|
| Doanh nghiệp hay hộ kinh doanh? Chế độ kế toán nào (TT 200 hay TT 133)? | Kế toán trưởng | Mẫu sổ, tài khoản, báo cáo |
| Mức thuế GTGT từng nhóm hàng (đồ ăn 8%, bia/rượu 10%) và thời điểm áp dụng | Kế toán trưởng | `SKU.taxRate`, hoá đơn |
| Nhà cung cấp hoá đơn điện tử + mẫu số/ký hiệu | Kế toán + chủ dự án | M10 |
| Thời hạn lưu PII khách (SĐT đặt bàn) và phần nào phải giữ trên hoá đơn | Kế toán + luật sư | M9 |
| Hệ thống có thuộc phạm vi NĐ 53/2022 (lưu dữ liệu tại VN) không | Luật sư | M9, M12 |
| Voucher của quán là "giảm giá" hay "khuyến mại phải đăng ký" (NĐ 81/2018) | Luật sư | M8 |
| Có bán cho khách nước ngoài / xuất hoá đơn ngoại tệ không | Kế toán | `currency` trong sổ |

---

## 5. Rủi ro còn lại nếu không làm đủ (chấp nhận có ý thức)

1. **Chuyển bàn/gộp đơn/tách bill chưa có** — thu ngân phải huỷ + tạo lại; nếu làm sau go-live phải
   đào tạo lại.
2. **Redis là nguồn sự thật tồn kho** — mất Redis giữa giờ bán ⇒ cần dừng bán, khôi phục, đối chiếu
   tay (đã có runbook).
3. **Sổ cái append-only bằng trigger DB** chỉ bảo vệ khi app dùng user không có quyền DDL; nếu vẫn
   dùng `postgres` superuser thì trigger vẫn chặn được nhưng có thể bị `DISABLE TRIGGER` — cần role
   riêng (M12).
4. **Hoá đơn điện tử** là điều kiện pháp lý; nếu go-live trước khi có, phải có văn bản của kế toán
   về phương án hoá đơn giấy/bên ngoài trong giai đoạn chuyển tiếp.
5. **UAT mỏng** (chỉ chủ quán test) ⇒ rủi ro cao nhất là ca đêm/cuối tuần, khi không có hỗ trợ.

---

## 6. Tệp tham chiếu trong repo

- ADR sổ cái: `docs/adr/0001-ledger-doi-soat-multi-branch.md`
- Deploy: `docs/deploy.md` · Backup: `docs/backup.md` · Runbook dữ liệu: `docs/runbook-data-infra.md`
- CI: `.github/workflows/ci.yml`, `.github/workflows/e2e.yml`
- Test tài chính: `test/finance.e2e-spec.ts` (2.032 dòng) — nơi bổ sung kịch bản hoàn tiền/cọc
