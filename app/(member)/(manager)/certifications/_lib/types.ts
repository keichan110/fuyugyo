import type { Certification, Department } from "@prisma/client";

export interface CertificationWithDepartment extends Certification {
  department: {
    id: string;
    code: string;
    name: string;
  };
}

export type DepartmentData = Department;

export type CertificationStats = {
  total: number;
  active: number;
  ski: number;
  snowboard: number;
};

export type CertificationFormData = {
  name: string;
  shortName: string;
  department: "ski" | "snowboard";
  organization: string;
  description: string;
  status: "active" | "inactive";
};

export type CertificationModalProps = {
  isOpen: boolean;
  onClose: () => void;
  certification?: CertificationWithDepartment | null;
  onSave: (data: CertificationFormData) => Promise<void>;
};

export type CertificationCardProps = {
  certification: CertificationWithDepartment;
  onEdit: (certification: CertificationWithDepartment) => void;
};

export type FilterType = "all" | "ski" | "snowboard" | "active";
