resource "azurerm_storage_account" "expensetracker-storage-acc" {
  access_tier                     = "Hot"
  account_replication_type        = "LRS"
  account_tier                    = "Standard"
  location                        = azurerm_resource_group.expensetracker-rg.location
  name                            = "${var.prefix}storage"
  resource_group_name             = azurerm_resource_group.expensetracker-rg.name
  shared_access_key_enabled       = true
  default_to_oauth_authentication = false
  public_network_access_enabled   = true

  blob_properties {
    cors_rule {
      allowed_origins = ["*"]
      allowed_methods = [
        "GET",
        "PUT",
        "POST",
        "DELETE",
        "HEAD",
        "OPTIONS"
      ]
      allowed_headers    = ["*"]
      exposed_headers    = ["*"]
      max_age_in_seconds = 3600
    }
  }

  depends_on = [
    azurerm_resource_group.expensetracker-rg
  ]
}



resource "azurerm_storage_container" "function_expensetracker_container" {
  name               = "function-expensetracker-default"
  storage_account_id = azurerm_storage_account.expensetracker-storage-acc.id
}
