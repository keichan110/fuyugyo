import { NextRequest, NextResponse } from "next/server";
import { MILLISECONDS_PER_SECOND, SESSION_TIMEOUT_MS } from "@/constants/auth";
import { HTTP_STATUS_OK } from "@/constants/http-status";
import { incrementTokenUsage } from "@/lib/auth/invitations";
import { generateJwt } from "@/lib/auth/jwt";
import { executeLineAuthFlow } from "@/lib/auth/line";
import { getPrisma } from "@/lib/db";
import { deleteCookie, setAuthCookie } from "@/lib/utils/cookies";
import { secureAuthLog, secureLog } from "@/lib/utils/logging";
import type { AuthSession } from "./utils";
import {
  createErrorRedirect,
  createNewUser,
  parseSessionData,
  resolveErrorMessage,
  updateUserProfileIfNeeded,
  validateInvitation,
  validateSessionAge,
} from "./utils";

/**
 * LINE認証コールバックAPI
 * LINE認証完了後のコールバック処理
 *
 * GET /api/auth/line/callback?code=xxx&state=xxx
 *
 * Query Parameters:
 * - code: string - LINE認証コード
 * - state: string - CSRF防止用state値
 * - error?: string - 認証エラー（ユーザーがキャンセル時等）
 * - error_description?: string - エラー詳細
 *
 * Response:
 * - 302 Redirect: 認証成功時は管理画面へリダイレクト
 * - 400/401/500 Error: エラー詳細付きJSONレスポンスまたはエラーページリダイレクト
 */

/**
 * 認証パラメータを検証する
 */
function validateAuthParams(
  request: NextRequest
):
  | { success: true; code: string; receivedState: string }
  | { success: false; redirect: NextResponse } {
  const { searchParams } = new URL(request.url);

  // エラーパラメータのチェック
  const error = searchParams.get("error");
  if (error) {
    const errorDescription = searchParams.get("error_description");
    secureLog("info", "LINE authentication cancelled or failed", {
      error,
      description: errorDescription,
    });
    return {
      success: false,
      redirect: createErrorRedirect(request, "cancelled"),
    };
  }

  // 必須パラメータの取得
  const code = searchParams.get("code");
  const receivedState = searchParams.get("state");

  if (!(code && receivedState)) {
    secureLog("error", "Missing required LINE callback parameters");
    return {
      success: false,
      redirect: createErrorRedirect(request, "invalid_callback"),
    };
  }

  return { success: true, code, receivedState };
}

/**
 * セッション情報を検証する
 */
function validateSessionCookie(
  request: NextRequest
):
  | { success: true; sessionData: AuthSession }
  | { success: false; redirect: NextResponse } {
  const sessionCookie = request.cookies.get("auth-session")?.value;
  if (!sessionCookie) {
    secureLog("error", "Authentication session cookie missing");
    return {
      success: false,
      redirect: createErrorRedirect(request, "session_expired"),
    };
  }

  const parseResult = parseSessionData(sessionCookie);
  if (!parseResult.success) {
    secureLog("error", parseResult.error);
    return {
      success: false,
      redirect: createErrorRedirect(request, "invalid_session"),
    };
  }

  const sessionData = parseResult.data;
  const ageValidation = validateSessionAge(sessionData, SESSION_TIMEOUT_MS);
  if (!ageValidation.isValid) {
    secureLog("error", ageValidation.error);
    return {
      success: false,
      redirect: createErrorRedirect(request, "session_expired"),
    };
  }

  return { success: true, sessionData };
}

/**
 * ユーザーを取得または作成する
 */
async function getOrCreateUser(
  profile: {
    userId: string;
    displayName: string;
    pictureUrl?: string | undefined;
  },
  inviteToken: string | undefined,
  request: NextRequest
): Promise<
  | {
      success: true;
      user: {
        id: string;
        lineUserId: string;
        displayName: string;
        pictureUrl: string | null;
        role: string;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
      };
    }
  | { success: false; redirect: NextResponse }
> {
  let user = await (await getPrisma()).user.findUnique({
    where: { lineUserId: profile.userId },
  });

  if (user) {
    secureAuthLog("Existing user login", {
      id: user.id,
      displayName: user.displayName,
      role: user.role,
      isActive: user.isActive,
    });
    user = await updateUserProfileIfNeeded(user, profile);
    return { success: true, user };
  }

  // 新規ユーザー作成
  secureAuthLog("Creating new user with invitation validation", {
    lineUserId: profile.userId,
    displayName: profile.displayName,
    hasInviteToken: !!inviteToken,
  });

  const invitationValidation = await validateInvitation(inviteToken);
  if (!invitationValidation.isValid) {
    secureLog("error", invitationValidation.errorMessage);
    return {
      success: false,
      redirect: createErrorRedirect(request, invitationValidation.errorReason),
    };
  }

  // invitationValidation.isValid が true なので inviteToken は必ず存在する
  if (!inviteToken) {
    secureLog("error", "Invite token is required but not provided");
    return {
      success: false,
      redirect: createErrorRedirect(request, "invitation_required"),
    };
  }

  try {
    user = await createNewUser(profile, inviteToken);

    // 招待トークンの使用回数を増加
    try {
      await incrementTokenUsage(inviteToken);
      secureLog("info", "Invitation token usage incremented successfully");
    } catch (incrementError) {
      secureLog("warn", "Failed to increment invitation token usage", {
        error: resolveErrorMessage(
          incrementError,
          "Unknown error while incrementing invitation token usage"
        ),
      });
    }

    return { success: true, user };
  } catch (userCreationError) {
    secureLog("error", "Failed to create user", {
      error: resolveErrorMessage(
        userCreationError,
        "Unknown error during user creation"
      ),
    });
    return {
      success: false,
      redirect: createErrorRedirect(request, "user_creation_failed"),
    };
  }
}

/**
 * 認証完了レスポンスを作成する
 */
async function createSuccessResponse(
  user: {
    id: string;
    lineUserId: string;
    displayName: string;
    role: string;
    isActive: boolean;
  },
  redirectUrl: string,
  request: NextRequest
) {
  const jwtPayload = {
    userId: user.id,
    lineUserId: user.lineUserId,
    displayName: user.displayName,
    role: user.role as "ADMIN" | "MANAGER" | "MEMBER",
    isActive: user.isActive,
  };

  const token = await generateJwt(jwtPayload);
  secureLog("info", "JWT generated for user", {
    displayName: user.displayName,
  });

  const redirectPath = redirectUrl || "/";
  const successUrl = new URL(redirectPath, request.url);
  const response = NextResponse.redirect(successUrl, { status: 302 });

  setAuthCookie(response, token);
  deleteCookie(response, "auth-session");

  secureAuthLog("Authentication completed successfully", {
    userId: user.id,
    displayName: user.displayName,
    role: user.role,
    redirectUrl: successUrl.toString(),
  });

  return response;
}

/**
 * GET /api/auth/line/callback
 * LINE認証コールバック処理
 */
export async function GET(request: NextRequest) {
  try {
    // 1. 認証パラメータの検証
    const paramsValidation = validateAuthParams(request);
    if (!paramsValidation.success) {
      return paramsValidation.redirect;
    }

    // 2. セッションの検証
    const sessionValidation = validateSessionCookie(request);
    if (!sessionValidation.success) {
      return sessionValidation.redirect;
    }

    const { sessionData } = sessionValidation;
    const sessionAge = Date.now() - sessionData.createdAt;

    secureAuthLog("Processing LINE authentication callback", {
      hasCode: true,
      hasState: true,
      hasInviteToken: !!sessionData.inviteToken,
      sessionAge: `${Math.round(sessionAge / MILLISECONDS_PER_SECOND)}s`,
    });

    // 3. LINE認証フローの実行
    const authResult = await executeLineAuthFlow(
      paramsValidation.code,
      paramsValidation.receivedState,
      sessionData.state
    );

    if (!(authResult.success && authResult.profile)) {
      secureLog("error", "LINE authentication flow failed");
      return createErrorRedirect(request, "auth_failed");
    }

    secureAuthLog("LINE authentication successful", {
      userId: authResult.profile.userId,
      displayName: authResult.profile.displayName,
      hasInviteToken: !!authResult.inviteToken,
    });

    // 4. ユーザーの取得または作成
    const userResult = await getOrCreateUser(
      authResult.profile,
      sessionData.inviteToken,
      request
    );

    if (!userResult.success) {
      return userResult.redirect;
    }

    const { user } = userResult;

    // 5. 非アクティブユーザーのチェック
    if (!user.isActive) {
      secureLog("warn", "Inactive user attempted login", { userId: user.id });
      return createErrorRedirect(request, "inactive_user");
    }

    // 6. 認証成功レスポンスの作成
    return await createSuccessResponse(
      user,
      sessionData.redirectUrl || "/",
      request
    );
  } catch (error) {
    secureLog("error", "Authentication callback failed", {
      error: resolveErrorMessage(
        error,
        "Unknown error during authentication callback"
      ),
    });
    return createErrorRedirect(request, "system_error");
  }
}

/**
 * POST /api/auth/line/callback
 * POST形式でのコールバック処理（必要に応じて）
 */
export async function POST(request: NextRequest) {
  // POSTでのコールバックは通常使用されないが、念のため実装
  try {
    const formData = await request.formData();
    const code = formData.get("code")?.toString();
    const state = formData.get("state")?.toString();
    const error = formData.get("error")?.toString();

    if (error) {
      secureLog("info", "LINE authentication cancelled via POST callback", {
        error,
      });
      return NextResponse.redirect(
        new URL("/error?reason=cancelled", request.url),
        {
          status: 302,
        }
      );
    }

    if (!(code && state)) {
      return NextResponse.redirect(
        new URL("/error?reason=invalid_callback", request.url),
        {
          status: 302,
        }
      );
    }

    // GET処理と同様の処理を実行
    const urlWithParams = new URL(request.url);
    urlWithParams.searchParams.set("code", code);
    urlWithParams.searchParams.set("state", state);

    const modifiedRequest = new NextRequest(urlWithParams);
    return await GET(modifiedRequest);
  } catch (error) {
    secureLog("error", "POST callback processing failed", {
      error: resolveErrorMessage(error, "Unknown error during POST callback"),
    });
    return NextResponse.redirect(
      new URL("/error?reason=system_error", request.url),
      {
        status: 302,
      }
    );
  }
}

/**
 * OPTIONS /api/auth/line/callback
 * CORS対応
 */
export function OPTIONS() {
  return new NextResponse(null, {
    status: HTTP_STATUS_OK,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
