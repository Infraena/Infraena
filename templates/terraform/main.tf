terraform {
  required_version = ">= 1.7"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}
provider "aws" { region = var.region }
variable "region" { default = "us-east-1" }
variable "environment" { default = "staging" }
resource "aws_s3_bucket" "app" {
  bucket = "{{serviceName}}-${var.environment}"
}
