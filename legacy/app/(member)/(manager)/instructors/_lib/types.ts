import type { Instructor } from "@prisma/client";

/**
 * シリアライズ済みのインストラクター型
 * Server ComponentからClient Componentに渡すため、Date型はstring型に変換
 */
export interface InstructorWithCertifications
  extends Omit<Instructor, "createdAt" | "updatedAt"> {
  createdAt: string; // Date → ISO 8601 string
  updatedAt: string; // Date → ISO 8601 string
  certifications: {
    id: string;
    name: string;
    shortName: string | null;
    organization: string;
    department: {
      id: string;
      code: string;
      name: string;
    };
  }[];
}

export type InstructorStats = {
  total: number;
  active: number;
  skiInstructors: number;
  snowboardInstructors: number;
};

export type InstructorFormData = {
  lastName: string;
  firstName: string;
  lastNameKana?: string;
  firstNameKana?: string;
  status: "active" | "inactive" | "retired";
  notes?: string;
  certificationIds?: string[];
};

export type InstructorModalProps = {
  isOpen: boolean;
  onClose: () => void;
  instructor?: InstructorWithCertifications | null;
  onSave: (data: InstructorFormData) => Promise<void>;
};

export type InstructorCardProps = {
  instructor: InstructorWithCertifications;
  onEdit: (instructor: InstructorWithCertifications) => void;
};

export type CategoryFilterType = "all" | "ski" | "snowboard";
