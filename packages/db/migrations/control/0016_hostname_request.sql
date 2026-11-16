-- Final review (Sol delta C-8): the request that wrote a custom-hostname row. A domain request whose batch lost a
-- race undoes only the rows carrying ITS id, never a concurrent winner's rows (same tenant, same millisecond).
ALTER TABLE tenant_hostnames ADD COLUMN request_id TEXT;
