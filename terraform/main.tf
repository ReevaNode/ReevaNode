# main.tf
# configuracion principal de terraform

terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # backend para state remoto (opcional, comentado por defecto)
  # backend "s3" {
  #   bucket = "reeva-terraform-state"
  #   key    = "reeva/terraform.tfstate"
  #   region = "us-east-1"
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

# data source para obtener la cuenta de aws
data "aws_caller_identity" "current" {}

# data source para availability zones
data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  app_name = "${var.project_name}-${var.environment}"

  common_tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}
