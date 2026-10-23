-- Lease-based job locks (work with pooled/serverless connections, unlike session advisory locks).
create table job_leases (
  job text primary key,
  holder text not null,
  locked_until timestamptz not null
);
