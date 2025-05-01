#!/bin/bash
# filepath: d:\project\PgPaal\PGserver\start.sh

# Start the auth-service
echo "Starting auth-service..."
cd ./auth-service
npm install
npm start &
cd ..

# Start the property-service
echo "Starting property-service..."
cd ./property-service
npm install
npm start &
cd ..

# Start the room-service
echo "Starting room-service..."
cd ./room-service
npm install
npm start &
cd ..

# Start the tenant-service
echo "Starting tenant-service..."
cd ./tenant-service
npm install
npm start &
cd ..

# Start the payment-service
echo "Starting payment-service..."
cd ./payment-service
npm install
npm start &
cd ..

# Start the complaint-service
echo "Starting complaint-service..."
cd ./complaint-service
npm install
npm start &
cd ..

# Start the API Gateway
echo "Starting API Gateway..."
cd ./gateway
npm install
npm start &
cd ..

echo "Starting API Gateway..."
cd ./notification-service
npm install
npm start &
cd ..

echo "All services and the gateway have been started."