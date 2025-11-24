FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 6900

CMD ["sh", "-c", "npm run build && npm start"]

# Install dependencies for Piper
RUN apk add --no-cache curl libc6-compat

# Setup Piper
WORKDIR /app/piper
RUN curl -L -o piper.tar.gz "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz" && \
    tar -xzf piper.tar.gz --strip-components=1 && \
    rm piper.tar.gz && \
    chmod +x piper

# Download Thorsten Model
WORKDIR /app/piper-model
RUN curl -L -o de_DE-thorsten-high.onnx "https://huggingface.co/Thorsten-Voice/Piper/resolve/main/de_DE-thorsten-high.onnx" && \
    curl -L -o de_DE-thorsten-high.onnx.json "https://huggingface.co/Thorsten-Voice/Piper/resolve/main/de_DE-thorsten-high.onnx.json"

WORKDIR /app
