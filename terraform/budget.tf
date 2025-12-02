# budget.tf
# alertas de presupuesto para no gastar de mas

resource "aws_budgets_budget" "monthly_cost" {
  name              = "${local.app_name}-monthly-budget"
  budget_type       = "COST"
  limit_amount      = "20"
  limit_unit        = "USD"
  time_unit         = "MONTHLY"
  time_period_start = "2025-01-01_00:00"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = ["pempeight8@gmail.com"]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = ["pempeight8@gmail.com"]
  }

  tags = {
    Name = "${local.app_name}-budget"
  }
}
