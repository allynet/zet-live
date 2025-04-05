ARG RUST_VERSION='1.85'
ARG RUST_TARGET='x86_64-unknown-linux-gnu'
ARG BINARY_NAME='zet-live'

ARG APP_FEATURES=''

ARG RUN_USERNAME='app'
ARG RUN_USER_ID='1000'
ARG RUN_GROUP_ID='1000'

ARG RUNNER_CONTAINER="ubuntu:latest"

##########
# Step 0 #
##########
##
## Setup base image with cargo-chef
##
FROM rust:${RUST_VERSION} AS chef
# `curl` and `bash` are needed for cargo-binstall
# `musl-tools` and `musl-dev` are needed to build app with musl target
RUN apt-get update && apt-get install -y \
  curl \
  bash \
  musl-tools \
  musl-dev \
  jq \
  && rm -rf /var/lib/apt/lists/*
# Install cargo-binstall
RUN curl -L --proto '=https' --tlsv1.2 -sSf 'https://raw.githubusercontent.com/cargo-bins/cargo-binstall/main/install-from-binstall-release.sh' | bash
# Install cargo-chef
RUN cargo binstall cargo-chef --locked --no-confirm
# Add proper target and compile flags
ARG RUST_TARGET
RUN rustup target add "${RUST_TARGET}"
ENV RUSTFLAGS='-C target-feature=+crt-static'
WORKDIR /app


##########
# Step 1 #
##########
##
## Generate a build plan for rust dependencies
##
FROM chef AS planner
WORKDIR /chef
# Generate "lockfile" aka dependency dump
RUN --mount=type=bind,target=.,source=./backend \
  cargo chef prepare \
  --recipe-path /app/recipe.json


##########
# Step 2 #
##########
##
## Build frontend
##
FROM oven/bun:1 AS frontend
WORKDIR /app
COPY ./frontend/package.json ./frontend/bun.lock ./
RUN bun install
COPY ./frontend/ .
RUN if [ -f .env.docker ]; then mv .env.docker .env && echo "Copied .env.docker to .env" && cat .env; else echo "No .env.docker file found"; fi
RUN bun run build


##########
# Step 3 #
##########
##
## Build app with the cached dependencies
##
FROM chef AS builder
# Install upx - https://upx.github.io/
RUN cd "$(mktemp --directory)" && \
  curl -sL "$(\
  curl -sL https://api.github.com/repos/upx/upx/releases \
  | jq -r '.[0].assets | .[] | select(.name | test("amd64_linux")) | .browser_download_url' \
  | head -n1\
  )" | tar xvJ  && \
  cd * && \
  mv upx /usr/bin && \
  cd .. && \
  rm -rf "$(pwd)" && \
  echo "Installed upx"
RUN apt-get update && apt-get install -y protobuf-compiler
# Build dependencies
ARG RUST_TARGET
ARG APP_FEATURES
ARG BINARY_NAME
RUN --mount=from=planner,source=/app/recipe.json,target=/app/recipe.json \
  cargo chef cook \
  --release \
  --target "${RUST_TARGET}" \
  --features "${APP_FEATURES}" \
  --package "${BINARY_NAME}" \
  --recipe-path recipe.json
ARG RUST_TARGET
RUN rustup target add "${RUST_TARGET}"
# Copy rest of files and compile
# only the remaining app code
ARG RUST_TARGET
ARG APP_FEATURES
ARG BINARY_NAME
COPY --from=frontend /app/dist ../frontend/dist
RUN --mount=type=bind,target=.,source=./backend,rw \
  cargo build \
  --release \
  --target "${RUST_TARGET}" \
  --features "${APP_FEATURES}" \
  --package "${BINARY_NAME}" \
  && upx --best --lzma \
  "/app/target/${RUST_TARGET}/release/${BINARY_NAME}" \
  -o /"${BINARY_NAME}" \
  ;

##########
# Step 4 #
##########
##
## Run the app in a configured environment
##
FROM scratch
ARG BINARY_NAME
COPY --from=builder "/${BINARY_NAME}" /app
EXPOSE 9011
ENTRYPOINT [ "/app" ]
CMD [ "server" ]
