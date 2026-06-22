terraform {
  required_version = ">= 1.7.0"
  required_providers {
    vault = {
      source  = "hashicorp/vault"
      version = "~> 4.2"
    }
  }
}

variable "service_slug" {
  description = "Slug of the service for the mount path"
  type        = string
}

variable "vault_addr" {
  description = "Vault server address"
  type        = string
  default     = "http://localhost:8200"
}

resource "vault_mount" "kv" {
  path        = "services/${var.service_slug}"
  type        = "kv"
  options     = { version = "2" }
  description = "Secrets for service ${var.service_slug} (managed by Infraena)"
}

resource "vault_policy" "service" {
  name   = "infraena-${var.service_slug}"
  policy = <<EOT
path "services/${var.service_slug}/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}
EOT
}

output "mount_path" {
  value = vault_mount.kv.path
}

output "policy_name" {
  value = vault_policy.service.name
}
