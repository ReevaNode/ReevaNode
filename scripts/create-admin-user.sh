#!/bin/bash
set -e

USER_POOL_ID=$1
ADMIN_EMAIL=$2
ADMIN_PASSWORD=$3
USERS_TABLE=${4:-"aws-cognito-jwt-login-dev-users"}

echo "========================================="
echo "Creating Admin User in Cognito"
echo "========================================="
echo "User Pool ID: $USER_POOL_ID"
echo "Admin Email: $ADMIN_EMAIL"
echo "DynamoDB Table: $USERS_TABLE"
echo ""

# Create admin user
echo "Creating user in Cognito..."
aws cognito-idp admin-create-user \
  --user-pool-id "$USER_POOL_ID" \
  --username "$ADMIN_EMAIL" \
  --user-attributes Name=email,Value="$ADMIN_EMAIL" Name=email_verified,Value=true \
  --message-action SUPPRESS \
  --region us-east-1

echo "User created successfully!"

# Set permanent password
echo "Setting permanent password..."
aws cognito-idp admin-set-user-password \
  --user-pool-id "$USER_POOL_ID" \
  --username "$ADMIN_EMAIL" \
  --password "$ADMIN_PASSWORD" \
  --permanent \
  --region us-east-1

echo "Password set successfully!"

# Confirm user (in case it's not confirmed)
echo "Confirming user..."
aws cognito-idp admin-confirm-sign-up \
  --user-pool-id "$USER_POOL_ID" \
  --username "$ADMIN_EMAIL" \
  --region us-east-1 2>/dev/null || echo "User already confirmed"

# Get user details to retrieve the userId (sub)
echo ""
echo "Retrieving user ID..."
USER_DATA=$(aws cognito-idp admin-get-user \
  --user-pool-id "$USER_POOL_ID" \
  --username "$ADMIN_EMAIL" \
  --region us-east-1)

USER_ID=$(echo "$USER_DATA" | grep -A 1 '"Name": "sub"' | grep '"Value"' | cut -d'"' -f4)

echo "User ID (sub): $USER_ID"

# Create user record in DynamoDB with full admin permissions
echo ""
echo "Creating user record in DynamoDB..."
CURRENT_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

aws dynamodb put-item \
  --table-name "$USERS_TABLE" \
  --region us-east-1 \
  --item "{
    \"userId\": {\"S\": \"$USER_ID\"},
    \"email\": {\"S\": \"$ADMIN_EMAIL\"},
    \"roles\": {\"L\": [{\"S\": \"admin\"}]},
    \"permissions\": {\"L\": [
      {\"S\": \"bienvenidos.read\"},
      {\"S\": \"bienvenidos.write\"},
      {\"S\": \"dashboard.read\"},
      {\"S\": \"dashboard.write\"},
      {\"S\": \"agenda.read\"},
      {\"S\": \"agenda.write\"},
      {\"S\": \"box.read\"},
      {\"S\": \"box.write\"},
      {\"S\": \"infobox.read\"},
      {\"S\": \"infobox.write\"},
      {\"S\": \"admin.database\"}
    ]},
    \"createdAt\": {\"S\": \"$CURRENT_TIME\"},
    \"updatedAt\": {\"S\": \"$CURRENT_TIME\"}
  }"

echo "User record created in DynamoDB!"

echo ""
echo "========================================="
echo "Admin user setup completed successfully!"
echo "========================================="
echo "Email: $ADMIN_EMAIL"
echo "User ID: $USER_ID"
echo "Status: CONFIRMED"
echo "Roles: admin"
echo "Permissions: 11 permissions (full access)"
echo "DynamoDB Table: $USERS_TABLE"
echo "========================================="
