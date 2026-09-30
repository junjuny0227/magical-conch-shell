import { handleConchAnswer } from '@/features/ask-conch/index.server';

export const runtime = 'nodejs';
export const POST = (request: Request) => handleConchAnswer(request);
