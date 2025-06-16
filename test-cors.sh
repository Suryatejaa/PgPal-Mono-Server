#!/bin/bash

echo "🧪 Testing CORS Configuration..."

BASE_URL="https://api.purple-pgs.space"
ORIGIN="https://tenant.purple-pgs.space"

echo "1. Testing preflight request..."
curl -v -X OPTIONS \
  -H "Origin: $ORIGIN" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type,Authorization" \
  "$BASE_URL/api/auth-service/login"

echo -e "\n\n2. Testing actual POST request..."
curl -v -X POST \
  -H "Origin: $ORIGIN" \
  -H "Content-Type: application/json" \
  -H "Cookie: test=value" \
  -d '{"credential":"test","password":"test","role":"tenant"}' \
  "$BASE_URL/api/auth-service/login"

echo -e "\n\n3. Testing direct auth service..."
curl -v -X OPTIONS \
  -H "Origin: $ORIGIN" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type,Authorization" \
  "http://localhost:4001/api/auth-service/login"

echo -e "\n✅ CORS test completed!"
