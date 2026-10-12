// '#ginko/schema' as the module's build writes it: the restaurant config, serialized.
import { serializeSchema } from '../../src/index.ts'
import restaurant from '../../../../sites/restaurant/ginko.config.ts'

export default serializeSchema(restaurant)
