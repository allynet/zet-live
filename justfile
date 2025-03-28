set dotenv-load := true
set positional-arguments := true

default:
    @just --list

dev-watch-server *args:
    cd backend && \
    just dev-watch-server {{args}}

dev-run-server *args:
    cd backend && \
    just dev-run-server {{args}}