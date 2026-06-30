import { handleAdminMockRequest } from "@/lib/admin-mock";
import { createDevAdminMessage, listDevAdminMessages, readDevAdminMessage } from "../../../../../lib/admin-dev-messages";

type RouteContext = {
  params: Promise<{
    path?: string[];
  }>;
};

const FORWARDED_REQUEST_HEADERS = ["authorization", "content-type", "accept", "idempotency-key"] as const;

function json(data: unknown, status = 200) {
  return Response.json({ success: true, data, message: "요청이 성공적으로 처리되었습니다." }, { status });
}

function readCurrentAdmin(request: Request) {
  const sourceUrl = new URL(request.url);
  const adminUserId = request.headers.get("x-admin-user-id")?.trim() ?? sourceUrl.searchParams.get("viewerAdminId")?.trim() ?? "";
  const adminName = request.headers.get("x-admin-name")?.trim() ?? sourceUrl.searchParams.get("viewerName")?.trim() ?? "";
  if (!adminUserId) {
    return null;
  }
  return {
    adminUserId,
    adminName: adminName || "관리자"
  };
}

async function dispatchDevMessages(request: Request, pathSegments: string[]) {
  const currentAdmin = readCurrentAdmin(request);
  if (!currentAdmin) {
    return Response.json({ error: { code: "UNAUTHORIZED", message: "관리자 세션 정보를 확인할 수 없습니다." } }, { status: 401 });
  }

  if (request.method === "GET" && pathSegments.length === 1) {
    return json(await listDevAdminMessages(currentAdmin.adminUserId));
  }

  if (request.method === "POST" && pathSegments.length === 1) {
    const body = await request.json().catch(() => ({ recipientScope: "ALL", recipientAdminUserIds: [], body: "" }));
    const recipientScope = body.recipientScope === "SELECTED" ? "SELECTED" : "ALL";
    const recipientAdminUserIds =
      recipientScope === "SELECTED"
        ? ([...new Set(Array.isArray(body.recipientAdminUserIds) ? body.recipientAdminUserIds.filter((value: unknown): value is string => typeof value === "string" && value.trim().length > 0) : [])] as string[])
        : [];
    const messageBody = typeof body.body === "string" ? body.body.trim() : "";

    if (!messageBody) {
      return Response.json({ error: { code: "INVALID_INPUT", message: "메시지 내용을 입력해 주세요." } }, { status: 400 });
    }

    if (recipientScope === "SELECTED" && recipientAdminUserIds.length === 0) {
      return Response.json({ error: { code: "INVALID_INPUT", message: "선택 발송 대상을 하나 이상 골라 주세요." } }, { status: 400 });
    }

    return json(
      await createDevAdminMessage({
        senderAdminUserId: currentAdmin.adminUserId,
        senderName: currentAdmin.adminName,
        recipientScope,
        recipientAdminUserIds,
        body: messageBody
      }),
      201
    );
  }

  if (request.method === "POST" && pathSegments.length === 3 && pathSegments[2] === "read") {
    const result = await readDevAdminMessage(currentAdmin.adminUserId, pathSegments[1]);
    if (!result) {
      return Response.json({ error: { code: "NOT_FOUND", message: "메시지를 찾을 수 없습니다." } }, { status: 404 });
    }
    return json(result);
  }

  return Response.json({ error: { code: "NOT_FOUND", message: `Admin message route not found: ${request.method} ${pathSegments.join("/")}` } }, { status: 404 });
}

function shouldUseAdminMock() {
  return process.env.NODE_ENV !== "production" && process.env.ADMIN_MOCK_ENABLED === "true";
}

async function dispatch(request: Request, context: RouteContext) {
  const params = await context.params;
  const pathSegments = params.path ?? [];

  if (pathSegments[0] === "messages") {
    return dispatchDevMessages(request, pathSegments);
  }

  if (shouldUseAdminMock()) {
    return handleAdminMockRequest(request, pathSegments);
  }

  const adminServiceUrl = process.env.ADMIN_SERVICE_URL ?? "http://localhost:8085";
  const sourceUrl = new URL(request.url);
  const targetUrl = new URL(`/api/v1/admin/${pathSegments.join("/")}${sourceUrl.search}`, adminServiceUrl);
  const headers = new Headers();
  for (const headerName of FORWARDED_REQUEST_HEADERS) {
    const headerValue = request.headers.get(headerName);
    if (headerValue) {
      headers.set(headerName, headerValue);
    }
  }

  return fetch(targetUrl, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
    cache: "no-store"
  });
}

export async function GET(request: Request, context: RouteContext) {
  return dispatch(request, context);
}

export async function POST(request: Request, context: RouteContext) {
  return dispatch(request, context);
}

export async function PATCH(request: Request, context: RouteContext) {
  return dispatch(request, context);
}

export async function DELETE(request: Request, context: RouteContext) {
  return dispatch(request, context);
}
