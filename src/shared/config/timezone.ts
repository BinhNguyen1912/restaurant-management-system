/**
 * Múi giờ nghiệp vụ của toàn hệ thống (ticket #04).
 *
 * Phải được nạp TRƯỚC mọi module khác (main.ts import file này đầu tiên) vì Node đọc TZ lúc
 * khởi tạo Date; đặt sau khi module đã import thì không còn tác dụng.
 *
 * Vì sao cần: báo cáo cắt ngày theo giờ VN. Nếu container/máy chạy UTC, đơn 23:30 giờ VN sẽ bị
 * tính sang ngày hôm sau — doanh thu chốt sai ngày mà không ai thấy.
 */
process.env.TZ = process.env.TZ || 'Asia/Ho_Chi_Minh'

export const SYSTEM_TIME_ZONE = process.env.TZ
