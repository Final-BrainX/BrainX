export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const INTELLIGENCE_API_BASE_URL = process.env.INTELLIGENCE_API_BASE_URL ?? "http://localhost:8086";
const FORWARDED_REQUEST_HEADERS = ["authorization", "content-type", "accept", "idempotency-key", "x-user-id"] as const;
const FORWARDED_RESPONSE_HEADERS = ["content-type", "cache-control"] as const;

type RouteContext = {
  params: Promise<{ path?: string[] }> | { path?: string[] };
};

export async function GET(request: Request, context: RouteContext) {
  return proxyIntelligenceRequest(request, context);
}

export async function POST(request: Request, context: RouteContext) {
  return proxyIntelligenceRequest(request, context);
}

export async function PUT(request: Request, context: RouteContext) {
  return proxyIntelligenceRequest(request, context);
}

export async function OPTIONS() {
  return new Response(null, { status: 204 });
}

async function proxyIntelligenceRequest(request: Request, context: RouteContext) {
  const { path = [] } = await context.params;
  const upstreamUrl = buildUpstreamUrl(request.url, path);
  const headers = forwardRequestHeaders(request.headers);
  const method = request.method.toUpperCase();

  const upstreamResponse = await fetch(upstreamUrl, {
    method,
    headers,
    body: method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer(),
    cache: "no-store",
  });

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: forwardResponseHeaders(upstreamResponse.headers),
  });
}

function buildUpstreamUrl(requestUrl: string, path: string[]) {
  const sourceUrl = new URL(requestUrl);
  const baseUrl = INTELLIGENCE_API_BASE_URL.replace(/\/+$/, "");
  const upstreamPath = path.map(encodeURIComponent).join("/");
  const upstreamUrl = new URL(`${baseUrl}/api/v1/${upstreamPath}`);
  upstreamUrl.search = sourceUrl.search;
  return upstreamUrl;
}

function forwardRequestHeaders(source: Headers) {
  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = source.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

function forwardResponseHeaders(source: Headers) {
  const headers = new Headers();
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = source.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}
