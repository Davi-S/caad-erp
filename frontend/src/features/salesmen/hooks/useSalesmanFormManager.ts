import { useState } from "react"
import { useCreateSalesman, useUpdateSalesman } from "./useSalesmenMutations"
import type { Salesman, SalesmanCreateRequest, SalesmanUpdateRequest } from "@/types"

export function useSalesmanFormManager() {
    const [modalOpened, setModalOpened] = useState(false)
    const [editingSalesman, setEditingSalesman] = useState<Salesman | null>(null)

    const createMutation = useCreateSalesman()
    const updateMutation = useUpdateSalesman()

    const isSubmitting = createMutation.isPending || updateMutation.isPending
    const submitError = createMutation.isError
        ? createMutation.error.message
        : updateMutation.isError
          ? updateMutation.error.message
          : null

    const openCreateModal = () => {
        setEditingSalesman(null)
        createMutation.reset()
        updateMutation.reset()
        setModalOpened(true)
    }

    const openEditModal = (salesman: Salesman) => {
        setEditingSalesman(salesman)
        createMutation.reset()
        updateMutation.reset()
        setModalOpened(true)
    }

    const closeModal = () => setModalOpened(false)

    const handleCreate = (values: SalesmanCreateRequest) => {
        createMutation.mutate(values, { onSuccess: closeModal })
    }

    const handleUpdate = (id: string, values: SalesmanUpdateRequest) => {
        updateMutation.mutate({ id, input: values }, { onSuccess: closeModal })
    }

    return {
        modalOpened,
        editingSalesman,
        isSubmitting,
        submitError,
        openCreateModal,
        openEditModal,
        closeModal,
        handleCreate,
        handleUpdate,
    }
}
