provider "aws" {
  region = "us-east-1"
}

resource "aws_ecr_repository" "app" {
  name = "demo-devops"
  image_scanning_configuration { scan_on_push = true }
  tags = { app = "demo-devops", env = "prod" }
}

resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/ecs/demo-devops"
  retention_in_days = 14
}

resource "aws_ecs_cluster" "main" {
  name = "demo-devops-cluster"
}
