# Verteilte

Verteilte (German for "Distributed") is a modern, cross-platform spaced-repetition flashcard application designed to help you master German language efficiently. Built with **Tauri**, **Vue 3**, and **TypeScript**, it offers a native-like experience on both desktop and mobile devices.

## Features

*   **Spaced Repetition System (SRS)**: Optimizes learning by scheduling reviews at the most effective intervals.
*   **Interactive Flashcards**: Type your answers to reinforce memory, with immediate feedback.
*   **Smart Input**: Special handling for language-specific characters (e.g., auto-converting "ae" to "ä").
*   **Cross-Platform**: Runs on Linux and Android Others to be tested soon.
*   **Backend Syncing**: Syncs your progress across devices using a dedicated Node.js + PostgreSQL backend.

## Tech Stack

### Frontend (Client)
*   **Framework**: [Vue 3](https://vuejs.org/)
*   **Language**: [TypeScript](https://www.typescriptlang.org/)
*   **Build Tool**: [Vite](https://vitejs.dev/)
*   **Styling**: [Tailwind CSS](https://tailwindcss.com/)
*   **State Management**: [Pinia](https://pinia.vuejs.org/)
*   **Native Wrapper**: [Tauri v2](https://tauri.app/)

### Backend (Server)
*   **Runtime**: [Node.js](https://nodejs.org/)
*   **Framework**: [Express](https://expressjs.com/)
*   **Database**: [PostgreSQL](https://www.postgresql.org/)
*   **Authentication**: JWT & Bcrypt

## Getting Started

### Prerequisites

Ensure you have the following installed on your system:

*   **Node.js** (v18 or higher)
*   **Rust & Cargo** (Required for Tauri) - [Install Rust](https://www.rust-lang.org/tools/install)
*   **Docker & Docker Compose** (Required for the database)
*   **Android Studio / SDK** (Optional, for Android development)

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/sheaksadi/verteilte.git
    cd verteilte
    ```

2.  **Install Frontend Dependencies:**
    ```bash
    npm install
    ```

3.  **Install Backend Dependencies:**
    ```bash
    cd server
    npm install
    cd ..
    ```

## Development

The easiest way to start the development environment is using the provided helper script. This script spins up the Postgres database via Docker, starts the backend server, and launches the Tauri frontend.

### Quick Start

```bash
./start-dev.sh
```

### Manual Startup

If you prefer to run services individually:

1.  **Start the Database:**
    ```bash
    docker compose up -d
    ```

2.  **Start the Backend:**
    ```bash
    cd server
    npm run dev
    ```

3.  **Start the Frontend (Tauri):**
    ```bash
    # In a new terminal window, from the project root
    npm run tauri dev
    ```


## Mobile Development (Android)

To run on an Android emulator or device:

1.  Ensure you have the Android SDK and NDK configured.
2.  Run the Tauri Android dev command:
    ```bash
    npm run tauri android build
    ```


## AI Disclaimer

This project was developed with the heavy assistance of agentic coding models.
