import { type NextRequest, NextResponse } from "next/server";
import { authenticateFromRequest } from "@/lib/auth/middleware";
import { getPrisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const authResult = await authenticateFromRequest(request);
  if (!authResult.success) {
    return NextResponse.json(
      {
        success: false,
        error: "Authentication required",
        data: null,
        message: null,
      },
      { status: 401 }
    );
  }
  try {
    const certifications = await (await getPrisma()).certification.findMany({
      include: {
        department: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [{ department: { name: "asc" } }, { name: "asc" }],
    });

    return NextResponse.json({
      success: true,
      data: certifications,
      count: certifications.length,
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
