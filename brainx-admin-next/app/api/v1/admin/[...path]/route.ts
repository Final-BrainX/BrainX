import { handleAdminMockRequest } from "@/lib/admin-mock";

type RouteContext = {
  params: Promise<{
    path?: string[];
  }>;
};

async function dispatch(request: Request, context: RouteContext) {
  const params = await context.params;
  const mockEnabled = process.env.ADMIN_MOCK_ENABLED === "true";
  const adminServiceUrl = process.env.ADMIN_SERVICE_URL ?? "http://localhost:8085";
  const pathSegments = params.path ?? [];

  const proxyToAdminService = async () => {
    const sourceUrl = new URL(request.url);
    const targetUrl = new URL(`/api/v1/admin/${pathSegments.join("/")}${sourceUrl.search}`, adminServiceUrl);
    return fetch(targetUrl, {
      method: request.method,
      headers: request.headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.text(),
      cache: "no-store"
    });
  };

  try {
    return await proxyToAdminService();
  } catch (error) {
    if (!mockEnabled) {
      throw error;
    }
  }

  return handleAdminMockRequest(request, pathSegments);
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
