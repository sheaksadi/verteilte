FROM node:20-alpine

WORKDIR /app

# Install pnpm via npm (Corepack failed)
RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

EXPOSE 6900

CMD ["pnpm", "run", "dev"]
