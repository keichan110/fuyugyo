ALTER TABLE `shifts` ADD `required_count` integer CHECK (`required_count` IS NULL OR `required_count` >= 0);
--> statement-breakpoint
ALTER TABLE `shifts` ADD `status` text DEFAULT 'DRAFT' NOT NULL CHECK (`status` IN ('DRAFT', 'PUBLISHED'));
--> statement-breakpoint
ALTER TABLE `shifts` ADD `revision` integer DEFAULT 0 NOT NULL CHECK (`revision` >= 0);
--> statement-breakpoint
UPDATE `shifts` SET `status` = 'PUBLISHED';
--> statement-breakpoint
DROP TABLE `shift_staffing_requirements`;
--> statement-breakpoint
-- 公開処理と本人の申告変更が競合しても、勤務不可のまま公開されることを防ぐ。
CREATE TRIGGER `shifts_check_availability_before_publish`
BEFORE UPDATE OF status ON shifts
WHEN NEW.status = 'PUBLISHED' AND OLD.status = 'DRAFT'
BEGIN
  SELECT RAISE(ABORT, 'shift_publish_unavailable')
  WHERE EXISTS (
    SELECT 1 FROM shift_assignments a
    JOIN instructor_availabilities v ON v.instructor_id = a.instructor_id AND v.date = NEW.date
    WHERE a.shift_id = NEW.id AND v.type = 'UNAVAILABLE'
  );
END;
--> statement-breakpoint
CREATE TRIGGER `availability_check_published_before_insert`
BEFORE INSERT ON instructor_availabilities
BEGIN
  SELECT RAISE(ABORT, 'availability_published_assignment')
  WHERE EXISTS (
    SELECT 1 FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id
    WHERE a.instructor_id = NEW.instructor_id AND s.date = NEW.date AND s.status = 'PUBLISHED'
  );
END;
--> statement-breakpoint
CREATE TRIGGER `availability_check_published_before_update`
BEFORE UPDATE ON instructor_availabilities
BEGIN
  SELECT RAISE(ABORT, 'availability_published_assignment')
  WHERE EXISTS (
    SELECT 1 FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id
    WHERE a.instructor_id = NEW.instructor_id AND s.date = NEW.date AND s.status = 'PUBLISHED'
  );
END;
