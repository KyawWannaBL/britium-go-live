import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isRequestSafe } from '@/utils/security';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// 1. Initialize the Rate Limiter
// Strict sliding window: 5 requests per minute per IP
const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, '1 m'),
  analytics: true,
});

export async function middleware(request: NextRequest) {
  const isStateMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method);
  const isRecoveryRoute = request.nextUrl.pathname.startsWith('/api/recovery');

  // 2. Execute Rate Limiter (Only for password recovery POST requests)
  if (isRecoveryRoute && isStateMutating) {
    // request.ip is populated by Vercel in production
    const ip = request.ip ?? '127.0.0.1'; 
    
    // Use a distinct prefix in Redis to prevent key collisions
    const { success, limit, remaining, reset } = await ratelimit.limit(`ratelimit_recovery_${ip}`);

    if (!success) {
      console.warn(`[Rate Limit Exceeded] IP: ${ip}, URL: ${request.url}`);
      return NextResponse.json(
        { error: 'Too many requests. Please try again in a minute.' },
        { 
          status: 429, 
          headers: {
            'X-RateLimit-Limit': limit.toString(),
            'X-RateLimit-Remaining': remaining.toString(),
            'X-RateLimit-Reset': reset.toString(),
          } 
        }
      );
    }
  }

  // 3. Execute CSRF Protection (For ALL mutating requests)
  if (isStateMutating) {
    if (!isRequestSafe(request)) {
      return NextResponse.json(
        { error: 'Forbidden: Security policy blocked this request.' },
        { status: 403 }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/api/:path*', // Protects all API routes
  ],
};