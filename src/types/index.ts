import type { Schemas } from "../api/apiClient"

export type Product = Schemas["ProductResponse"]
export type Products = Product[]

export type Stock = Record<string, number>
export type PaymentType = Schemas["PaymentType"]
export type SaleRequest = Schemas["SaleRequest"]
export type SalesRequests = SaleRequest[]

export type Salesman = Schemas["SalesmanResponse"]
export type Salesmen = Salesman[]
export type SalesmanCreateRequest = Schemas["SalesmanCreateRequest"]
export type SalesmanUpdateRequest = Schemas["SalesmanUpdateRequest"]
