import { handleConchUsage } from '@/features/ask-conch/index.server';

export const runtime = 'nodejs';
export const GET = (request: Request) => handleConchUsage(request);
