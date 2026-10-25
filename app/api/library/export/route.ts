import { NextRequest, NextResponse } from 'next/server';
import { readLibrary } from '../../../../lib/library/server';
import { csv, exportBackup } from '../../../../lib/library/model';
import { failure, privateHeaders } from '../../../../lib/library/http';
export async function GET(request: NextRequest) {
  try {
    const { state } = await readLibrary(true);
    const isCsv = request.nextUrl.searchParams.get('format') === 'csv';
    return new NextResponse(isCsv ? csv(state) : JSON.stringify(exportBackup(state), null, 2), {
      headers: { ...privateHeaders, 'Content-Type': isCsv ? 'text/csv; charset=utf-8' : 'application/json', 'Content-Disposition': `attachment; filename="media-library-${new Date().toISOString().slice(0, 10)}.${isCsv ? 'csv' : 'json'}"` },
    });
  } catch (error) { return failure(error); }
}
