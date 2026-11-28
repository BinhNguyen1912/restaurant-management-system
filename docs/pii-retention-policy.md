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

## 4. Ẩn danh hoá — quy trình, và phần CHƯA làm

Khi hết thời hạn, hồ sơ khách phải thành:

- `Customer.phone` → `anonymized:<id>` (không còn là SĐT, vẫn duy nhất nên không vỡ ràng buộc),
- `Customer.name` → `"Khách"`, `email` → `NULL`, `note` → `NULL`,
- `Reservation.customerName` / `customerPhone` của các lượt cũ → cùng cách,
- **giữ nguyên**: `Order.grandTotal`, `Payment`, `LedgerEntry`, `PointRedemption` (số tiền, ngày),
- **giữ nguyên** `ConsentLog` cho tới khi xoá hồ sơ (bằng chứng đã có cơ sở xử lý trước đó).

> ⚠ **Chưa có code nào chạy việc này.** Chưa có script `anonymize`, chưa có job định kỳ. Viết script
> trước khi chạy thật, và **không đặt thời hạn mặc định trong code**: script phải nhận tham số thời
> hạn để người chạy nêu rõ con số đã được ký, tránh việc code tự quyết định thay pháp lý.

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

1. Chính sách này được kế toán + luật sư sửa và **ký**; các ⚠ ở trên được trả lời.
2. Script ẩn danh hoá + cách chạy (tay hay cron) + test trên dữ liệu thật.
3. `AccessLog` cho route nhạy cảm (đọc dữ liệu khách cũng là xử lý dữ liệu) — §M9 mục 2.
4. 2FA cho ADMIN/KE_TOAN — §M9 mục 5.
5. Media chứng từ (ảnh biên nhận) đang ở Cloudinary nước ngoài — §M9 mục 4, cần đánh giá chuyển dữ
   liệu ra nước ngoài (NĐ 53/2022).
6. Audit cho việc sửa `Customer.note`.
