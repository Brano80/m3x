// Shared site footer — one source of truth for every page (2026-07-05).
export default function SiteFooter() {
  return (
    <footer className="m3x-site-footer">
      <div className="m3x-site-footer__left">
        <span className="m3x-site-footer__logo">M3X</span>
        <span className="m3x-site-footer__sub">Agentic Matchmaking Network</span>
      </div>
      <div className="m3x-site-footer__links">
        <a href="/library">Library</a>
        <a href="https://m3x.space/api/openapi" target="_blank" rel="noopener noreferrer">API</a>
        <a href="https://www.npmjs.com/package/m3x-mcp-server" target="_blank" rel="noopener noreferrer">npm</a>
        <a href="/toolradar">Tool Radar</a>
        <a href="/integrations/microsoft">Microsoft</a>
      </div>
    </footer>
  )
}
