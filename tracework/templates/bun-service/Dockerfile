ARG BUN_BASE
FROM ${BUN_BASE}
WORKDIR /trusted
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY tsconfig.json .bun-version README.md ./
COPY src ./src
COPY harness ./harness
RUN chmod -R a+rX /trusted
USER 65532:65532
ENTRYPOINT []
