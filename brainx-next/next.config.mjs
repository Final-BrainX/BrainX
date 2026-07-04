import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = dirname(fileURLToPath(import.meta.url));
const apiServerUrl = process.env.API_SERVER_URL ?? "http://localhost:8088";
const userApiBaseUrl = process.env.USER_SERVICE_URL ?? "http://localhost:8080";
const mcpApiBaseUrl = process.env.MCP_SERVICE_URL ?? "http://localhost:8087";
const intelligenceApiBaseUrl = process.env.INTELLIGENCE_API_BASE_URL ?? "http://localhost:8086";
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
        source: "/api/v1/ai/:path*",
        destination: `${intelligenceApiBaseUrl}/api/v1/ai/:path*`,
      },
      {
        source: "/api/v1/intelligence/:path*",
        destination: `${intelligenceApiBaseUrl}/api/v1/intelligence/:path*`,
      },
      {
        source: "/api/v1/notes/:noteId/summary",
        destination: `${intelligenceApiBaseUrl}/api/v1/notes/:noteId/summary`,
      },
      {
        source: "/api/v1/users/me/style-profile",
        destination: `${intelligenceApiBaseUrl}/api/v1/users/me/style-profile`,
      },
      {
        source: "/api/v1/:path*",
        destination: `${apiServerUrl}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
