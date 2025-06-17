#!/bin/bash
# test-cors.sh

echo "🧪 Testing CORS locally..."

BASE_URL="http://api.purple-pgs.space:4000"
ORIGIN="http://tenant.purple-pgs.space:5173"

echo "1. Testing OPTIONS preflight..."
curl -X OPTIONS \
  -H "Origin: $ORIGIN" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" \
  "$BASE_URL/api/auth-service/login" \
  -v \
  -w "\n\nStatus: %{http_code}\nTime: %{time_total}s\n"

echo -e "\n2. Testing actual login..."
curl -X POST \
  -H "Origin: $ORIGIN" \
  -H "Content-Type: application/json" \
  -d '{"credential":"isha","password":"Surya@123","role":"tenant"}' \
  "$BASE_URL/api/auth-service/login" \
  -v \
  -w "\n\nStatus: %{http_code}\nTime: %{time_total}s\n"

echo -e "\n3. Testing health endpoint..."
curl "$BASE_URL/api/gateway/health" \
  -H "Origin: $ORIGIN" \
  -v