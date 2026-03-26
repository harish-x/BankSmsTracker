provider "azurerm" {
  features {

  }
  use_cli         = true
  use_oidc        = false
  subscription_id = "2825ca34-e016-403b-b58b-3d95d178aaae"
}

# Configure the Azure AD Provider
provider "azuread" {
  use_oidc  = false
  tenant_id = "220b6d54-1b1d-403d-88a2-89cec756bc9a"
}
