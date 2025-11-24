#!/bin/bash
set -e

# Directory setup
SERVER_DIR="$(dirname "$0")/.."
PIPER_DIR="$SERVER_DIR/piper"
DIST_DIR="$SERVER_DIR/../dist"

mkdir -p "$PIPER_DIR"

# Download Piper if not exists
if [ ! -f "$PIPER_DIR/piper" ]; then
    echo "Downloading Piper..."
    curl -L -o "$PIPER_DIR/piper.tar.gz" "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz"
    
    echo "Extracting Piper..."
    tar -xzf "$PIPER_DIR/piper.tar.gz" -C "$SERVER_DIR"
    rm "$PIPER_DIR/piper.tar.gz"
    
    # The tarball extracts to a 'piper' directory, so it might overwrite or merge. 
    # Let's ensure permissions
    chmod +x "$PIPER_DIR/piper"
    echo "Piper installed."
else
    echo "Piper already installed."
fi

# Move Model Files
echo "Moving model files..."
if [ -f "$DIST_DIR/de_DE-thorsten-high.onnx" ]; then
    cp "$DIST_DIR/de_DE-thorsten-high.onnx" "$PIPER_DIR/"
    cp "$DIST_DIR/de_DE-thorsten-high.onnx.json" "$PIPER_DIR/"
    echo "Model files moved."
else
    echo "Model files not found in dist!"
    # Fallback: Download if not present? 
    # For now, assume they are there as per file list.
fi

echo "Setup complete."
