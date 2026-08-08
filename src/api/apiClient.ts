import createClient from "openapi-fetch"
import type { paths, components } from "./schema"

const API_BASE = "http://127.0.0.1:8000"

export const api = createClient<paths>({ baseUrl: API_BASE })
export type Schemas = components["schemas"]
