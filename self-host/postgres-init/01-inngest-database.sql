-- Runs once, when the Postgres volume is first created: a separate database
-- for the Inngest server, next to the app's own "rxj" database.
CREATE DATABASE inngest;
