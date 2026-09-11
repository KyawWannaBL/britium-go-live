export function isRequestSafe(req: Request): boolean {
  const secFetchSite = req.headers.get('sec-fetch-site');
  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');
  
  // Update this to match your production domain. 
  // You might want to check process.env.NODE_ENV === 'development' to allow localhost during dev.
  const allowedHost = 'www.britiumexpress.com'; 

  // 1. Modern Browsers: Fetch Metadata validation
  if (secFetchSite) {
    // Allow if it explicitly comes from your domain or a subdomain
    if (secFetchSite === 'same-origin' || secFetchSite === 'same-site') {
      return true;
    }
    // Explicitly block if the browser reports it's from a completely different site
    if (secFetchSite === 'cross-site') {
      return false;
    }
  }

  // 2. Legacy Fallback: Traditional Origin / Referer validation
  if (origin) {
    try {
      if (new URL(origin).hostname === allowedHost) return true;
    } catch (e) { /* Ignore invalid URLs */ }
  }
  
  if (referer) {
    try {
      if (new URL(referer).hostname === allowedHost) return true;
    } catch (e) { /* Ignore invalid URLs */ }
  }

  // 3. Final Catch: If headers are missing, stripped, or "null", deny the request.
  console.warn(`[CSRF Block] Origin: ${origin}, SecFetchSite: ${secFetchSite}, URL: ${req.url}`);
  return false;
}