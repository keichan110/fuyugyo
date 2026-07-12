INSERT INTO `departments` (`id`, `code`, `name`) VALUES
  ('dept-ski', 'ski', 'スキー'),
  ('dept-snowboard', 'snowboard', 'スノーボード');

INSERT INTO `certifications` (`id`, `department_id`, `name`, `short_name`, `organization`) VALUES
  ('cert-ski', 'dept-ski', 'スキー指導員', '指導員', 'SAJ'),
  ('cert-snowboard', 'dept-snowboard', 'スノーボード指導員', '指導員', 'SAJ');

INSERT INTO `instructors` (`id`, `last_name`, `first_name`) VALUES
  ('instructor-1', '山田', '太郎');

INSERT INTO `instructor_certifications` (`id`, `instructor_id`, `certification_id`) VALUES
  ('instructor-certification-1', 'instructor-1', 'cert-ski');

INSERT INTO `shift_types` (`id`, `name`) VALUES
  ('shift-type-1', '終日');

INSERT INTO `shifts` (`id`, `date`, `department_id`, `shift_type_id`) VALUES
  ('shift-1', 1783695600, 'dept-ski', 'shift-type-1');

INSERT INTO `shift_assignments` (`id`, `shift_id`, `instructor_id`) VALUES
  ('shift-assignment-1', 'shift-1', 'instructor-1');
