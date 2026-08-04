import createClient from "openapi-fetch"
import type { paths, components } from "./schema"

const API_BASE = "https://caad-erp.fastapicloud.dev"

export const api = createClient<paths>({ baseUrl: API_BASE })
export type Schemas = components["schemas"]
