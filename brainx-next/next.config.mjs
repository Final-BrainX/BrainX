import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = dirname(fileURLToPath(import.meta.url));
const apiServerUrl = process.env.API_SERVER_URL ?? "http://localhost:8088";
const userApiBaseUrl = process.env.USER_SERVICE_URL ?? "http://localhost:8080";
const mcpApiBaseUrl = process.env.MCP_SERVICE_URL ?? "http://localhost:8087";
const isStandaloneBuild = process.env.BRAINX_NEXT_OUTPUT_MODE === "standalone";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: isStandaloneBuild ? "standalone" : undefined,
  turbopack: {
    root: projectDir,
  },
  async rewrites() {
    return [
      {
        source: "/oauth/token",
        destination: `${userApiBaseUrl}/oauth/token`,
      },
      {
        source: "/oauth/register",
        destination: `${userApiBaseUrl}/oauth/register`,
      },
      {
        source: "/.well-known/oauth-authorization-server",
        destination: `${userApiBaseUrl}/.well-known/oauth-authorization-server`,
      },
      {
        source: "/.well-known/openid-configuration",
        destination: `${userApiBaseUrl}/.well-known/openid-configuration`,
      },
      {
        source: "/.well-known/oauth-protected-resource",
        destination: `${mcpApiBaseUrl}/.well-known/oauth-protected-resource`,
      },
      {
        source: "/mcp/:path*",
        destination: `${mcpApiBaseUrl}/mcp/:path*`,
      },
      {
        // AI/게스트 관련 경로는 Gateway를 거쳐야 한다 — Gateway의
        // JwtAuthenticationGlobalFilter가 게스트 무토큰 요청에 X-Guest-Id를
        // 세팅해 주고(게스트 AI 10회 한도), /api/v1/ai/usage는 Gateway 라우트에서
        // Commerce-Service로 보내지기 때문에 Intelligence-Service로 직접 우회하면
        // 게스트 인증과 사용량 조회가 모두 깨진다.
        source: "/api/v1/:path*",
        destination: `${apiServerUrl}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
