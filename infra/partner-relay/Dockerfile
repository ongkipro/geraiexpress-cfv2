# infra/partner-relay (spec 10 §5): stateless, no dependencies, non-root, read-only filesystem friendly.
FROM node:24-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5
WORKDIR /app
COPY relay.mjs server.mjs ./
USER node
ENV PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/healthz | grep -q '"ok":true' || exit 1
CMD ["node", "server.mjs"]
