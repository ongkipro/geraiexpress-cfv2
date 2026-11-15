-- Local-only synthetic tenants for `pnpm do:migrate --env local` (no real data; AGENTS.md example policy).
INSERT OR IGNORE INTO tenants (id, slug, name, status, routing_version, masking_enabled, tier_code, created_at, updated_at)
VALUES ('local-berkahjaya', 'berkahjaya', 'Berkah Jaya (contoh)', 'active', 1, 0, 'silver', 0, 0),
       ('local-probe', 'probe', 'Probe (sintetis)', 'active', 1, 0, 'silver', 0, 0);
INSERT OR IGNORE INTO tenant_hostnames (hostname, tenant_id, kind, role, state, created_at)
VALUES ('berkahjaya.gerai.localhost', 'local-berkahjaya', 'platform_subdomain', 'primary', 'active', 0),
       ('probe.gerai.localhost', 'local-probe', 'platform_subdomain', 'primary', 'active', 0);
