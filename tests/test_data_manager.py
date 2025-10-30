import os

from caad_erp import data_manager
import pytest

# The 'setup_test_environment' fixture is automatically injected
# by pytest because it's in conftest.py


def test_config_load(setup_test_environment):
    """Test that the reloaded config is the fake test config."""
    assert data_manager.CONFIG["System"]["LoungeName"] == "Test Lounge"
    assert data_manager.CONFIG["Defaults"]["DefaultSalesman"] == "S1"
    assert os.path.exists(data_manager.DATA_FILE)


def test_get_all_data(setup_test_environment):
    """Test reading the fresh, empty data file."""
    data = data_manager.get_all_data()
    assert "Products" in data
    assert "Salesmen" in data
    assert "TransactionLog" in data

    # Should only have the default salesman
    assert len(data["Products"]) == 0
    assert len(data["TransactionLog"]) == 0
    assert len(data["Salesmen"]) == 1
    assert data["Salesmen"][0]["SalesmanID"] == "S1"


def test_add_new_row(setup_test_environment):
    """Test adding a new row to the 'Products' sheet."""
    new_product = {
        "ProductID": "P101",
        "ProductName": "Test Product",
        "SellPrice": 1.99,
        "IsActive": True,
    }
    data_manager.add_new_row("Products", new_product)

    data = data_manager.get_all_data()
    assert len(data["Products"]) == 1
    assert data["Products"][0]["ProductID"] == "P101"
    assert data["Products"][0]["SellPrice"] == 1.99


def test_append_transaction(setup_test_environment):
    """Test adding a row to the 'TransactionLog' sheet."""
    tx_data = {
        "TransactionID": "T001",
        "Timestamp": "2025-10-29",
        "TransactionType": "SALE",
        "ProductID": "P101",  # Note: We're not validating this here, just testing the write
        "SalesmanID": "S1",
        "QuantityChange": -1,
    }
    data_manager.append_transaction(tx_data)

    data = data_manager.get_all_data()
    assert len(data["TransactionLog"]) == 1
    assert data["TransactionLog"][0]["TransactionID"] == "T001"
    assert data["TransactionLog"][0]["QuantityChange"] == -1


def test_update_row(setup_test_environment):
    """Test finding a row and updating it."""
    # First, add a product to update
    new_product = {
        "ProductID": "P101",
        "ProductName": "Test Product",
        "SellPrice": 1.99,
    }
    data_manager.add_new_row("Products", new_product)

    # Now, update it
    data_manager.update_row(
        "Products", "ProductID", "P101", {"SellPrice": 2.50, "IsActive": False}
    )

    data = data_manager.get_all_data()
    assert len(data["Products"]) == 1
    assert data["Products"][0]["SellPrice"] == 2.50
    assert data["Products"][0]["IsActive"] is False


def test_update_nonexistent_row(setup_test_environment):
    """Test that updating a non-existent row raises an error."""
    with pytest.raises(ValueError, match="No row found"):
        data_manager.update_row("Products", "ProductID", "P999", {"SellPrice": 1.00})
