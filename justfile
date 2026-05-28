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
