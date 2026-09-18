# Build on the exact Jenkins image already running on the server. This avoids
# changing the controller version while adding tools for the built-in executor.
ARG JENKINS_BASE=jenkins/jenkins:lts
FROM python:3.12-slim-bookworm AS python
FROM node:24-bookworm-slim AS node
FROM ghcr.io/foundry-rs/foundry:stable AS foundry
FROM ${JENKINS_BASE}

USER root

RUN set -eux; \
    apt-get update; \
    if apt-cache show libzbar0t64 >/dev/null 2>&1; then zbar=libzbar0t64; else zbar=libzbar0; fi; \
    if apt-cache show libglib2.0-0t64 >/dev/null 2>&1; then glib=libglib2.0-0t64; else glib=libglib2.0-0; fi; \
    apt-get install -y --no-install-recommends \
      build-essential curl libbz2-1.0 libffi8 libgl1 liblzma5 \
      libsqlite3-0 openssh-client openssl zlib1g "$zbar" "$glib"; \
    rm -rf /var/lib/apt/lists/*

COPY --from=python /usr/local/ /usr/local/
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules/ /usr/local/lib/node_modules/
COPY --from=foundry /usr/local/bin/forge /usr/local/bin/forge

RUN set -eux; \
    ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm; \
    python3.12 -c 'import _bz2, _ctypes, _lzma, _ssl, sqlite3, zlib'; \
    python3.12 -m venv /tmp/ci-venv; \
    /tmp/ci-venv/bin/python -m pip --version; \
    npm --version; \
    forge --version; \
    rm -rf /tmp/ci-venv

USER jenkins
