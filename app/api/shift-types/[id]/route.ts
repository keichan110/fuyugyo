import { type NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/db";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: NextRequest, context: Params) {
  try {
    const { id } = await context.params;
    const shiftTypeId = Number.parseInt(id, 10);

    if (Number.isNaN(shiftTypeId)) {
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

    const shiftType = await (await getPrisma()).shiftType.findUnique({
      where: {
        id: shiftTypeId,
      },
    });

    if (!shiftType) {
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

    return NextResponse.json(shiftType);
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
