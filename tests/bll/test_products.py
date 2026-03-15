from decimal import Decimal
from pathlib import Path

import pytest
from openpyxl.workbook import Workbook

from caad_erp import constants, dal
from caad_erp.bll import products, runtime
from caad_erp.exceptions import BusinessRuleViolation, MissingReferenceError
from caad_erp.settings import AppSettings


def _make_context(workbook: Workbook) -> runtime.RuntimeContext:
    settings = AppSettings(
        data_file=Path("/tmp/data.xlsx"),
        lounge_name="Test Lounge",
        schema_version=constants.EXPECTED_SCHEMA_VERSION,
        default_salesman_id="S001",
    )
    return runtime.RuntimeContext(settings=settings, workbook=workbook)


def _seed_product(
    workbook: Workbook,
    product_id: str,
    product_name: str = "Product",
    sell_price: Decimal = Decimal("5.00"),
    is_active: bool = True,
) -> dal.ProductRow:
    row = dal.ProductRow(
        product_id=product_id,
        product_name=product_name,
        sell_price=sell_price,
        is_active=is_active,
    )
    dal.append_product(workbook, row)
    return row


def test_ensure_products_cache_populates_missing_cache(products_workbook: Workbook) -> None:
    """
    GIVEN a runtime context with an empty products cache bucket
    WHEN _ensure_products_cache is called
    THEN all active and by_id structures are populated from DAL iteration
    """
    # Arrange
    context = _make_context(products_workbook)
    _seed_product(products_workbook, "P001", is_active=True)
    _seed_product(products_workbook, "P002", is_active=False)

    # Act
    bucket = products._ensure_products_cache(context)

    # Assert
    assert len(bucket["all"]) == 2
    assert len(bucket["active"]) == 1
    assert bucket["active"][0].product_id == "P001"
    assert set(bucket["by_id"].keys()) == {"P001", "P002"}


def test_ensure_products_cache_reuses_existing_cache(products_workbook: Workbook) -> None:
    """
    GIVEN a runtime context with a pre-populated products cache bucket
    WHEN _ensure_products_cache is called
    THEN the existing cached structures are reused without re-iterating DAL
    """
    # Arrange
    context = _make_context(products_workbook)
    _seed_product(products_workbook, "P001")
    first_bucket = products._ensure_products_cache(context)

    # Mutate workbook after cache population to prove cache reuse
    _seed_product(products_workbook, "P002")

    # Act
    second_bucket = products._ensure_products_cache(context)

    # Assert
    assert second_bucket is first_bucket
    assert len(second_bucket["all"]) == 1
    assert "P002" not in second_bucket["by_id"]


@pytest.mark.parametrize("include_inactive", [False, True])
def test_list_products_returns_expected_subset(
    products_workbook: Workbook,
    include_inactive: bool,
) -> None:
    """
    GIVEN a cached products bucket with active and inactive records
    WHEN list_products is called
    THEN it returns records matching the include_inactive filter
    """
    # Arrange
    context = _make_context(products_workbook)
    _seed_product(products_workbook, "P001", is_active=True)
    _seed_product(products_workbook, "P002", is_active=False)

    # Act
    result = products.list_products(context, include_inactive=include_inactive)

    # Assert
    if include_inactive:
        assert [row.product_id for row in result] == ["P001", "P002"]
    else:
        assert [row.product_id for row in result] == ["P001"]


def test_list_products_returns_copy_not_original_reference(products_workbook: Workbook) -> None:
    """
    GIVEN cached product collections
    WHEN list_products is called
    THEN a list copy is returned so callers cannot mutate cache internals
    """
    # Arrange
    context = _make_context(products_workbook)
    _seed_product(products_workbook, "P001")

    # Act
    result = products.list_products(context, include_inactive=True)

    # Assert
    assert result is not context._cache["products"]["all"]


def test_get_product_returns_matching_row(products_workbook: Workbook) -> None:
    """
    GIVEN a cached by_id map containing a requested product id
    WHEN get_product is called
    THEN the corresponding ProductRow is returned
    """
    # Arrange
    context = _make_context(products_workbook)
    expected = _seed_product(products_workbook, "P001", product_name="Candy")

    # Act
    result = products.get_product(context, "P001")

    # Assert
    assert result == expected


def test_get_product_raises_missing_reference_for_unknown_id(products_workbook: Workbook) -> None:
    """
    GIVEN a cached by_id map without the requested product id
    WHEN get_product is called
    THEN MissingReferenceError is raised
    """
    # Arrange
    context = _make_context(products_workbook)
    _seed_product(products_workbook, "P001")

    # Act / Assert
    with pytest.raises(MissingReferenceError):
        products.get_product(context, "UNKNOWN")


def test_update_product_returns_updated_record_on_success(products_workbook: Workbook) -> None:
    """
    GIVEN a valid update command targeting an existing product
    WHEN update_product is called
    THEN DAL update executes cache is invalidated and updated row is returned
    """
    # Arrange
    context = _make_context(products_workbook)
    _seed_product(products_workbook, "P001", product_name="Old",
                  sell_price=Decimal("2.00"))
    products.list_products(context, include_inactive=True)  # populate cache
    command = products.ProductCommand(
        product_id="P001",
        product_name="Updated",
        sell_price=Decimal("9.00"),
    )

    # Act
    updated = products.update_product(context, command)

    # Assert
    assert updated.product_id == "P001"
    assert updated.product_name == "Updated"
    assert updated.sell_price == Decimal("9.00")
    # Cache should have been invalidated and repopulated with fresh values
    assert products.get_product(context, "P001").product_name == "Updated"


def test_update_product_trims_product_id_and_name_before_persisting(
    products_workbook: Workbook,
) -> None:
    """
    GIVEN an update command with surrounding whitespace in product id and name
    WHEN update_product is called
    THEN normalized trimmed values are used for lookup and persistence
    """
    # Arrange
    context = _make_context(products_workbook)
    _seed_product(products_workbook, "P001", product_name="Old")
    command = products.ProductCommand(
        product_id="  P001  ", product_name="  New Name  ")

    # Act
    result = products.update_product(context, command)

    # Assert
    assert result.product_id == "P001"
    assert result.product_name == "New Name"


def test_update_product_rejects_blank_product_id(products_workbook: Workbook) -> None:
    """
    GIVEN an update command with blank product id
    WHEN update_product is called
    THEN ValueError is raised
    """
    # Arrange
    context = _make_context(products_workbook)
    command = products.ProductCommand(product_id="   ", product_name="Name")

    # Act / Assert
    with pytest.raises(ValueError):
        products.update_product(context, command)


def test_update_product_rejects_blank_product_name(products_workbook: Workbook) -> None:
    """
    GIVEN an update command with product_name provided as blank text
    WHEN update_product is called
    THEN ValueError is raised
    """
    # Arrange
    context = _make_context(products_workbook)
    _seed_product(products_workbook, "P001")
    command = products.ProductCommand(product_id="P001", product_name="   ")

    # Act / Assert
    with pytest.raises(ValueError):
        products.update_product(context, command)


@pytest.mark.parametrize("sell_price", [Decimal("-0.01"), Decimal("-1.00"), Decimal("-100")])
def test_update_product_rejects_negative_sell_price(
    products_workbook: Workbook,
    sell_price: Decimal,
) -> None:
    """
    GIVEN an update command with negative sell_price
    WHEN update_product is called
    THEN ValueError is raised
    """
    # Arrange
    context = _make_context(products_workbook)
    _seed_product(products_workbook, "P001")
    command = products.ProductCommand(product_id="P001", sell_price=sell_price)

    # Act / Assert
    with pytest.raises(ValueError):
        products.update_product(context, command)


def test_update_product_requires_at_least_one_field(products_workbook: Workbook) -> None:
    """
    GIVEN an update command with only product id and no mutable fields
    WHEN update_product is called
    THEN ValueError is raised
    """
    # Arrange
    context = _make_context(products_workbook)
    _seed_product(products_workbook, "P001")

    # Act / Assert
    with pytest.raises(ValueError):
        products.update_product(
            context, products.ProductCommand(product_id="P001"))


def test_update_product_maps_dal_key_error_to_missing_reference(
    products_workbook: Workbook,
) -> None:
    """
    GIVEN DAL update_product raises KeyError for an unknown product
    WHEN update_product is called
    THEN MissingReferenceError is raised
    """
    # Arrange
    context = _make_context(products_workbook)
    command = products.ProductCommand(
        product_id="P999", product_name="New Name")

    # Act / Assert
    with pytest.raises(MissingReferenceError):
        products.update_product(context, command)


def test_update_product_accepts_zero_sell_price(products_workbook: Workbook) -> None:
    """
    GIVEN an update command with sell_price equal to zero
    WHEN update_product is called
    THEN update succeeds without monetary validation errors
    """
    # Arrange
    context = _make_context(products_workbook)
    _seed_product(products_workbook, "P001", sell_price=Decimal("1.00"))

    # Act
    updated = products.update_product(
        context,
        products.ProductCommand(product_id="P001", sell_price=Decimal("0")),
    )

    # Assert
    assert updated.sell_price == Decimal("0")


def test_add_product_returns_record_on_success(products_workbook: Workbook) -> None:
    """
    GIVEN a valid creation command for a new unique product
    WHEN add_product is called
    THEN a ProductRow is appended cache invalidated and the record returned
    """
    # Arrange
    context = _make_context(products_workbook)
    command = products.ProductCommand(
        product_id="P001",
        product_name="Widget",
        sell_price=Decimal("3.50"),
        is_active=True,
    )

    # Act
    result = products.add_product(context, command)

    # Assert
    assert result.product_id == "P001"
    assert result.product_name == "Widget"
    assert result.sell_price == Decimal("3.50")
    assert result.is_active is True
    assert products.get_product(context, "P001").product_name == "Widget"


def test_add_product_trims_product_id_and_name_before_persisting(
    products_workbook: Workbook,
) -> None:
    """
    GIVEN a creation command with surrounding whitespace in product id and name
    WHEN add_product is called
    THEN normalized trimmed values are persisted
    """
    # Arrange
    context = _make_context(products_workbook)

    # Act
    result = products.add_product(
        context,
        products.ProductCommand(
            product_id="  P001  ",
            product_name="  Widget  ",
            sell_price=Decimal("3.50"),
            is_active=True,
        ),
    )

    # Assert
    assert result.product_id == "P001"
    assert result.product_name == "Widget"


def test_add_product_rejects_blank_product_id(products_workbook: Workbook) -> None:
    """
    GIVEN a creation command with blank product id
    WHEN add_product is called
    THEN ValueError is raised
    """
    # Arrange
    context = _make_context(products_workbook)

    # Act / Assert
    with pytest.raises(ValueError):
        products.add_product(
            context,
            products.ProductCommand(
                product_id="   ",
                product_name="Widget",
                sell_price=Decimal("3.50"),
                is_active=True,
            ),
        )


@pytest.mark.parametrize("product_name", [None, "", "   "])
def test_add_product_requires_nonblank_product_name(
    products_workbook: Workbook,
    product_name,
) -> None:
    """
    GIVEN a creation command with missing or blank product_name
    WHEN add_product is called
    THEN ValueError is raised
    """
    # Arrange
    context = _make_context(products_workbook)

    # Act / Assert
    with pytest.raises(ValueError):
        products.add_product(
            context,
            products.ProductCommand(
                product_id="P001",
                product_name=product_name,
                sell_price=Decimal("3.50"),
                is_active=True,
            ),
        )


def test_add_product_requires_sell_price(products_workbook: Workbook) -> None:
    """
    GIVEN a creation command with sell_price missing
    WHEN add_product is called
    THEN ValueError is raised
    """
    # Arrange
    context = _make_context(products_workbook)

    # Act / Assert
    with pytest.raises(ValueError):
        products.add_product(
            context,
            products.ProductCommand(
                product_id="P001",
                product_name="Widget",
                sell_price=None,
                is_active=True,
            ),
        )


@pytest.mark.parametrize("sell_price", [Decimal("-0.01"), Decimal("-1.00"), Decimal("-50")])
def test_add_product_rejects_negative_sell_price(
    products_workbook: Workbook,
    sell_price: Decimal,
) -> None:
    """
    GIVEN a creation command with negative sell_price
    WHEN add_product is called
    THEN ValueError is raised
    """
    # Arrange
    context = _make_context(products_workbook)

    # Act / Assert
    with pytest.raises(ValueError):
        products.add_product(
            context,
            products.ProductCommand(
                product_id="P001",
                product_name="Widget",
                sell_price=sell_price,
                is_active=True,
            ),
        )


def test_add_product_requires_is_active(products_workbook: Workbook) -> None:
    """
    GIVEN a creation command with is_active omitted
    WHEN add_product is called
    THEN ValueError is raised
    """
    # Arrange
    context = _make_context(products_workbook)

    # Act / Assert
    with pytest.raises(ValueError):
        products.add_product(
            context,
            products.ProductCommand(
                product_id="P001",
                product_name="Widget",
                sell_price=Decimal("3.50"),
                is_active=None,
            ),
        )


def test_add_product_rejects_duplicate_product_id(products_workbook: Workbook) -> None:
    """
    GIVEN a creation command whose product id already exists in cache
    WHEN add_product is called
    THEN BusinessRuleViolation is raised
    """
    # Arrange
    context = _make_context(products_workbook)
    _seed_product(products_workbook, "P001")

    # Act / Assert
    with pytest.raises(BusinessRuleViolation):
        products.add_product(
            context,
            products.ProductCommand(
                product_id="P001",
                product_name="Duplicate",
                sell_price=Decimal("3.50"),
                is_active=True,
            ),
        )


def test_add_product_accepts_zero_sell_price(products_workbook: Workbook) -> None:
    """
    GIVEN a creation command with sell_price equal to zero
    WHEN add_product is called
    THEN product creation succeeds without monetary validation errors
    """
    # Arrange
    context = _make_context(products_workbook)

    # Act
    created = products.add_product(
        context,
        products.ProductCommand(
            product_id="P001",
            product_name="Free Item",
            sell_price=Decimal("0"),
            is_active=True,
        ),
    )

    # Assert
    assert created.sell_price == Decimal("0")
