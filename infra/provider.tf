provider "azurerm" {
  features {

  }
  use_cli         = true
  use_oidc        = false
  subscription_id = var.AZURE_SUBSCRIPTION_ID
}

# Configure the Azure AD Provider
provider "azuread" {
  use_oidc  = false
  tenant_id = var.AZUREAD_APP_TENANT_ID
}
