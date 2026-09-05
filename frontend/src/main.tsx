import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createBrowserRouter, RouterProvider } from "react-router-dom"
import { trpc, trpcClient } from "@/utils/trpc"
import { HomePage } from "@/features/home"
import { POSFlow } from "@/features/pos"
import { CustomerDisplayPage } from "@/features/pos/pages/CustomerDisplayPage"
import { salesmenQueryOptions } from "@/hooks/queries/useSalesmen"
import { productsQueryOptions } from "@/hooks/queries/useProducts"
import { stockQueryOptions } from "@/hooks/queries/useStock"
import { GlobalError } from "@/components/GlobalError"
import { MantineProvider } from "@mantine/core"
import { AppConfigProvider } from "@/config"
import { SalesmenManagementPage } from "@/features/salesmen"
import { ProductsManagementPage } from "@/features/products"
import { StockFlow } from "@/features/stock"
import { SettingsPage } from "@/features/settings"
import "@mantine/core/styles.css"

const queryClient = new QueryClient()


const router = createBrowserRouter([
    {
        path: "/",
        element: <HomePage />,
        errorElement: <GlobalError />,
    },
    {
        path: "/pos",
        element: <POSFlow />,
        loader: async () => {
            await Promise.all([
                queryClient.ensureQueryData(salesmenQueryOptions()),
                queryClient.ensureQueryData(productsQueryOptions()),
                queryClient.ensureQueryData(stockQueryOptions()),
            ])
            return null
        },
        errorElement: <GlobalError />,
    },
    {
        path: "/customer",
        element: <CustomerDisplayPage />,
        loader: async () => {
            await Promise.all([
                queryClient.ensureQueryData(salesmenQueryOptions()),
                queryClient.ensureQueryData(productsQueryOptions()),
                queryClient.ensureQueryData(stockQueryOptions()),
            ])
            return null
        },
        errorElement: <GlobalError />,
    },
    {
        path: "/salesmen",
        element: <SalesmenManagementPage />,
        loader: async () => {
            await queryClient.ensureQueryData(salesmenQueryOptions())
            return null
        },
        errorElement: <GlobalError />,
    },
    {
        path: "/products",
        element: <ProductsManagementPage />,
        loader: async () => {
            await Promise.all([
                queryClient.ensureQueryData(productsQueryOptions()),
                queryClient.ensureQueryData(stockQueryOptions()),
            ])
            return null
        },
        errorElement: <GlobalError />,
    },
    {
        path: "/stock",
        element: <StockFlow />,
        loader: async () => {
            await Promise.all([
                queryClient.ensureQueryData(salesmenQueryOptions()),
                queryClient.ensureQueryData(productsQueryOptions()),
                queryClient.ensureQueryData(stockQueryOptions()),
            ])
            return null
        },
        errorElement: <GlobalError />,
    },
    {
        path: "/settings",
        element: <SettingsPage />,
        errorElement: <GlobalError />,
    },
])

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <AppConfigProvider>
            <trpc.Provider client={trpcClient} queryClient={queryClient}>
                <QueryClientProvider client={queryClient}>
                    <MantineProvider>
                        <RouterProvider router={router} />
                    </MantineProvider>
                </QueryClientProvider>
            </trpc.Provider>
        </AppConfigProvider>
    </StrictMode>,
)
