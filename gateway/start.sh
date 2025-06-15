#!/bin/sh

# Create logs directory
mkdir -p logs

echo "🚀 Starting PG Paal Gateway Services..."

# Start API Gateway in background
echo "Starting API Gateway on port 4000..."
node server.js > logs/gateway.log 2>&1 &
GATEWAY_PID=$!

# Wait a moment for the first service to start
sleep 2

# Start WebSocket Gateway in background
echo "Starting WebSocket Gateway on port 4011..."
node webSocketGateway.js > logs/websocket.log 2>&1 &
WEBSOCKET_PID=$!

# Function to handle shutdown gracefully
cleanup() {
    echo "Shutting down services..."
    kill $GATEWAY_PID $WEBSOCKET_PID 2>/dev/null
    wait $GATEWAY_PID $WEBSOCKET_PID 2>/dev/null
    echo "Services stopped"
    exit 0
}

# Handle shutdown signals
trap cleanup SIGTERM SIGINT SIGQUIT

echo "✅ Both services started successfully"
echo "API Gateway PID: $GATEWAY_PID (Port 4000)"
echo "WebSocket Gateway PID: $WEBSOCKET_PID (Port 4011)"

# Wait for both processes
wait $GATEWAY_PID $WEBSOCKET_PID