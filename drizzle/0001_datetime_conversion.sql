-- Custom SQL migration file, put your code below! --

-- 旧 Prisma 形式（ISO-8601 テキスト）の日時カラムを
-- 新 Drizzle 形式（epoch 秒 integer）へ変換する。
-- 既に integer の行には no-op（冪等）。

UPDATE departments SET created_at = CASE WHEN typeof(created_at) = 'text'
  THEN CAST(strftime('%s', created_at) AS INTEGER)
  ELSE created_at
END;
UPDATE departments SET updated_at = CASE WHEN typeof(updated_at) = 'text'
  THEN CAST(strftime('%s', updated_at) AS INTEGER)
  ELSE updated_at
END;

UPDATE certifications SET created_at = CASE WHEN typeof(created_at) = 'text'
  THEN CAST(strftime('%s', created_at) AS INTEGER)
  ELSE created_at
END;
UPDATE certifications SET updated_at = CASE WHEN typeof(updated_at) = 'text'
  THEN CAST(strftime('%s', updated_at) AS INTEGER)
  ELSE updated_at
END;

UPDATE instructors SET created_at = CASE WHEN typeof(created_at) = 'text'
  THEN CAST(strftime('%s', created_at) AS INTEGER)
  ELSE created_at
END;
UPDATE instructors SET updated_at = CASE WHEN typeof(updated_at) = 'text'
  THEN CAST(strftime('%s', updated_at) AS INTEGER)
  ELSE updated_at
END;

UPDATE instructor_certifications SET created_at = CASE WHEN typeof(created_at) = 'text'
  THEN CAST(strftime('%s', created_at) AS INTEGER)
  ELSE created_at
END;
UPDATE instructor_certifications SET updated_at = CASE WHEN typeof(updated_at) = 'text'
  THEN CAST(strftime('%s', updated_at) AS INTEGER)
  ELSE updated_at
END;

UPDATE shift_types SET created_at = CASE WHEN typeof(created_at) = 'text'
  THEN CAST(strftime('%s', created_at) AS INTEGER)
  ELSE created_at
END;
UPDATE shift_types SET updated_at = CASE WHEN typeof(updated_at) = 'text'
  THEN CAST(strftime('%s', updated_at) AS INTEGER)
  ELSE updated_at
END;

UPDATE shifts SET date = CASE WHEN typeof(date) = 'text'
  THEN CAST(strftime('%s', date) AS INTEGER)
  ELSE date
END;
UPDATE shifts SET created_at = CASE WHEN typeof(created_at) = 'text'
  THEN CAST(strftime('%s', created_at) AS INTEGER)
  ELSE created_at
END;
UPDATE shifts SET updated_at = CASE WHEN typeof(updated_at) = 'text'
  THEN CAST(strftime('%s', updated_at) AS INTEGER)
  ELSE updated_at
END;

UPDATE shift_assignments SET assigned_at = CASE WHEN typeof(assigned_at) = 'text'
  THEN CAST(strftime('%s', assigned_at) AS INTEGER)
  ELSE assigned_at
END;

UPDATE users SET created_at = CASE WHEN typeof(created_at) = 'text'
  THEN CAST(strftime('%s', created_at) AS INTEGER)
  ELSE created_at
END;
UPDATE users SET updated_at = CASE WHEN typeof(updated_at) = 'text'
  THEN CAST(strftime('%s', updated_at) AS INTEGER)
  ELSE updated_at
END;

UPDATE invitation_tokens SET expires_at = CASE WHEN typeof(expires_at) = 'text'
  THEN CAST(strftime('%s', expires_at) AS INTEGER)
  ELSE expires_at
END;
UPDATE invitation_tokens SET created_at = CASE WHEN typeof(created_at) = 'text'
  THEN CAST(strftime('%s', created_at) AS INTEGER)
  ELSE created_at
END;
UPDATE invitation_tokens SET updated_at = CASE WHEN typeof(updated_at) = 'text'
  THEN CAST(strftime('%s', updated_at) AS INTEGER)
  ELSE updated_at
END;
