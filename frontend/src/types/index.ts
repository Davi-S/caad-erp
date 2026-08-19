import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@backend/src/trpc/index.js"

type RouterOutputs = inferRouterOutputs<AppRouter>
type RouterInputs = inferRouterInputs<AppRouter>

type NonVoid<T> = Exclude<T, void>

export type Product = RouterOutputs["products"]["list"][number]
export type Products = Product[]
export type ProductCreateRequest = NonVoid<RouterInputs["products"]["add"]>
export type ProductUpdateRequest = NonVoid<RouterInputs["products"]["update"]>["data"]

export type Stock = RouterOutputs["reports"]["inventory"]
export type PaymentType = NonVoid<RouterInputs["transactions"]["recordSale"]>["paymentType"]
export type SaleRequest = NonVoid<RouterInputs["transactions"]["recordSale"]>
export type SalesRequests = SaleRequest[]
export type RestockRequest = NonVoid<RouterInputs["transactions"]["recordRestock"]>
export type WriteOffRequest = NonVoid<RouterInputs["transactions"]["recordWriteOff"]>

export type Salesman = RouterOutputs["salesmen"]["list"][number]
export type Salesmen = Salesman[]
export type SalesmanCreateRequest = NonVoid<RouterInputs["salesmen"]["add"]>
export type SalesmanUpdateRequest = NonVoid<RouterInputs["salesmen"]["update"]>["data"]
