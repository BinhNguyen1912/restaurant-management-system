-- Index phục vụ đối soát/báo cáo theo kỳ (ticket #04).
-- Trước đây: đối soát lọc Payment theo (status, paidAt) và Reservation theo (deletedAt, reservationTime)
-- đều full-scan -> chậm dần khi dữ liệu lớn.

CREATE INDEX "Payment_status_paidAt_idx" ON "Payment"("status", "paidAt");
CREATE INDEX "Payment_branchId_paidAt_idx" ON "Payment"("branchId", "paidAt");
CREATE INDEX "Reservation_deletedAt_reservationTime_idx" ON "Reservation"("deletedAt", "reservationTime");
