#!/bin/bash

# Manual CORS Fix Deployment Script
# This script needs to be run on the production server to fix nginx CORS configuration

echo "🔧 Applying CORS fix to production server..."

# Backup current nginx configuration
sudo cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.backup.$(date +%Y%m%d-%H%M%S)

# Option 1: Apply the new CORS configuration
echo "📝 Option 1: Replace nginx CORS config with the provided configuration"
echo "Copy the contents of nginx-cors-fix.conf to your nginx configuration"

# Option 2: Disable nginx CORS entirely and let the application handle it
echo "📝 Option 2: Disable nginx CORS headers (recommended)"
echo "Comment out these lines in /etc/nginx/sites-available/default:"
echo "# add_header 'Access-Control-Allow-Origin' '*' always;"
echo "# add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS, PATCH' always;"
echo "# add_header 'Access-Control-Allow-Headers' 'Authorization, Content-Type, x-user, x-debug' always;"
echo "# add_header 'Access-Control-Allow-Credentials' 'true' always;"

echo ""
echo "🔄 After making changes, restart nginx:"
echo "sudo nginx -t && sudo systemctl reload nginx"

echo ""
echo "🚀 Then restart the application services:"
echo "cd /root/PgPal-Mono-Server"
echo "docker-compose down && docker-compose up -d"

echo ""
echo "✅ Test CORS after restart with:"
echo "curl -v -H 'Origin: https://tenant.purple-pgs.space' -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: Content-Type,Authorization' -X OPTIONS https://api.purple-pgs.space/api/auth-service/login"
