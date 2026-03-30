terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.6"
    }
    azuread = {
      source  = "hashicorp/azuread"
      version = "~> 3.1.0"
    }
  }
}

resource "azurerm_resource_group" "expensetracker-rg" {
  name     = "expense-tracker"
  location = "southindia"
}
