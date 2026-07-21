import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { POSFlow } from "./features/pos/"
import { salesmenQueryOptions } from "@/hooks/queries/useSalesmen"
import { productsQueryOptions } from "@/hooks/queries/useProducts"
import { stockQueryOptions } from "@/hooks/queries/useStock"
import { GlobalError } from "./components/GlobalError.tsx"
import '@mantine/core/styles.css'
import { MantineProvider } from '@mantine/core'
import { SalesmenManagementPage } from "./features/salesmen/"

const queryClient = new QueryClient()

const router = createBrowserRouter([
    {
        path: "/",
        element: <POSFlow />,
        loader: async () => {
            await Promise.all([
                queryClient.ensureQueryData(salesmenQueryOptions()),
                queryClient.ensureQueryData(productsQueryOptions()),
                queryClient.ensureQueryData(stockQueryOptions())
            ])
            return null
        },
        errorElement: <GlobalError />
    },
    {
        path: "/salesmen",
        element: <SalesmenManagementPage />,
        loader: async () => {
            await queryClient.ensureQueryData(salesmenQueryOptions())
            return null
        },
        errorElement: <GlobalError />
    }
])

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            <MantineProvider>
                <RouterProvider router={router} />
            </MantineProvider>
        </QueryClientProvider>
    </StrictMode>,
)
