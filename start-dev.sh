#!/bin/bash

# Start Docker services (database and backend)
echo "Starting services..."
docker compose up -d --build

# Wait for services to be ready
echo "Waiting for services..."
sleep 5

# Start frontend
echo "Starting frontend..."
npm run tauri dev &
FRONTEND_PID=$!

# Handle cleanup
trap "kill $FRONTEND_PID; docker compose down" EXIT

wait
