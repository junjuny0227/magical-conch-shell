import { startLogin } from '@/features/auth/index.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = startLogin;
