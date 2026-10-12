// The platform's HTTP surface. Each area registers its own routes; this file only composes.
import { httpRouter } from 'convex/server'
import { auth } from './auth'
import { register as bundle } from './routes/bundle'
import { register as exportSite } from './routes/export'
import { register as mcp } from './routes/mcp'
import { register as release } from './routes/release'
import { register as upload } from './routes/upload'

const http = httpRouter()
auth.registerRoutes(http) // /api/auth/* (SPEC 10, Better Auth)
bundle(http) // GET /bundle/<site> (SPEC 6)
release(http) // GET /release/state, POST /release (SPEC 5)
exportSite(http) // GET /export (SPEC 9, 12)
upload(http) // POST /upload with a one-time ticket (SPEC 4.3)
mcp(http) // POST /mcp, the agent door (SPEC 16)
export default http
