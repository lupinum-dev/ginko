// POST /upload?ticket=<ticket>&name=<file name> (SPEC 4.3). The body is the file, its Content-Type
// says what kind it is. Order: ticket (used up, names member and site), type, size, content
// signature, then store and register for exactly that member and site. Every refusal happens before
// the file is stored; a failed register deletes the stored file at once.
import type { HttpRouter } from 'convex/server'
import { internal } from '../_generated/api'
import { httpAction, type ActionCtx } from '../_generated/server'
import { kindOf, TOO_LARGE, WRONG_CONTENT, WRONG_TYPE } from '../lib/files'

/** The platform origin that may call this route from the browser (CORS). */
const PLATFORM_ORIGIN = process.env.GINKO_PLATFORM_ORIGIN ?? 'http://localhost:3100'

function headersFor(request: Request): Record<string, string> {
  if (request.headers.get('Origin') !== PLATFORM_ORIGIN) return {}
  return {
    'Access-Control-Allow-Origin': PLATFORM_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  }
}

/** Answers with the upload id, or with `{ code, message }` (SPEC 11). */
function reply(request: Request, status: number, body: { upload: string } | { code: string; message: string }) {
  return Response.json(body, { status, headers: headersFor(request) })
}

async function receive(ctx: ActionCtx, request: Request): Promise<Response> {
  const url = new URL(request.url)
  const owner = await ctx.runMutation(internal.uploads.redeem, { ticket: url.searchParams.get('ticket') ?? '' })
  if (!owner) return reply(request, 403, { code: 'FORBIDDEN', message: 'Der Upload ist abgelaufen. Bitte wähle die Datei noch einmal.' })

  const kind = kindOf(request.headers.get('Content-Type') ?? '')
  if (!kind) return reply(request, 415, { code: 'UPLOAD_REJECTED', message: WRONG_TYPE })
  const declared = request.headers.get('Content-Length')
  if (declared !== null && Number(declared) > kind.limit) return reply(request, 413, { code: 'UPLOAD_REJECTED', message: TOO_LARGE })
  const bytes = new Uint8Array(await request.arrayBuffer())
  if (bytes.byteLength > kind.limit) return reply(request, 413, { code: 'UPLOAD_REJECTED', message: TOO_LARGE })
  if (!kind.signature(bytes)) return reply(request, 415, { code: 'UPLOAD_REJECTED', message: WRONG_CONTENT })

  const storageId = await ctx.storage.store(new Blob([bytes], { type: kind.mime }))
  try {
    const upload = await ctx.runMutation(internal.uploads.register, {
      site: owner.site, uploader: owner.user, storageId, name: url.searchParams.get('name') ?? '', size: bytes.byteLength, mime: kind.mime,
      ...(owner.folder ? { folder: owner.folder } : {}), ...(owner.library ? { library: true } : {}),
    })
    return reply(request, 200, { upload })
  } catch (error) {
    await ctx.storage.delete(storageId)
    const data = (error as { data?: { code?: string; message?: string } }).data
    if (data?.code && data.message) return reply(request, 400, { code: data.code, message: data.message })
    throw error
  }
}

export const upload = httpAction(async (ctx, request) => {
  try {
    return await receive(ctx, request)
  } catch {
    return reply(request, 500, { code: 'INVALID', message: 'Der Upload ist fehlgeschlagen. Bitte versuche es noch einmal.' })
  }
})

const preflight = httpAction(async (_ctx, request) => new Response(null, { status: 204, headers: headersFor(request) }))

export function register(http: HttpRouter) {
  http.route({ path: '/upload', method: 'POST', handler: upload })
  http.route({ path: '/upload', method: 'OPTIONS', handler: preflight })
}
