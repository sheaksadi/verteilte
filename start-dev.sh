#!/bin/bash

# Start Docker database
echo "Starting database..."
docker compose up -d
# Wait for DB to be ready (simple sleep, or use wait-for-it logic if needed)
sleep 3

# Start backend
echo "Starting backend..."
cd server
npm run dev &
BACKEND_PID=$!

# Start frontend
echo "Starting frontend..."
cd ..
npm run tauri dev &
FRONTEND_PID=$!

# Handle cleanup
trap "kill $BACKEND_PID $FRONTEND_PID; docker compose down" EXIT

wait
