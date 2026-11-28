-- Append-only ở TẦNG DB cho sổ cái và nhật ký.
--
-- Trước đây "append-only" chỉ là quy ước trong code: ai có `DATABASE_URL` (script dump, psql tay,
-- `data:vn`) đều `UPDATE "LedgerLine" SET amount = ...` hoặc `DELETE FROM "AuditLog"` được.
-- Luật Kế toán 88/2015 (Điều 41) và chính ADR 0001 yêu cầu sổ đã ghi thì không được sửa/xoá;
-- sai thì ghi bút toán đảo.
--
-- Ngoại lệ có kiểm soát: script dọn dữ liệu seed đặt `SET LOCAL app.allow_ledger_delete = 'on'`
-- trong transaction của nó. Production KHÔNG đặt cờ này, nên mọi UPDATE/DELETE đều bị chặn.

CREATE OR REPLACE FUNCTION "deny_append_only_mutation"() RETURNS trigger AS $$
BEGIN
  IF current_setting('app.allow_ledger_delete', true) = 'on' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  RAISE EXCEPTION 'append-only: %.% không được phép (chỉ INSERT; sai thì ghi bút toán đảo)',
    TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "LedgerLine_no_update_delete" ON "LedgerLine";
CREATE TRIGGER "LedgerLine_no_update_delete"
  BEFORE UPDATE OR DELETE ON "LedgerLine"
  FOR EACH ROW EXECUTE FUNCTION "deny_append_only_mutation"();

DROP TRIGGER IF EXISTS "AuditLog_no_update_delete" ON "AuditLog";
CREATE TRIGGER "AuditLog_no_update_delete"
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION "deny_append_only_mutation"();

-- LedgerEntry: cho phép DUY NHẤT bước DRAFT -> POSTED của chính posting service.
-- Không cho sửa nội dung bút toán đã POSTED, không cho xoá.
CREATE OR REPLACE FUNCTION "ledger_entry_guard"() RETURNS trigger AS $$
BEGIN
  IF current_setting('app.allow_ledger_delete', true) = 'on' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'append-only: "LedgerEntry" không được xoá'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF OLD."status" = 'POSTED' THEN
    RAISE EXCEPTION 'append-only: bút toán đã POSTED không được sửa'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF NEW."status" <> 'POSTED' OR NEW."postedAt" IS NULL THEN
    RAISE EXCEPTION 'LedgerEntry chỉ được chuyển DRAFT -> POSTED'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "LedgerEntry_guard" ON "LedgerEntry";
CREATE TRIGGER "LedgerEntry_guard"
  BEFORE UPDATE OR DELETE ON "LedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION "ledger_entry_guard"();
