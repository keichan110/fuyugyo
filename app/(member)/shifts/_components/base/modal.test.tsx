import { render, screen } from "@testing-library/react";
import type { DayData, DepartmentType } from "../../_lib/types";
import { AdminShiftModal, BaseShiftModal, PublicShiftModal } from "./modal";

// Mock data
const mockDayDataEmpty: DayData = {
  date: "2024-01-15",
  isHoliday: false,
  shifts: [],
};

const mockDayDataWithShifts: DayData = {
  date: "2024-01-15",
  isHoliday: false,
  shifts: [
    {
      type: "午前",
      department: "ski" as DepartmentType,
      count: 1,
      assignedInstructors: [
        {
          id: "test-instructor-1",
          lastName: "田中",
          firstName: "太郎",
          displayName: "田中太郎",
        },
        {
          id: "test-instructor-2",
          lastName: "佐藤",
          firstName: "花子",
          displayName: "佐藤花子",
        },
      ],
    },
  ],
};

describe("BaseShiftModal", () => {
  const defaultProps = {
    isOpen: true,
    onOpenChange: jest.fn(),
    selectedDate: "2024-01-15",
    dayData: mockDayDataEmpty,
    variant: "public" as const,
  };

  it("should render with formatted date in title", () => {
    render(<BaseShiftModal {...defaultProps} />);

    expect(screen.getByText("2024年1月15日（月）")).toBeInTheDocument();
  });

  it("should show empty state when no shifts", () => {
    render(<BaseShiftModal {...defaultProps} dayData={mockDayDataEmpty} />);

    expect(screen.getByText("シフトが設定されていません")).toBeInTheDocument();
    expect(
      screen.getByText("この日はシフトの設定がありません")
    ).toBeInTheDocument();
  });

  it("should render children when shifts exist", () => {
    render(
      <BaseShiftModal {...defaultProps} dayData={mockDayDataWithShifts}>
        <div>カスタムコンテンツ</div>
      </BaseShiftModal>
    );

    expect(screen.getByText("カスタムコンテンツ")).toBeInTheDocument();
  });

  it("should show default footer for public variant", () => {
    render(
      <BaseShiftModal
        {...defaultProps}
        dayData={mockDayDataWithShifts}
        variant="public"
      />
    );

    expect(screen.getByRole("button", { name: "閉じる" })).toBeInTheDocument();
  });

  it("should not show default footer for admin variant", () => {
    render(
      <BaseShiftModal
        {...defaultProps}
        dayData={mockDayDataWithShifts}
        variant="admin"
      />
    );

    expect(
      screen.queryByRole("button", { name: "閉じる" })
    ).not.toBeInTheDocument();
  });

  it("should render custom footer when provided", () => {
    const customFooter = <div>カスタムフッター</div>;
    render(
      <BaseShiftModal
        {...defaultProps}
        dayData={mockDayDataWithShifts}
        footer={customFooter}
        variant="admin"
      />
    );

    expect(screen.getByText("カスタムフッター")).toBeInTheDocument();
  });

  it("should render custom title when provided", () => {
    render(
      <BaseShiftModal
        {...defaultProps}
        dayData={mockDayDataWithShifts}
        title="カスタムタイトル"
      />
    );

    expect(screen.getByText("カスタムタイトル")).toBeInTheDocument();
  });

  it("should return null when selectedDate is null", () => {
    const { container } = render(
      <BaseShiftModal {...defaultProps} selectedDate={null} />
    );

    expect(container.firstChild).toBeNull();
  });
});

describe("PublicShiftModal", () => {
  const defaultProps = {
    isOpen: true,
    onOpenChange: jest.fn(),
    selectedDate: "2024-01-15",
    dayData: mockDayDataWithShifts,
  };

  it("should render with public variant behavior", () => {
    render(<PublicShiftModal {...defaultProps} />);

    expect(screen.getByRole("button", { name: "閉じる" })).toBeInTheDocument();
  });
});

describe("AdminShiftModal", () => {
  const defaultProps = {
    isOpen: true,
    onOpenChange: jest.fn(),
    selectedDate: "2024-01-15",
    dayData: mockDayDataWithShifts,
  };

  it("should render with admin variant behavior", () => {
    render(<AdminShiftModal {...defaultProps} />);

    // Admin variant should not have default footer
    expect(
      screen.queryByRole("button", { name: "閉じる" })
    ).not.toBeInTheDocument();
  });

  it("should render custom footer for admin variant", () => {
    const customFooter = <div>管理者フッター</div>;
    render(<AdminShiftModal {...defaultProps} footer={customFooter} />);

    expect(screen.getByText("管理者フッター")).toBeInTheDocument();
  });
});
