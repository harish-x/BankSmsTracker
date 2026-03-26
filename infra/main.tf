terraform {
  backend "azurerm" {
    resource_group_name  = "personal"
    storage_account_name = "harishpersonalacc"
    container_name       = "terraform"
    key                  = "terraform.tfstate"
  }

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
