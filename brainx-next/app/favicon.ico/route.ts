const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="16" fill="#111827"/>
  <path d="M19 34c0-9 6-16 15-16 7 0 12 5 12 12 0 8-6 14-14 14H19V34Z" fill="#8b5cf6"/>
  <path d="M24 31c0-5 4-9 9-9s9 4 9 9-4 9-9 9h-9v-9Z" fill="#22d3ee"/>
  <circle cx="33" cy="31" r="4" fill="#111827"/>
</svg>`;

export function GET() {
  return new Response(favicon, {
    headers: {
      "Cache-Control": "public, max-age=86400",
      "Content-Type": "image/svg+xml"
    }
  });
}
