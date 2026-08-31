# Catalogue seed data

**Placeholder, not founder-supplied.** Spec 23.1 makes the catalogue a launch
precondition owned by the founders, and 23.2 requires that the beachhead trade
decision (Open Question 1: roofing vs fit-out carpentry/painting vs electrical)
changes *data only*. These CSVs exist so the platform is usable in development
before that decision lands.

Replace these files with the founder spreadsheets and re-run the loader — it
upserts on each table's natural key, so re-running is safe and non-destructive:

    node scripts/seed-catalogue.mjs seed-data/

Nothing here is referenced by schema, code or tests. Deleting a row from a CSV
does not delete it from the database: retirement is `is_active = false` through
the admin screens (4.3), never a hard delete.
