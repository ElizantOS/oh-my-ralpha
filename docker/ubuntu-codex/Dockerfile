FROM ubuntu:24.04 AS base

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

ARG DEBIAN_FRONTEND=noninteractive
ARG NODE_MAJOR=22
ARG CODEX_VERSION=0.121.0

ENV DEBIAN_FRONTEND="${DEBIAN_FRONTEND}" \
    CODEX_HOME="/root/.codex" \
    PATH="/root/.codex/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

RUN unset HTTP_PROXY http_proxy HTTPS_PROXY https_proxy ALL_PROXY all_proxy \
    && apt-get update \
    && apt-get install -y \
      ubuntu-standard \
      ca-certificates \
      curl \
      gnupg \
      git \
      rsync \
      build-essential \
      python3 \
      python3-pip \
      jq \
      less \
      lsb-release \
      locales \
      procps \
      ripgrep \
      tzdata \
      vim-tiny \
    && install -d -m 0755 /etc/apt/keyrings "${CODEX_HOME}/bin" \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
      | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" \
      > /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install -y nodejs \
    && npm install -g "@openai/codex@${CODEX_VERSION}" \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

RUN node --version \
    && npm --version \
    && codex --version

FROM base AS skill

ARG SKILL_BUILD_ID=local
LABEL org.opencontainers.image.title="oh-my-ralpha Codex sandbox" \
      org.opencontainers.image.description="Ubuntu Codex CLI sandbox with the current oh-my-ralpha skill baked in" \
      org.opencontainers.image.revision="${SKILL_BUILD_ID}"

WORKDIR /workspace

COPY . /workspace

CMD ["/bin/bash"]
