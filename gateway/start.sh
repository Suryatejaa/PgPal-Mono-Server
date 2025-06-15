#!/bin/bash
# filepath: gateway/start.sh

# Create logs directory
mkdir -p logs

# Start both services in background
echo "Starting API Gateway on port 4000..."
node server.js > logs/gateway.log 2>&1 &
GATEWAY_PID=$!

echo "Starting WebSocket Gateway on port 4011..."
node webSocketGateway.js > logs/websocket.log 2>&1 &
WEBSOCKET_PID=$!

# Function to handle shutdown
cleanup() {
    echo "Shutting down services..."
    kill $GATEWAY_PID $WEBSOCKET_PID
    wait $GATEWAY_PID $WEBSOCKET_PID
    echo "Services stopped"
    exit 0
}

# Handle shutdown signals
trap cleanup SIGTERM SIGINT

echo "Both services started successfully"
echo "API Gateway PID: $GATEWAY_PID"
echo "WebSocket Gateway PID: $WEBSOCKET_PID"

# Wait for processes
wait $GATEWAY_PID $WEBSOCKET_PID