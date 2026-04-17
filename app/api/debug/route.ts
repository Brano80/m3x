import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { isByokConfigured } from '@/lib/crypto'

// Admin-only infra diagnostic. Gated behind DEBUG_SECRET (Bearer token).
// If DEBUG_SECRET is unset, the endpoint is disabled entirely so misconfigured
// deploys cannot accidentally leak infra presence signals.

f