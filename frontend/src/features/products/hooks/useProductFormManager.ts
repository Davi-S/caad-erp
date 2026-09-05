import { useState } from "react"
import { useCreateProduct, useUpdateProduct } from "./useProductsMutations"
import type { Product, ProductCreateRequest, ProductUpdateRequest } from "@/types"

export function useProductFormManager() {
    const [modalOpened, setModalOpened] = useState(false)
    const [editingProduct, setEditingProduct] = useState<Product | null>(null)

    const createMutation = useCreateProduct()
    const updateMutation = useUpdateProduct()

    const isSubmitting = createMutation.isPending || updateMutation.isPending
    const submitError = createMutation.isError
        ? createMutation.error.message
        : updateMutation.isError
          ? updateMutation.error.message
          : null

    const openCreateModal = () => {
        setEditingProduct(null)
        createMutation.reset()
        updateMutation.reset()
        setModalOpened(true)
    }

    const openEditModal = (product: Product) => {
        setEditingProduct(product)
        createMutation.reset()
        updateMutation.reset()
        setModalOpened(true)
    }

    const closeModal = () => setModalOpened(false)

    const handleCreate = (values: ProductCreateRequest) => {
        createMutation.mutate(values, { onSuccess: closeModal })
    }

    const handleUpdate = (id: string, values: ProductUpdateRequest) => {
        updateMutation.mutate({ id, input: values }, { onSuccess: closeModal })
    }

    return {
        modalOpened,
        editingProduct,
        isSubmitting,
        submitError,
        openCreateModal,
        openEditModal,
        closeModal,
        handleCreate,
        handleUpdate,
    }
}
