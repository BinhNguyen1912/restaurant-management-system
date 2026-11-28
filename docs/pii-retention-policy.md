# Chính sách dữ liệu cá nhân và thời hạn lưu trữ (BẢN NHÁP)

> **Trạng thái: BẢN NHÁP — CHƯA CÓ HIỆU LỰC.**
> Theo `docs/prod-readiness-plan.md` §M9, điều kiện thoát của hạng mục này là *"chính sách lưu trữ bằng
> văn bản (kế toán + luật sư ký), code thực thi đúng chính sách đó"*. Tài liệu này là bản nháp để hai
> bên đó sửa và ký; **các con số thời hạn dưới đây là đề xuất của người viết code, không phải kết luận
> pháp lý**. Những chỗ đánh dấu ⚠ cần quyết định trước khi ký.

## 1. Dữ liệu cá nhân đang lưu ở đâu

| Dữ liệu | Bảng | Vì sao phải có | Ghi chú |
|---|---|---|---|
| SĐT khách | `Customer.phone` (duy nhất), `Reservation.customerPhone` | liên hệ về đơn/đặt bàn; khoá nhận diện khách quay lại | SĐT đã chuẩn hoá (`customer.identity.ts`) |
| Tên khách | `Customer.name`, `Reservation.customerName` | gọi tên khi khách tới, phân biệt hai khách cùng số | |
| Email khách | `Customer.email` | liên hệ khi khách đưa | hiện chưa dùng để gửi gì |
| Ghi chú chăm sóc | `Customer.note` | dị ứng, sở thích, khách VIP | **văn bản tự do ⇒ dễ lọt dữ liệu nhạy cảm**, xem §5 |
| Lịch sử ăn/uống | `Order`, `PointRedemption` | bán hàng, đối soát, điểm thưởng | dữ liệu kế toán, xem §3 |
| Nhật ký đồng ý | `ConsentLog` | bằng chứng khách đồng ý/rút lúc nào | append-only, xem §2 |
| IP người ghi nhận | `ConsentLog.ip`, `AuditLog` | giải trình ai làm gì | IP của nhân viên/quầy |

Không lưu: số CCCD, ngày sinh, địa chỉ, dữ liệu thẻ (thanh toán qua VNPay, không đi qua hệ thống).

## 2. Đồng ý (NĐ 13/2023/NĐ-CP, Điều 9)

Đồng ý được ghi **theo từng mục đích**, không có "đồng ý chung":

| Mục đích | Nghĩa | Cơ sở |
|---|---|---|
| `SERVICE` | liên hệ về đơn hàng / lượt đặt bàn | khách tự đưa số để việc đặt bàn thực hiện được |
| `MARKETING` | gửi ưu đãi, khuyến mại | **phải được hỏi riêng và đồng ý riêng** |

Cách code thực thi (`src/routes/customer/customer.consent-policy.ts`):

- `ConsentLog` là **append-only** (trigger DB chặn `UPDATE`): mỗi lần khách đồng ý hoặc rút là một
  dòng mới. "Đang đồng ý" = dòng mới nhất của `(customerId, purpose)`.
- Thiếu dòng ⇒ **coi như chưa đồng ý** (`active = false`), không có chuyện mặc định đồng ý.
- Đổi nội dung chính sách ⇒ **tăng `CONSENT_POLICY_VERSION`**; mọi đồng ý cũ thành `stale = true`,
  tức hết hiệu lực cho tới khi hỏi lại khách.
- Ghi nhận lúc đặt bàn: `POST /reservation` nhận `marketingConsent?: boolean`; **không gửi = chưa
  hỏi khách ⇒ không ghi gì** (không tự ghi "đồng ý" thay khách).
- Ghi nhận tại quầy: `POST /customers/:id/consent` (STAFF được phép — người hỏi khách là nhân viên),
  mỗi lần ghi đều có `AuditLog` action `CONSENT_RECORDED`.
- Hệ quả hiện tại: **chưa có tính năng nào gửi quảng cáo**, nên chưa có chỗ nào *dùng* `MARKETING`.
  Khi làm tính năng gửi ưu đãi, điều kiện bắt buộc là `active = true` cho `MARKETING` — đọc qua
  `currentConsents()`, không tự so `granted` ở nơi khác.

## 3. Thời hạn lưu (ĐỀ XUẤT — ⚠ cần kế toán + luật sư chốt)

| Nhóm | Đề xuất | Vì sao |
|---|---|---|
| Hồ sơ khách không phát sinh giao dịch | 24 tháng kể từ lần cuối tới, sau đó ẩn danh hoá | đủ để nhận ra khách quay lại, không giữ vô hạn |
| `Reservation` (tên + SĐT) | 12 tháng sau lượt đặt bàn | hết giá trị vận hành sau khi khách tới |
| Hoá đơn / sổ cái (`Order`, `LedgerEntry`, `Payment`) | **10 năm** | Luật Kế toán 88/2015, Điều 41 — chứng từ phải giữ |
| `ConsentLog` | theo vòng đời hồ sơ khách | là bằng chứng pháp lý, xoá cùng hồ sơ |

Điểm xung đột phải viết rõ trong chính sách: **quyền xoá dữ liệu không xoá được chứng từ kế toán**.
Cách xử lý đang dùng: hoá đơn giữ số tiền, còn *danh tính* khách trong hoá đơn chỉ còn `customerId`
trỏ tới hồ sơ đã ẩn danh ⇒ mất liên hệ với con người nhưng vẫn đối soát được sổ.

## 4. Ẩn danh hoá — đã có code, cách chạy

`src/routes/customer/customer.anonymize.ts` (việc xoá PII) + `customer.anonymize-policy.ts` (luật
thuần, có unit test) + script `npm run pii:anonymize`.

Hai chế độ:

| Chế độ | Lệnh | Dùng khi |
|---|---|---|
| Quét theo thời hạn lưu | `npm run pii:anonymize -- --months=24` (thêm `--apply` để ghi) | định kỳ, mỗi quý |
| Một khách yêu cầu xoá | `npm run pii:anonymize -- --customer=37 --apply` | khách gọi tới đòi xoá dữ liệu |

**Mặc định là chạy thử**: không có `--apply` thì chỉ in ra sẽ làm gì. `--months` là tham số bắt
buộc, không có giá trị mặc định — con số ở §3 phải do người chạy nêu rõ, không do code chọn hộ.

Khi hồ sơ hết hạn, dữ liệu thành:

- `Customer.phone` → `anonymized:<id>` (không còn là SĐT, vẫn duy nhất nên không vỡ ràng buộc),
- `Customer.name` → `"Khách đã ẩn danh"` (⚠ khác bản nháp cũ là `"Khách"`: một cái tên trông như tên
  thật thì lễ tân sẽ gọi khách bằng nó, còn chuỗi này tự nói nó là gì), `email` → `NULL`, `note` → `NULL`,
- `Reservation.customerName` / `customerPhone` / `note` của các lượt cũ → cùng cách,
- `Customer.anonymizedAt` = thời điểm ẩn danh (**dấu duy nhất** để chạy lại không làm gì),
- **giữ nguyên**: `Order.grandTotal`, `Payment`, `LedgerEntry`, `PointRedemption` (số tiền, ngày) và
  `Order.customerId` — hoá đơn là chứng từ kế toán, không được đứt,
- **giữ nguyên** `ConsentLog` cho tới khi xoá hồ sơ (bằng chứng đã có cơ sở xử lý trước đó),
- **giữ nguyên** `Customer.userId`: tài khoản đăng ký là luồng xoá riêng (§M9.1), xoá ở đây sẽ làm
  hỏng đăng nhập của một người khác.

Ba chốt an toàn trong code:

1. **Fail closed**: `--months` ≤ 0 hoặc không phải số ⇒ không ẩn danh gì (cấu hình sai không được
   biến thành lệnh xoá dữ liệu).
2. **Khách còn đơn chưa thu tiền ⇒ giữ nguyên** (`openOrders > 0`), kể cả khi đã quá hạn: ẩn danh
   người đang ăn là phá việc phục vụ.
3. **Nhật ký ẩn danh không chứa PII**: `AuditLog` là append-only, nên `before`/`after` chỉ ghi
   `anonymizedAt` và số lượt đặt bàn. Chép SĐT cũ vào nhật ký là tự vô hiệu việc ẩn danh.

Điều kiện "lần hoạt động cuối": muộn nhất trong *tạo hồ sơ, đơn hàng, lượt đặt bàn (cả giờ hẹn — khách
đặt trước 13 tháng cho hôm nay thì hôm nay vẫn phải phục vụ), lần ghi nhận đồng ý*. **Không** tính
`Customer.updatedAt`: đó là lúc nhân viên sửa ghi chú, không phải khách hoạt động.

Chạy tự động: hiện là lệnh tay. Nếu đưa vào cron thì phải (a) chạy `--apply` với `--months` đã ký,
(b) ghi log của cron, (c) không chạy chung với giờ cao điểm. Chưa cấu hình cron trong repo này.

## 5. Kiểm soát truy cập

| Việc | Ai được làm | Ghi chú |
|---|---|---|
| Xem danh sách/hồ sơ khách | ADMIN (mọi chi nhánh), STAFF (chỉ số liệu chi nhánh mình) | `create-permissions.ts`: `CUSTOMERS: GET` |
| Trừ điểm trên hoá đơn | ADMIN, STAFF | `CUSTOMERS: POST` |
| Ghi nhận / rút đồng ý | ADMIN, STAFF | ghi `AuditLog` mỗi lần |
| Sửa ghi chú chăm sóc | **chỉ ADMIN** | `CUSTOMERS: PATCH` — ghi chú tự do nên hạn chế người viết |
| Xem điểm/lịch sử điểm | ADMIN, STAFF | điểm là của khách, không cắt theo chi nhánh |

Ghi chú chăm sóc là ô văn bản tự do: quy định nội bộ phải nói rõ **không ghi dữ liệu nhạy cảm**
(bệnh án, tôn giáo, số giấy tờ) và phải có cách xoá khi khách yêu cầu — hiện xoá được bằng cách sửa
ghi chú về rỗng, nhưng **không có audit cho lần sửa ghi chú** (⚠ nên thêm).

## 6. Việc còn thiếu trước khi coi là xong (§M9)

1. Chính sách này được kế toán + luật sư sửa và **ký**; các ⚠ ở trên được trả lời. Ký xong mới được
   chạy `--apply` với con số thật.
2. ~~Script ẩn danh hoá~~ — **đã có** (§4), đã chạy thật trên DB dev và có e2e
   (`test/customer-anonymize.e2e-spec.ts`). Còn lại: chọn lịch chạy (cron) sau khi có con số đã ký.
3. `AccessLog` cho route nhạy cảm (đọc dữ liệu khách cũng là xử lý dữ liệu) — §M9 mục 2.
4. 2FA cho ADMIN/KE_TOAN — §M9 mục 5.
5. Media chứng từ (ảnh biên nhận) đang ở Cloudinary nước ngoài — §M9 mục 4, cần đánh giá chuyển dữ
   liệu ra nước ngoài (NĐ 53/2022).
6. Audit cho việc sửa `Customer.note` (hiện chỉ `PATCH /customers/:id/note` mà không ghi nhật ký).
