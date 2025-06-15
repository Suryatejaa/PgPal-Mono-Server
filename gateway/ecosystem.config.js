module.exports = {
    apps: [
        {
            name: 'api-gateway',
            script: 'server.js',
            env: {
                PORT: 4000,
                NODE_ENV: 'production'
            },
            error_file: './logs/gateway-error.log',
            out_file: './logs/gateway-out.log',
            log_file: './logs/gateway-combined.log',
            time: true,
            instances: 1,
            exec_mode: 'fork'
        },
        {
            name: 'websocket-gateway',
            script: 'webSocketGateway.js',
            env: {
                WEBSOCKET_PORT: 4011,
                NODE_ENV: 'production'
            },
            error_file: './logs/websocket-error.log',
            out_file: './logs/websocket-out.log',
            log_file: './logs/websocket-combined.log',
            time: true,
            instances: 1,
            exec_mode: 'fork'
        }
    ]
  };