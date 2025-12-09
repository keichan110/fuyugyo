import { type NextRequest, NextResponse } from "next/server";
import { authenticateFromRequest } from "@/lib/auth/middleware";
import { getPrisma } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateFromRequest(request);
  if (!authResult.success) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        message: null,
        error: "Authentication required",
      },
      { status: 401 }
    );
  }

  try {
    // パラメータを解決
    const resolvedParams = await params;

    // IDパラメータの検証
    const id = Number.parseInt(resolvedParams.id, 10);
    if (Number.isNaN(id)) {
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

    // 部門詳細を取得
    const department = await (await getPrisma()).department.findUnique({
      where: { id },
    });

    // 部門が存在しない場合
    if (!department) {
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

    // 成功レスポンス
    return NextResponse.json({
      success: true,
      data: department,
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
