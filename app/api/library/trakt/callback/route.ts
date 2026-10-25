import { NextRequest } from 'next/server';
import { finishTrakt } from '../../../../../lib/library/trakt';
import { failure } from '../../../../../lib/library/http';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(request: NextRequest) { try { return await finishTrakt(request); } catch (error) { return failure(error); } }
