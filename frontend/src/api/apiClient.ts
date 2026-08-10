import createClient from "openapi-fetch"
import type { paths, components } from "./schema"

const API_BASE = import.meta.env.VITE_API_BASE ?? ""

export const api = createClient<paths>({ baseUrl: API_BASE })
export type Schemas = components["schemas"]
