import { type NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/db";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    // IDが数値でない場合は404を返す
    const certificationId = Number.parseInt(id, 10);
    if (Number.isNaN(certificationId)) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: null,
          error: "Resource not found",
        },
        { status: 404 }
      );
    }

    const certification = await (await getPrisma()).certification.findUnique({
      where: { id: certificationId },
      include: {
        department: {
          select: {
            id: true,
            name: true,
          },
        },
        instructorCertifications: {
          include: {
            instructor: {
              select: {
                id: true,
                lastName: true,
                firstName: true,
                status: true,
              },
            },
          },
        },
      },
    });

    // 資格が見つからない場合は404を返す
    if (!certification) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: null,
          error: "Resource not found",
        },
        { status: 404 }
      );
    }

    // レスポンス形式をCertificationDetailスキーマに合わせて変換
    const { instructorCertifications, ...certificationBase } = certification;
    const certificationDetail = {
      ...certificationBase,
      instructors: instructorCertifications.map((ic) => ic.instructor),
    };

    return NextResponse.json({
      success: true,
      data: certificationDetail,
      message: null,
      error: null,
    });
  } catch (_error) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        message: null,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}
