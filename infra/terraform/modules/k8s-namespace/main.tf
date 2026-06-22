terraform {
  required_version = ">= 1.7.0"
  required_providers {
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.30"
    }
  }
}

variable "namespace_name" {
  description = "Name of the Kubernetes namespace"
  type        = string
}

variable "team" {
  description = "Team that owns this namespace"
  type        = string
  default     = "platform"
}

variable "labels" {
  description = "Additional labels for the namespace"
  type        = map(string)
  default     = {}
}

variable "resource_quota" {
  description = "Resource quota configuration"
  type = object({
    cpu_requests    = optional(string, "4")
    cpu_limits      = optional(string, "8")
    memory_requests = optional(string, "8Gi")
    memory_limits   = optional(string, "16Gi")
  })
  default = {}
}

resource "kubernetes_namespace_v1" "this" {
  metadata {
    name = var.namespace_name
    labels = merge(
      {
        "app.kubernetes.io/managed-by" = "idp"
        "idp.platform/team"            = var.team
        "idp.platform/service"         = var.namespace_name
      },
      var.labels
    )
    annotations = {
      "idp.platform/created-by" = "terraform-cloud"
      "idp.platform/created-at" = timestamp()
    }
  }
}

resource "kubernetes_resource_quota_v1" "this" {
  metadata {
    name      = "${var.namespace_name}-quota"
    namespace = kubernetes_namespace_v1.this.metadata[0].name
  }

  spec {
    hard = {
      "requests.cpu"    = var.resource_quota.cpu_requests
      "limits.cpu"      = var.resource_quota.cpu_limits
      "requests.memory" = var.resource_quota.memory_requests
      "limits.memory"   = var.resource_quota.memory_limits
    }
  }
}

resource "kubernetes_network_policy_v1" "deny_all" {
  metadata {
    name      = "${var.namespace_name}-deny-all"
    namespace = kubernetes_namespace_v1.this.metadata[0].name
  }

  spec {
    pod_selector {}
    policy_types = ["Ingress", "Egress"]
  }
}

resource "kubernetes_network_policy_v1" "allow_same_namespace" {
  metadata {
    name      = "${var.namespace_name}-allow-same-ns"
    namespace = kubernetes_namespace_v1.this.metadata[0].name
  }

  spec {
    pod_selector {}
    policy_types = ["Ingress"]
    ingress {
      from {
        namespace_selector {
          match_labels = {
            "kubernetes.io/metadata.name" = var.namespace_name
          }
        }
      }
    }
  }
}

resource "kubernetes_network_policy_v1" "allow_ingress" {
  metadata {
    name      = "${var.namespace_name}-allow-ingress"
    namespace = kubernetes_namespace_v1.this.metadata[0].name
  }

  spec {
    pod_selector {}
    policy_types = ["Ingress"]
    ingress {
      from {
        namespace_selector {
          match_labels = {
            "app.kubernetes.io/name" = "ingress-nginx"
          }
        }
      }
    }
  }
}

resource "kubernetes_service_account_v1" "this" {
  metadata {
    name      = var.namespace_name
    namespace = kubernetes_namespace_v1.this.metadata[0].name
    labels = {
      "app.kubernetes.io/managed-by" = "idp"
    }
  }
}

output "namespace" {
  value = kubernetes_namespace_v1.this.metadata[0].name
}

output "service_account" {
  value = kubernetes_service_account_v1.this.metadata[0].name
}
