variable "aws_region" {
  description = "AWS region to deploy ReevaNode infrastructure"
  type        = string
  default     = "us-east-1"
}

variable "app_name" {
  description = "Name used for ECR repo, ECS cluster and log group"
  type        = string
  default     = "reeva-node"
}

provider "aws" {
  region = var.aws_region
}

resource "aws_ecr_repository" "app" {
  name = var.app_name

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    app = var.app_name
    env = "prod"
  }
}

resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/ecs/${var.app_name}"
  retention_in_days = 14
}

resource "aws_ecs_cluster" "main" {
  name = "${var.app_name}-cluster"
}
