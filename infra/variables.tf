variable "prefix" {
  default = "exptracker"
  type    = string
}

variable "mongo_uri" {
  type = string
}

variable "mongo_db" {
  type = string
}

variable "port" {
  type = string
}

variable "NODE_ENV" {
  type = string
}

variable "CLIENT_JWT_SECRET" {
  type = string
}

variable "AZUREAD_APP_TENANT_ID" {
  type = string
}
