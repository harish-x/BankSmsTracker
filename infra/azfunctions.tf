
resource "azurerm_application_insights" "function_expensetracker_insights" {
  name                = "${var.prefix}-function-expensetracker-insights"
  resource_group_name = azurerm_resource_group.expensetracker-rg.name
  location            = azurerm_resource_group.expensetracker-rg.location
  application_type    = "web"
}

resource "azurerm_service_plan" "function_expensetracker_plan" {
  name                = "${var.prefix}-function-expensetracker-plan"
  resource_group_name = azurerm_resource_group.expensetracker-rg.name
  location            = azurerm_resource_group.expensetracker-rg.location
  os_type             = "Linux"
  sku_name            = "FC1"
}


resource "azurerm_function_app_flex_consumption" "function_app_expensetracker" {
  name                        = "${var.prefix}-function-expensetracker"
  resource_group_name         = azurerm_resource_group.expensetracker-rg.name
  location                    = azurerm_resource_group.expensetracker-rg.location
  service_plan_id             = azurerm_service_plan.function_expensetracker_plan.id
  storage_container_type      = "blobContainer"
  storage_container_endpoint  = "${azurerm_storage_account.expensetracker-storage-acc.primary_blob_endpoint}${azurerm_storage_container.function_expensetracker_container.name}"
  storage_authentication_type = "StorageAccountConnectionString"
  storage_access_key          = azurerm_storage_account.expensetracker-storage-acc.primary_access_key
  runtime_name                = "node"
  runtime_version             = "22"
  maximum_instance_count      = 50
  instance_memory_in_mb       = 2048

  site_config {
    application_insights_connection_string = azurerm_application_insights.function_expensetracker_insights.connection_string
  }
  identity {
    type = "SystemAssigned"
  }

  app_settings = {
    "AZURE_STORAGE_ACCOUNT_NAME"            = azurerm_storage_account.expensetracker-storage-acc.name
    storage_container_type                  = "blobContainer"
    storage_container_endpoint              = "${azurerm_storage_account.expensetracker-storage-acc.primary_blob_endpoint}${azurerm_storage_container.function_expensetracker_container.name}"
    storage_authentication_type             = "StorageAccountConnectionString"
    storage_access_key                      = azurerm_storage_account.expensetracker-storage-acc.primary_access_key
    "APPINSIGHTS_INSTRUMENTATIONKEY"        = azurerm_application_insights.function_expensetracker_insights.instrumentation_key
    "APPLICATIONINSIGHTS_CONNECTION_STRING" = azurerm_application_insights.function_expensetracker_insights.connection_string
    "APPINSIGHTS_SAMPLING_PERCENTAGE"       = "100"
    "MONGO_URI"                             = var.mongo_uri
    "MONGO_DB"                              = var.mongo_db
    "AZURE_SUBSCRIPTION_ID"                 = var.AZURE_SUBSCRIPTION_ID
    "RESOURCE_GROUP"                        = azurerm_resource_group.expensetracker-rg.name
    "JWT_SECRET"                            = var.CLIENT_JWT_SECRET
  }


  depends_on = [
    azurerm_application_insights.function_expensetracker_insights,
    azurerm_storage_container.function_expensetracker_container
  ]

}
