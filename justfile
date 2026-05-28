set dotenv-load
set positional-arguments

default:
    @just --list

frontend *args:
    cd frontend && \
      just {{ args }}

backend *args:
    cd backend && \
      just {{ args }}

build:
    just frontend build \
      && just backend build \

run *args: build
    just backend run {{ args }}
