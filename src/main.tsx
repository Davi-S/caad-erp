import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { POSFlow } from "./features/pos/"
import { salesmenQueryOptions } from "@/hooks/queries/useSalesmen"
import { productsQueryOptions } from "@/hooks/queries/useProducts"
import { stockQueryOptions } from "@/hooks/queries/useStock"
import { GlobalError } from "./components/GlobalError.tsx"


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
    }
])

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
        </QueryClientProvider>
    </StrictMode>,
)
