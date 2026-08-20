import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@backend/src/trpc/index.js"

export type RouterOutputs = inferRouterOutputs<AppRouter>
export type RouterInputs = inferRouterInputs<AppRouter>

type NonVoid<T> = Exclude<T, void>

// Products
export type Product = RouterOutputs["products"]["list"][number]
export type ProductCreateRequest = NonVoid<RouterInputs["products"]["add"]>
export type ProductUpdateRequest = NonVoid<RouterInputs["products"]["update"]>["data"]

// Salespeople
export type Salesman = RouterOutputs["salesmen"]["list"][number]
export type SalesmanCreateRequest = NonVoid<RouterInputs["salesmen"]["add"]>
export type SalesmanUpdateRequest = NonVoid<RouterInputs["salesmen"]["update"]>["data"]

// Reports
export type Stock = RouterOutputs["reports"]["inventory"]

// Transactions
export type PaymentType = NonVoid<RouterInputs["transactions"]["recordSale"]>["paymentType"]
export type SaleRequest = NonVoid<RouterInputs["transactions"]["recordSale"]>
export type RestockRequest = NonVoid<RouterInputs["transactions"]["recordRestock"]>
export type WriteOffRequest = NonVoid<RouterInputs["transactions"]["recordWriteOff"]>
