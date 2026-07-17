ALTER TABLE `certification_requirements` RENAME COLUMN "level" TO "tier_rank";--> statement-breakpoint
CREATE TABLE `certification_requirement_tier_ranks_migration` AS
SELECT
  `id`,
  DENSE_RANK() OVER (
    PARTITION BY `department_shift_type_id`
    ORDER BY `tier_rank` DESC
  ) AS `tier_rank`
FROM `certification_requirements`;--> statement-breakpoint
UPDATE `certification_requirements`
SET `tier_rank` = (
  SELECT `tier_rank`
  FROM `certification_requirement_tier_ranks_migration`
  WHERE `certification_requirement_tier_ranks_migration`.`id` = `certification_requirements`.`id`
);--> statement-breakpoint
DROP TABLE `certification_requirement_tier_ranks_migration`;
